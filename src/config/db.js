import dns from 'node:dns';
import mongoose from 'mongoose';
import mongooseLeanVirtuals from 'mongoose-lean-virtuals';
import { env } from './env.js';

mongoose.set('strictQuery', true);

// Lets .lean({ virtuals: true }) return computed fields (set volume, goal progress).
mongoose.plugin(mongooseLeanVirtuals);

if (env.dnsServers.length > 0) {
  dns.setServers(env.dnsServers);
  console.log(`[db] using DNS servers ${env.dnsServers.join(', ')}`);
}

/**
 * On Vercel every request may hit a fresh module instance, but the container
 * is reused. Hanging the connection off globalThis means a warm invocation
 * reuses the open socket instead of dialling Atlas again - without it you pay
 * a full handshake per request and quickly exhaust the connection limit.
 */
const cache = (globalThis.__workoutTrackerMongo ??= { conn: null, promise: null });

let listenersBound = false;
function bindListeners() {
  if (listenersBound) return;
  listenersBound = true;

  mongoose.connection.on('connected', () => console.log('[db] connected'));
  mongoose.connection.on('error', (e) => console.error('[db] error:', e.message));
  mongoose.connection.on('disconnected', () => console.warn('[db] disconnected'));
}

export async function connectDB() {
  if (cache.conn && mongoose.connection.readyState === 1) return cache.conn;

  if (!cache.promise) {
    bindListeners();

    cache.promise = mongoose
      .connect(env.mongoUri, {
        serverSelectionTimeoutMS: env.dbServerSelectionTimeoutMs,
        // Building indexes on every cold start is wasted time in production;
        // `npm run seed` creates them once.
        autoIndex: !env.isProd,
        // A serverless instance handles one request at a time, so a large pool
        // just burns Atlas connections.
        maxPoolSize: env.isServerless ? 5 : 10,
      })
      .then((m) => {
        cache.conn = m.connection;
        return cache.conn;
      })
      .catch((err) => {
        // Clear the cached promise so the next invocation retries rather than
        // replaying this rejection forever.
        cache.promise = null;
        throw err;
      });
  }

  return cache.promise;
}

export async function disconnectDB() {
  if (mongoose.connection.readyState === 0) return;
  await mongoose.connection.close();
  cache.conn = null;
  cache.promise = null;
}

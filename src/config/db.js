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

export async function connectDB() {
  mongoose.connection.on('connected', () => console.log('[db] connected'));
  mongoose.connection.on('error', (e) => console.error('[db] error:', e.message));
  mongoose.connection.on('disconnected', () => console.warn('[db] disconnected'));

  await mongoose.connect(env.mongoUri, {
    serverSelectionTimeoutMS: 20000,
    autoIndex: true,
  });
  return mongoose.connection;
}

export async function disconnectDB() {
  await mongoose.connection.close();
}

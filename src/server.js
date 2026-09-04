// db.js must be imported before anything that compiles a model, so the global
// mongoose plugins are registered first.
import { connectDB, disconnectDB } from './config/db.js';
import { env } from './config/env.js';
import app from './app.js';

async function main() {
  await connectDB();

  const server = app.listen(env.port, env.host, () => {
    console.log(
      `[server] listening on http://localhost:${env.port}${env.apiPrefix} ` +
        `(bound to ${env.host}, ${env.nodeEnv})`
    );
  });

  const shutdown = async (signal) => {
    console.log(`\n[server] ${signal} received, shutting down`);
    server.close(async () => {
      await disconnectDB();
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10000).unref();
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('unhandledRejection', (err) => {
    console.error('[server] unhandled rejection:', err);
  });
}

main().catch((err) => {
  console.error('[server] failed to start:', err);
  process.exit(1);
});

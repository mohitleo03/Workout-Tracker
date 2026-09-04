/**
 * Vercel serverless entry point (routed to by the catch-all rewrite in vercel.json).
 *
 * `src/server.js` is the local equivalent: it opens the DB connection once and
 * then calls app.listen(). On Vercel there is no long-running process, so the
 * connection has to be established (or reused) at the start of each invocation
 * before the Express app sees the request.
 *
 * Everything under /api on Vercel becomes a function automatically; vercel.json
 * rewrites every incoming path here so Express keeps owning the routing.
 */
import { connectDB } from '../src/config/db.js';
import app from '../src/app.js';

export default async function handler(req, res) {
  try {
    // Cheap on a warm container - connectDB returns the cached connection.
    await connectDB();
  } catch (err) {
    console.error('[api] database unavailable:', err);
    res.statusCode = 503;
    res.setHeader('content-type', 'application/json');
    res.end(
      JSON.stringify({
        success: false,
        error: {
          message:
            'Database unavailable. Check MONGODB_URI and that this deployment is ' +
            'allowed through the Atlas network access list.',
        },
      })
    );
    return;
  }

  return app(req, res);
}

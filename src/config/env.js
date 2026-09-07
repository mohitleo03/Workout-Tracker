import dotenv from 'dotenv';
dotenv.config();

const required = ['MONGODB_URI', 'JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET'];
const missing = required.filter((key) => !process.env[key]);
if (missing.length > 0) {
  // Throw rather than process.exit: on a serverless platform exiting kills the
  // worker with an opaque error, whereas a thrown message shows up in the logs.
  throw new Error(
    `[env] Missing required environment variable(s): ${missing.join(', ')}. ` +
      'Locally these come from .env; on Vercel set them under ' +
      'Project Settings > Environment Variables.'
  );
}

/** Normalises "api/v1" / "/api/v1/" into "/api/v1". */
function normalisePrefix(value) {
  const trimmed = (value || '/api/v1').trim().replace(/\/+$/, '');
  if (!trimmed) return '';
  return trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
}

export const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: Number(process.env.PORT || 4000),

  // 0.0.0.0 so an emulator, a phone on the LAN and localhost can all reach it.
  // Set to 127.0.0.1 to accept local connections only.
  host: process.env.HOST || '0.0.0.0',

  // Where the API is mounted. Change this and the mobile app's API_BASE_URL
  // has to match.
  apiPrefix: normalisePrefix(process.env.API_PREFIX),

  mongoUri: process.env.MONGODB_URI,
  jwt: {
    accessSecret: process.env.JWT_ACCESS_SECRET,
    refreshSecret: process.env.JWT_REFRESH_SECRET,
    accessExpires: process.env.JWT_ACCESS_EXPIRES || '7d',
    refreshExpires: process.env.JWT_REFRESH_EXPIRES || '90d',
  },
  corsOrigin: process.env.CORS_ORIGIN || '*',
  isProd: (process.env.NODE_ENV || 'development') === 'production',

  // How long a new account gets, in days.
  trialDays: Number(process.env.TRIAL_DAYS) || 30,

  // Whether a new account is usable immediately. Off in production, where
  // accounts are approved by hand; on elsewhere so local work and the test
  // suites are not blocked behind that.
  autoActivateUsers: process.env.AUTO_ACTIVATE_USERS
    ? process.env.AUTO_ACTIVATE_USERS === 'true'
    : (process.env.NODE_ENV || 'development') !== 'production',

  // Vercel sets VERCEL=1 in every deployment and in `vercel dev`.
  isServerless: Boolean(process.env.VERCEL),

  // Kept short on serverless: the function itself is time-limited, so failing
  // fast with a clear error beats the platform killing us mid-handshake.
  dbServerSelectionTimeoutMs: Number(
    process.env.DB_SERVER_SELECTION_TIMEOUT_MS || (process.env.VERCEL ? 8000 : 20000)
  ),

  // Optional DNS override. Atlas mongodb+srv:// URIs need SRV lookups, which
  // some local resolvers, VPNs and corporate networks refuse. Set e.g.
  // DNS_SERVERS=8.8.8.8,1.1.1.1 to bypass the system resolver.
  dnsServers: (process.env.DNS_SERVERS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
};

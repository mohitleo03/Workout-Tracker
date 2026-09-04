import dotenv from 'dotenv';
dotenv.config();

const required = ['MONGODB_URI', 'JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET'];
for (const key of required) {
  if (!process.env[key]) {
    // eslint-disable-next-line no-console
    console.error(`[env] Missing required environment variable: ${key}`);
    process.exit(1);
  }
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

  // Optional DNS override. Atlas mongodb+srv:// URIs need SRV lookups, which
  // some local resolvers, VPNs and corporate networks refuse. Set e.g.
  // DNS_SERVERS=8.8.8.8,1.1.1.1 to bypass the system resolver.
  dnsServers: (process.env.DNS_SERVERS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
};

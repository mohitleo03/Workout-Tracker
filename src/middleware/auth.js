import { verifyAccessToken } from '../utils/jwt.js';
import { ApiError } from '../utils/ApiError.js';
import { User } from '../models/User.js';

export async function requireAuth(req, _res, next) {
  try {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) throw ApiError.unauthorized('Missing bearer token');

    let payload;
    try {
      payload = verifyAccessToken(token);
    } catch {
      throw ApiError.unauthorized('Invalid or expired token');
    }

    const user = await User.findById(payload.sub)
      .select('_id email name preferences isActive subscriptionExpiresAt');
    if (!user) throw ApiError.unauthorized('User no longer exists');

    req.user = user;
    req.userId = user._id;
    next();
  } catch (err) {
    next(err);
  }
}

/**
 * Blocks an account that has not been approved, or whose access has run out.
 *
 * Deliberately not part of requireAuth: the auth routes stay reachable so the
 * app can log in, read why it is blocked and show that, rather than looking
 * broken.
 */
export function requireActiveAccount(req, _res, next) {
  const user = req.user;
  if (!user) return next(ApiError.unauthorized('Not signed in'));

  if (!user.isActive) {
    return next(
      ApiError.forbidden('This account is waiting to be activated.', {
        code: 'ACCOUNT_PENDING',
      })
    );
  }

  const expiry = user.subscriptionExpiresAt;
  if (expiry && expiry.getTime() < Date.now()) {
    return next(
      ApiError.forbidden('Your subscription has ended.', {
        code: 'SUBSCRIPTION_EXPIRED',
        expiredAt: expiry,
      })
    );
  }

  next();
}

import { verifyAccessToken } from '../utils/jwt.js';
import { ApiError } from '../utils/ApiError.js';
import { User } from '../models/User.js';

/**
 * Whether a token was signed before the account's password was last reset.
 * JWT times are whole seconds, which is why the reset time is stored rounded
 * down: a token signed in the same second as the reset still counts.
 */
export function issuedBeforePasswordReset(payload, user) {
  if (!user.passwordChangedAt || !payload.iat) return false;
  return payload.iat * 1000 < user.passwordChangedAt.getTime();
}

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
      .select('_id email name role preferences isActive subscriptionExpiresAt emailVerified passwordChangedAt');
    if (!user) throw ApiError.unauthorized('User no longer exists');
    if (issuedBeforePasswordReset(payload, user)) {
      throw ApiError.unauthorized('Signed out after a password reset', { code: 'PASSWORD_RESET' });
    }

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

  // Whoever approves accounts must not be able to be locked out of doing so.
  if (user.role === 'admin') return next();

  // Only an explicit false: accounts from before sign-up codes have no value.
  if (user.emailVerified === false) {
    return next(
      ApiError.forbidden('Confirm your email address first.', { code: 'EMAIL_NOT_VERIFIED' })
    );
  }

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

/** Only for accounts with the admin role. Mount after requireAuth. */
export function requireAdmin(req, _res, next) {
  if (req.user?.role !== 'admin') {
    return next(ApiError.forbidden('Only an admin can do that.', { code: 'ADMIN_ONLY' }));
  }
  next();
}

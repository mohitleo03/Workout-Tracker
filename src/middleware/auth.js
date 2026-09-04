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

    const user = await User.findById(payload.sub).select('_id email name preferences');
    if (!user) throw ApiError.unauthorized('User no longer exists');

    req.user = user;
    req.userId = user._id;
    next();
  } catch (err) {
    next(err);
  }
}

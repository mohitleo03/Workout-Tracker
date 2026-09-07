import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { validate } from '../middleware/validate.js';
import { requireAuth } from '../middleware/auth.js';
import * as c from '../controllers/auth.controller.js';

const router = Router();

// Slow down credential stuffing without getting in a real user's way.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: { message: 'Too many attempts, try again later' } },
});

router.post('/register', authLimiter, validate(c.registerSchema), c.register);
router.post('/login', authLimiter, validate(c.loginSchema), c.login);
router.post('/refresh', validate(c.refreshSchema), c.refresh);

router.get('/me', requireAuth, c.me);
router.patch('/me', requireAuth, validate(c.updateMeSchema), c.updateMe);
router.post('/change-password', requireAuth, validate(c.changePasswordSchema), c.changePassword);
router.delete('/me', requireAuth, validate(c.deleteAccountSchema), c.deleteAccount);

export default router;

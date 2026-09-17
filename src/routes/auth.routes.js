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

// Anything that sends an email. Tighter than the rest: each one costs a
// message against the mail account's daily limit.
const codeLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: { message: 'Too many codes asked for, try again later' } },
});

router.post('/register', authLimiter, validate(c.registerSchema), c.register);
router.post('/login', authLimiter, validate(c.loginSchema), c.login);
router.post('/refresh', validate(c.refreshSchema), c.refresh);

// Confirming the email at sign-up. Signed in, but before the account is usable.
router.post('/verify-email/send', codeLimiter, requireAuth, c.sendVerification);
router.post('/verify-email', authLimiter, requireAuth, validate(c.verifyEmailSchema), c.verifyEmail);

// Forgotten password: no sign-in, by definition.
router.post('/forgot-password', codeLimiter, validate(c.forgotPasswordSchema), c.forgotPassword);
router.post('/reset-password', authLimiter, validate(c.resetPasswordSchema), c.resetPassword);

router.get('/me', requireAuth, c.me);
router.patch('/me', requireAuth, validate(c.updateMeSchema), c.updateMe);
// Rate limited like login: it checks a password, so it could be used to guess one.
router.post('/change-password', authLimiter, requireAuth, validate(c.changePasswordSchema), c.changePassword);
router.delete('/me', requireAuth, validate(c.deleteAccountSchema), c.deleteAccount);

export default router;

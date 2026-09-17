import { z } from 'zod';
import { User } from '../models/User.js';
import { env } from '../config/env.js';
import { FEATURE_KEYS } from '../config/features.js';
import { WorkoutSession } from '../models/WorkoutSession.js';
import { Plan } from '../models/Plan.js';
import { Goal } from '../models/Goal.js';
import { Exercise } from '../models/Exercise.js';
import { Food } from '../models/Food.js';
import { DietLog } from '../models/DietLog.js';
import { DietPlan } from '../models/DietPlan.js';
import { BodyMetric } from '../models/BodyMetric.js';
import { ExerciseNote } from '../models/ExerciseNote.js';
import { ApiError } from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { signAccessToken, signRefreshToken, verifyRefreshToken } from '../utils/jwt.js';
import { issuedBeforePasswordReset } from '../middleware/auth.js';
import { EmailCode } from '../models/EmailCode.js';
import { sendCode, useCode } from '../services/emailCodes.js';

export const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  name: z.string().trim().max(80).optional(),
});

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const refreshSchema = z.object({
  refreshToken: z.string().min(10),
});

const fourDigits = z.string().regex(/^\d{4}$/, 'Enter the 4-digit code');

export const verifyEmailSchema = z.object({ code: fourDigits });

export const forgotPasswordSchema = z.object({ email: z.string().email() });

export const resetPasswordSchema = z.object({
  email: z.string().email(),
  code: fourDigits,
  newPassword: z.string().min(6, 'Password must be at least 6 characters'),
});

export const updateMeSchema = z.object({
  name: z.string().trim().max(80).optional(),
  profile: z
    .object({
      heightCm: z.number().positive().nullable().optional(),
      birthDate: z.coerce.date().nullable().optional(),
      gender: z.enum(['male', 'female', 'other']).nullable().optional(),
    })
    .optional(),
  preferences: z
    .object({
      weightUnit: z.enum(['kg', 'lb']).optional(),
      restTimerDefaultSec: z.number().int().min(10).max(600).optional(),
      dailyCalorieTarget: z.number().positive().nullable().optional(),
      dailyProteinTarget: z.number().positive().nullable().optional(),
      dailyCarbsTarget: z.number().positive().nullable().optional(),
      dailyFatTarget: z.number().positive().nullable().optional(),
      mealRemindersEnabled: z.boolean().optional(),
      waterRemindersEnabled: z.boolean().optional(),
      weighInRemindersEnabled: z.boolean().optional(),
      workoutRemindersEnabled: z.boolean().optional(),
      overloadIncrement: z.number().positive().max(50).nullable().optional(),
      // The whole set of switches the user has touched; a switch left out
      // goes back to its default. featureDefaults is the server's to set.
      features: z
        .object(Object.fromEntries(FEATURE_KEYS.map((key) => [key, z.boolean().optional()])))
        .strict()
        .optional(),
      dailyWaterMl: z.number().min(0).max(20000).optional(),
      themeMode: z.enum(['system', 'dark', 'light']).nullable().optional(),
      accentColor: z
        .string()
        .regex(/^#[0-9a-fA-F]{6}$/, 'Use #RRGGBB')
        .nullable()
        .optional(),
      usualTrainingTime: z
        .string()
        .regex(/^([01][0-9]|2[0-3]):[0-5][0-9]$/, 'Use HH:mm')
        .nullable()
        .optional(),
    })
    .optional(),
});

export const deleteAccountSchema = z.object({
  // The password, so a stolen access token cannot erase an account.
  password: z.string().min(1),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(6, 'Password must be at least 6 characters'),
});

function authPayload(user) {
  return {
    user: user.toPublic(),
    accessToken: signAccessToken(user),
    refreshToken: signRefreshToken(user),
  };
}

export const register = asyncHandler(async (req, res) => {
  const { email, password, name } = req.body;

  const existing = await User.findOne({ email: email.toLowerCase() });

  // An address never confirmed does not belong to that sign-up yet. Whoever
  // can read the inbox can sign up with it again - otherwise a typo, or
  // someone else's attempt, would lock the real owner out of their own email.
  if (existing && existing.emailVerified === false) {
    existing.name = name || existing.name;
    await existing.setPassword(password);
    await existing.save();
    const verification = await trySendVerification(existing.email);
    return res.status(201).json({ success: true, data: { ...authPayload(existing), verification } });
  }
  if (existing) throw ApiError.conflict('An account with that email already exists');

  const user = new User({
    email: email.toLowerCase(),
    name: name || '',
    // Access runs for a month from sign-up.
    subscriptionExpiresAt: new Date(Date.now() + env.trialDays * 24 * 60 * 60 * 1000),
    // Approved by hand in production. Locally, and in the test suites, waiting
    // on a manual step would block everything, so it is opt-out by config.
    isActive: env.autoActivateUsers,
    activatedAt: env.autoActivateUsers ? new Date() : null,
    // A new sign-up starts with the basic features on and the advanced ones
    // off. Accounts from before this never have it, and keep everything on.
    preferences: { featureDefaults: 'standard' },
    // Confirmed with the emailed code before the account can be used.
    emailVerified: false,
  });
  await user.setPassword(password);
  await user.save();

  const verification = await trySendVerification(user.email);
  res.status(201).json({ success: true, data: { ...authPayload(user), verification } });
});

/**
 * Sends the sign-up code without letting a mail problem fail the sign-up: the
 * account exists either way, and the app offers to send the code again.
 */
async function trySendVerification(email) {
  try {
    const { resendInSec } = await sendCode(email, 'verify_email');
    return { sent: true, resendInSec };
  } catch (err) {
    return {
      sent: false,
      resendInSec: err.details?.retryAfterSec ?? 0,
      message: err.message,
    };
  }
}

/** Emails a fresh sign-up code to the signed-in account. */
export const sendVerification = asyncHandler(async (req, res) => {
  const user = await User.findById(req.userId);
  if (!user) throw ApiError.notFound('User not found');
  if (user.emailVerified !== false) {
    return res.json({ success: true, data: { alreadyVerified: true } });
  }

  const { resendInSec } = await sendCode(user.email, 'verify_email');
  res.json({ success: true, data: { sentTo: user.email, resendInSec } });
});

/** Confirms the signed-in account's email with the code sent to it. */
export const verifyEmail = asyncHandler(async (req, res) => {
  const user = await User.findById(req.userId);
  if (!user) throw ApiError.notFound('User not found');

  if (user.emailVerified === false) {
    await useCode(user.email, 'verify_email', req.body.code);
    user.emailVerified = true;
    await user.save();
  }
  res.json({ success: true, data: user.toPublic() });
});

/**
 * Starts a password reset. The answer is the same whether or not an account
 * exists, so the form cannot be used to find out who has one.
 */
export const forgotPassword = asyncHandler(async (req, res) => {
  const email = req.body.email.toLowerCase();
  const user = await User.findOne({ email });

  let resendInSec = 60;
  if (user) {
    ({ resendInSec } = await sendCode(email, 'reset_password'));
  }
  res.json({
    success: true,
    data: {
      message: 'If an account exists for that email, a code is on its way.',
      resendInSec,
    },
  });
});

/**
 * Sets a new password with the emailed code, and signs in. Every session from
 * before stops working, and the email counts as confirmed: the code proves
 * the inbox is theirs.
 */
export const resetPassword = asyncHandler(async (req, res) => {
  const email = req.body.email.toLowerCase();
  const user = await User.findOne({ email }).select('+passwordHash');
  if (!user) {
    // Same wording as a wrong code, for the same reason as above.
    throw ApiError.badRequest('That code has expired. Ask for a new one.', { code: 'CODE_EXPIRED' });
  }

  await useCode(email, 'reset_password', req.body.code);

  await user.setPassword(req.body.newPassword);
  user.emailVerified = true;
  // Rounded down to the second, like a JWT's issue time, so the tokens
  // handed back below are not already out of date.
  user.passwordChangedAt = new Date(Math.floor(Date.now() / 1000) * 1000);
  await user.save();

  res.json({ success: true, data: authPayload(user) });
});

export const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  const user = await User.findOne({ email: email.toLowerCase() }).select('+passwordHash');
  if (!user) throw ApiError.unauthorized('Invalid email or password');

  const ok = await user.verifyPassword(password);
  if (!ok) throw ApiError.unauthorized('Invalid email or password');

  res.json({ success: true, data: authPayload(user) });
});

export const refresh = asyncHandler(async (req, res) => {
  const { refreshToken } = req.body;

  let payload;
  try {
    payload = verifyRefreshToken(refreshToken);
  } catch {
    throw ApiError.unauthorized('Invalid or expired refresh token');
  }

  const user = await User.findById(payload.sub);
  if (!user) throw ApiError.unauthorized('User no longer exists');
  if (issuedBeforePasswordReset(payload, user)) {
    throw ApiError.unauthorized('Signed out after a password reset', { code: 'PASSWORD_RESET' });
  }

  res.json({
    success: true,
    data: { accessToken: signAccessToken(user), refreshToken: signRefreshToken(user) },
  });
});

export const me = asyncHandler(async (req, res) => {
  const user = await User.findById(req.userId);
  if (!user) throw ApiError.notFound('User not found');
  res.json({ success: true, data: user.toPublic() });
});

export const updateMe = asyncHandler(async (req, res) => {
  const user = await User.findById(req.userId);
  if (!user) throw ApiError.notFound('User not found');

  const { name, profile, preferences } = req.body;
  if (name !== undefined) user.name = name;
  if (profile) Object.assign(user.profile, profile);
  if (preferences) Object.assign(user.preferences, preferences);

  await user.save();
  res.json({ success: true, data: user.toPublic() });
});

/**
 * Changes the password of the signed-in account.
 *
 * Signs out every other session, as a reset does - changing a password is
 * usually because someone else may know it - and hands this one fresh tokens
 * so it stays signed in.
 */
export const changePassword = asyncHandler(async (req, res) => {
  const user = await User.findById(req.userId).select('+passwordHash');
  if (!user) throw ApiError.notFound('User not found');

  const ok = await user.verifyPassword(req.body.currentPassword);
  // Not a 401: the session is fine, only the password typed was wrong, and a
  // 401 would read to the app as having been signed out.
  if (!ok) {
    throw ApiError.badRequest('Current password is incorrect', { code: 'WRONG_PASSWORD' });
  }
  if (await user.verifyPassword(req.body.newPassword)) {
    throw ApiError.badRequest('Choose a password different from your current one', {
      code: 'SAME_PASSWORD',
    });
  }

  await user.setPassword(req.body.newPassword);
  // Rounded down to the second, like a JWT's issue time, so the tokens
  // handed back below are not already out of date.
  user.passwordChangedAt = new Date(Math.floor(Date.now() / 1000) * 1000);
  await user.save();

  res.json({ success: true, data: authPayload(user) });
});

/**
 * Deletes the account and everything it owns.
 *
 * Password-gated: an access token alone must not be enough to erase someone's
 * training history. Catalog rows (owner null) are shared and are left alone -
 * only the caller's own custom exercises and foods go.
 */
export const deleteAccount = asyncHandler(async (req, res) => {
  const user = await User.findById(req.userId).select('+passwordHash');
  if (!user) throw ApiError.notFound('User not found');

  const ok = await user.verifyPassword(req.body.password);
  if (!ok) throw ApiError.unauthorized('Password is incorrect');

  const owner = user._id;
  const removed = {};
  for (const [key, Model] of Object.entries({
    sessions: WorkoutSession,
    plans: Plan,
    goals: Goal,
    exercises: Exercise,
    foods: Food,
    dietLogs: DietLog,
    dietPlans: DietPlan,
    bodyMetrics: BodyMetric,
    exerciseNotes: ExerciseNote,
  })) {
    const result = await Model.deleteMany({ owner });
    removed[key] = result.deletedCount;
  }

  await EmailCode.deleteMany({ email: user.email });
  await User.deleteOne({ _id: owner });

  res.json({ success: true, data: { message: 'Account deleted', removed } });
});

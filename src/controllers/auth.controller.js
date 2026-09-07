import { z } from 'zod';
import { User } from '../models/User.js';
import { env } from '../config/env.js';
import { WorkoutSession } from '../models/WorkoutSession.js';
import { Plan } from '../models/Plan.js';
import { Goal } from '../models/Goal.js';
import { Exercise } from '../models/Exercise.js';
import { Food } from '../models/Food.js';
import { DietLog } from '../models/DietLog.js';
import { DietPlan } from '../models/DietPlan.js';
import { BodyMetric } from '../models/BodyMetric.js';
import { ApiError } from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { signAccessToken, signRefreshToken, verifyRefreshToken } from '../utils/jwt.js';

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
  newPassword: z.string().min(6),
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
  });
  await user.setPassword(password);
  await user.save();

  res.status(201).json({ success: true, data: authPayload(user) });
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

export const changePassword = asyncHandler(async (req, res) => {
  const user = await User.findById(req.userId).select('+passwordHash');
  if (!user) throw ApiError.notFound('User not found');

  const ok = await user.verifyPassword(req.body.currentPassword);
  if (!ok) throw ApiError.unauthorized('Current password is incorrect');

  await user.setPassword(req.body.newPassword);
  await user.save();

  res.json({ success: true, data: { message: 'Password updated' } });
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
  })) {
    const result = await Model.deleteMany({ owner });
    removed[key] = result.deletedCount;
  }

  await User.deleteOne({ _id: owner });

  res.json({ success: true, data: { message: 'Account deleted', removed } });
});

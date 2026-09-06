import { z } from 'zod';
import { User } from '../models/User.js';
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
      usualTrainingTime: z
        .string()
        .regex(/^([01][0-9]|2[0-3]):[0-5][0-9]$/, 'Use HH:mm')
        .nullable()
        .optional(),
    })
    .optional(),
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

  const user = new User({ email: email.toLowerCase(), name: name || '' });
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

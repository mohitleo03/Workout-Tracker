import mongoose from 'mongoose';
import { z } from 'zod';
import { User } from '../models/User.js';
import { ApiError } from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';

const DAY_MS = 24 * 60 * 60 * 1000;

/** How long access runs for, from an approval or an extension. */
export const daysSchema = z
  .object({ days: z.number().int().min(1).max(366).default(30) })
  .default({});

const toRow = (user) => ({
  id: user._id,
  email: user.email,
  name: user.name,
  role: user.role || 'user',
  emailVerified: user.emailVerified !== false,
  isActive: user.isActive,
  activatedAt: user.activatedAt,
  subscriptionExpiresAt: user.subscriptionExpiresAt,
  accessState: user.accessState,
  createdAt: user.createdAt,
});

async function loadUser(id) {
  if (!mongoose.isValidObjectId(id)) throw ApiError.badRequest('Invalid user id');
  const user = await User.findById(id);
  if (!user) throw ApiError.notFound('User not found');
  return user;
}

/** Everyone, newest sign-up first - the one waiting for approval is usually new. */
export const listUsers = asyncHandler(async (_req, res) => {
  const users = await User.find({}).sort({ createdAt: -1 });
  res.json({ success: true, data: users.map(toRow) });
});

/**
 * Approves an account. Access runs for [days] from today, or keeps a later
 * expiry it already had - an account that waited a week for approval should
 * not have lost that week.
 */
export const activateUser = asyncHandler(async (req, res) => {
  const user = await loadUser(req.params.id);
  const fromToday = Date.now() + req.body.days * DAY_MS;

  user.isActive = true;
  user.activatedAt = user.activatedAt ?? new Date();
  user.subscriptionExpiresAt = new Date(
    Math.max(fromToday, user.subscriptionExpiresAt?.getTime() ?? 0)
  );
  await user.save();

  res.json({ success: true, data: toRow(user) });
});

/**
 * Adds [days] of access. Counted from the current expiry when that is still
 * ahead, so extending early never loses days; from today once it has passed.
 */
export const extendUser = asyncHandler(async (req, res) => {
  const user = await loadUser(req.params.id);
  const from = Math.max(Date.now(), user.subscriptionExpiresAt?.getTime() ?? 0);

  user.subscriptionExpiresAt = new Date(from + req.body.days * DAY_MS);
  await user.save();

  res.json({ success: true, data: toRow(user) });
});

/** Takes access away. The account and its data stay; it can be approved again. */
export const deactivateUser = asyncHandler(async (req, res) => {
  const user = await loadUser(req.params.id);
  if (String(user._id) === String(req.userId)) {
    throw ApiError.badRequest('You cannot deactivate your own account.');
  }

  user.isActive = false;
  await user.save();

  res.json({ success: true, data: toRow(user) });
});

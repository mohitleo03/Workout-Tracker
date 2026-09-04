import { z } from 'zod';
import { Exercise, MUSCLE_GROUPS } from '../models/Exercise.js';
import { ApiError } from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';

export const searchQuerySchema = z.object({
  q: z.string().trim().max(80).optional(),
  muscle: z.string().trim().optional(),
  equipment: z.string().trim().optional(),
  category: z.string().trim().optional(),
  mine: z.coerce.boolean().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(30),
});

export const createExerciseSchema = z.object({
  name: z.string().trim().min(2).max(120),
  primaryMuscles: z.array(z.string()).default([]),
  secondaryMuscles: z.array(z.string()).default([]),
  equipment: z.string().default('body only'),
  category: z.string().default('strength'),
  mechanic: z.string().nullable().optional(),
  force: z.string().nullable().optional(),
  level: z.string().default('intermediate'),
  instructions: z.array(z.string()).default([]),
  images: z.array(z.string().url()).default([]),
});

export const updateExerciseSchema = createExerciseSchema.partial();

/**
 * Search the catalog plus the caller's own custom exercises.
 * Substring match beats text search here because users type partial names
 * ("incl bench") and expect hits.
 */
export const searchExercises = asyncHandler(async (req, res) => {
  const { q, muscle, equipment, category, mine, page, limit } = req.validatedQuery;

  const filter = { $and: [] };

  // Catalog entries (owner null) plus anything this user created.
  filter.$and.push(mine ? { owner: req.userId } : { $or: [{ owner: null }, { owner: req.userId }] });

  if (q) {
    const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const rx = new RegExp(escaped, 'i');
    filter.$and.push({ $or: [{ searchName: rx }, { aliases: rx }] });
  }
  if (muscle) {
    filter.$and.push({ $or: [{ primaryMuscles: muscle }, { secondaryMuscles: muscle }] });
  }
  if (equipment) filter.$and.push({ equipment });
  if (category) filter.$and.push({ category });

  const query = filter.$and.length ? filter : {};
  const skip = (page - 1) * limit;

  const [items, total] = await Promise.all([
    Exercise.find(query).sort({ isCustom: -1, searchName: 1 }).skip(skip).limit(limit).lean(),
    Exercise.countDocuments(query),
  ]);

  res.json({
    success: true,
    data: items,
    meta: { page, limit, total, hasMore: skip + items.length < total },
  });
});

export const getExercise = asyncHandler(async (req, res) => {
  const exercise = await Exercise.findOne({
    _id: req.params.id,
    $or: [{ owner: null }, { owner: req.userId }],
  }).lean();
  if (!exercise) throw ApiError.notFound('Exercise not found');
  res.json({ success: true, data: exercise });
});

export const createExercise = asyncHandler(async (req, res) => {
  const exercise = await Exercise.create({
    ...req.body,
    owner: req.userId,
    isCustom: true,
    source: 'user',
  });
  res.status(201).json({ success: true, data: exercise });
});

export const updateExercise = asyncHandler(async (req, res) => {
  // Only custom exercises the caller owns are editable.
  const exercise = await Exercise.findOne({ _id: req.params.id, owner: req.userId });
  if (!exercise) throw ApiError.notFound('Custom exercise not found');

  Object.assign(exercise, req.body);
  await exercise.save();
  res.json({ success: true, data: exercise });
});

export const deleteExercise = asyncHandler(async (req, res) => {
  const result = await Exercise.deleteOne({ _id: req.params.id, owner: req.userId });
  if (result.deletedCount === 0) throw ApiError.notFound('Custom exercise not found');
  res.json({ success: true, data: { message: 'Deleted' } });
});

/** Facets for the filter chips in the app. */
export const getFilters = asyncHandler(async (req, res) => {
  const scope = { $or: [{ owner: null }, { owner: req.userId }] };
  const [equipment, categories] = await Promise.all([
    Exercise.distinct('equipment', scope),
    Exercise.distinct('category', scope),
  ]);
  res.json({
    success: true,
    data: {
      muscles: MUSCLE_GROUPS,
      equipment: equipment.filter(Boolean).sort(),
      categories: categories.filter(Boolean).sort(),
    },
  });
});

import { z } from 'zod';
import { Exercise, MUSCLE_GROUPS } from '../models/Exercise.js';
import { ExerciseNote } from '../models/ExerciseNote.js';
import { Goal } from '../models/Goal.js';
import { Plan } from '../models/Plan.js';
import { WorkoutSession } from '../models/WorkoutSession.js';
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
    // Accepts a comma-separated list, so the app can expand a broad group like
    // "back" into the catalog's fine-grained muscles (lats, middle back,
    // traps, lower back). A single value still works as before.
    const muscles = muscle
      .split(',')
      .map((m) => m.trim())
      .filter(Boolean);

    if (muscles.length > 0) {
      filter.$and.push({
        $or: [
          { primaryMuscles: { $in: muscles } },
          { secondaryMuscles: { $in: muscles } },
        ],
      });
    }
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

  const renamed = req.body.name !== undefined && req.body.name !== exercise.name;
  Object.assign(exercise, req.body);
  await exercise.save();

  // Workouts and goals keep a copy of the name, which is what records and
  // goal cards show. A rename is meant to be a rename everywhere, not only
  // from today on. Single-field updates, so no finished workout is re-saved
  // and its recorded duration recalculated.
  if (renamed) {
    await Promise.all([
      WorkoutSession.updateMany(
        { owner: req.userId, 'entries.exercise': exercise._id },
        { $set: { 'entries.$[e].exerciseName': exercise.name } },
        { arrayFilters: [{ 'e.exercise': exercise._id }] }
      ),
      Goal.updateMany(
        { owner: req.userId, exercise: exercise._id },
        { $set: { exerciseName: exercise.name } }
      ),
    ]);
  }

  res.json({ success: true, data: exercise });
});

/**
 * Deletes a custom exercise nobody depends on. One that is in the plan, a
 * logged workout or a goal is refused: deleting it would leave nameless rows
 * in all of them. Renaming is the way to fix a mistake in one of those.
 */
export const deleteExercise = asyncHandler(async (req, res) => {
  const exercise = await Exercise.findOne({ _id: req.params.id, owner: req.userId });
  if (!exercise) throw ApiError.notFound('Custom exercise not found');

  const [plans, workouts, goals] = await Promise.all([
    Plan.countDocuments({ owner: req.userId, 'days.exercises.exercise': exercise._id }),
    WorkoutSession.countDocuments({ owner: req.userId, 'entries.exercise': exercise._id }),
    Goal.countDocuments({ owner: req.userId, exercise: exercise._id }),
  ]);

  if (plans + workouts + goals > 0) {
    const uses = [
      plans > 0 && 'your plan',
      workouts > 0 && `${workouts} workout${workouts === 1 ? '' : 's'}`,
      goals > 0 && `${goals} goal${goals === 1 ? '' : 's'}`,
    ].filter(Boolean);
    throw ApiError.conflict(
      `${exercise.name} is used in ${uses.join(' and ')}, so it can't be deleted. You can rename it instead.`,
      { code: 'EXERCISE_IN_USE', plans, workouts, goals }
    );
  }

  await Promise.all([
    Exercise.deleteOne({ _id: exercise._id }),
    ExerciseNote.deleteMany({ owner: req.userId, exercise: exercise._id }),
  ]);
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

import { z } from 'zod';
import { WorkoutSession } from '../models/WorkoutSession.js';
import { Plan, SET_TYPES } from '../models/Plan.js';
import { Exercise } from '../models/Exercise.js';
import { ApiError } from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { dayStart } from '../utils/date.js';

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid id');

const dropSchema = z.object({
  weight: z.number(),
  reps: z.number().int().min(0),
  order: z.number().int().min(0).default(0),
});

export const setInputSchema = z.object({
  setNumber: z.number().int().min(1).optional(),
  reps: z.number().int().min(0).default(0),
  weight: z.number().default(0),
  unit: z.enum(['kg', 'lb']).default('kg'),
  setType: z.enum(SET_TYPES).default('normal'),
  isWarmup: z.boolean().default(false),
  forceDropSet: z.boolean().default(false),
  drops: z.array(dropSchema).default([]),
  rpe: z.number().min(1).max(10).nullable().optional(),
  durationSec: z.number().int().min(0).default(0),
  restSec: z.number().int().min(0).default(0),
  completed: z.boolean().default(true),
  completedAt: z.coerce.date().optional(),
  notes: z.string().max(500).default(''),
});

export const startSessionSchema = z.object({
  planId: objectId.nullable().optional(),
  planDayId: objectId.nullable().optional(),
  dayOfWeek: z.number().int().min(0).max(6).nullable().optional(),
  title: z.string().max(80).optional(),
  date: z.coerce.date().optional(),
  // When true, prefill entries from the matching plan day.
  fromPlan: z.boolean().default(true),
});

export const addEntrySchema = z.object({
  exercise: objectId,
  order: z.number().int().min(0).optional(),
  setType: z.enum(SET_TYPES).default('normal'),
  supersetGroup: z.string().nullable().optional(),
  notes: z.string().max(500).default(''),
  sets: z.array(setInputSchema).default([]),
  // Optional targets when an exercise is added mid-workout.
  targetSets: z.number().int().min(1).max(30).nullable().optional(),
  targetRepsMin: z.number().int().min(1).nullable().optional(),
  targetRepsMax: z.number().int().min(1).nullable().optional(),
  targetWeight: z.number().nullable().optional(),
  restSec: z.number().int().min(0).max(1800).nullable().optional(),
});

export const finishSessionSchema = z.object({
  endedAt: z.coerce.date().optional(),
  totalDurationSec: z.number().int().min(0).optional(),
  notes: z.string().max(2000).optional(),
  status: z.enum(['completed', 'abandoned']).default('completed'),
});

export const listQuerySchema = z.object({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  status: z.enum(['in_progress', 'completed', 'abandoned']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

async function loadOwnedSession(sessionId, userId) {
  const session = await WorkoutSession.findOne({ _id: sessionId, owner: userId });
  if (!session) throw ApiError.notFound('Workout session not found');
  return session;
}

/** Start a session, optionally prefilled from the active plan's day. */
export const startSession = asyncHandler(async (req, res) => {
  const { planId, planDayId, dayOfWeek, title, date, fromPlan } = req.body;

  const existing = await WorkoutSession.findOne({ owner: req.userId, status: 'in_progress' });
  if (existing) {
    throw ApiError.conflict(
      'You already have a workout in progress. Finish or discard it before starting another.'
    );
  }

  const plan = planId
    ? await Plan.findOne({ _id: planId, owner: req.userId })
    : await Plan.findOne({ owner: req.userId, isActive: true });

  const now = new Date();
  const dow = dayOfWeek ?? now.getDay();

  let day = null;
  if (plan) {
    day = planDayId
      ? plan.days.id(planDayId)
      : plan.days.find((d) => d.dayOfWeek === dow) || null;
  }

  const entries = [];
  if (fromPlan && day && !day.isRestDay && day.exercises.length > 0) {
    const ids = day.exercises.map((e) => e.exercise);
    const exercises = await Exercise.find({ _id: { $in: ids } }).select('name').lean();
    const nameById = new Map(exercises.map((e) => [String(e._id), e.name]));

    const ordered = [...day.exercises].sort((a, b) => a.order - b.order);
    for (const [i, pe] of ordered.entries()) {
      entries.push({
        exercise: pe.exercise,
        exerciseName: nameById.get(String(pe.exercise)) || '',
        order: i,
        setType: pe.setType,
        supersetGroup: pe.supersetGroup,
        notes: pe.notes,
        // Snapshot the targets; the actual sets are logged live.
        targetSets: pe.targetSets,
        targetRepsMin: pe.targetRepsMin,
        targetRepsMax: pe.targetRepsMax,
        targetWeight: pe.targetWeight,
        restSec: pe.restSec,
        sets: [],
      });
    }
  }

  const session = await WorkoutSession.create({
    owner: req.userId,
    plan: plan?._id || null,
    planDayId: day?._id || null,
    title: title || day?.label || 'Workout',
    muscleGroups: day?.muscleGroups || [],
    date: dayStart(date || now),
    startedAt: now,
    status: 'in_progress',
    entries,
  });

  const populated = await session.populate('entries.exercise', 'name images primaryMuscles equipment');
  res.status(201).json({ success: true, data: populated });
});

export const getActiveSession = asyncHandler(async (req, res) => {
  const session = await WorkoutSession.findOne({ owner: req.userId, status: 'in_progress' })
    .populate('entries.exercise', 'name images primaryMuscles secondaryMuscles equipment instructions')
    .lean();
  res.json({ success: true, data: session || null });
});

export const listSessions = asyncHandler(async (req, res) => {
  const { from, to, status, page, limit } = req.validatedQuery;

  const filter = { owner: req.userId };
  if (status) filter.status = status;
  if (from || to) {
    filter.date = {};
    if (from) filter.date.$gte = dayStart(from);
    if (to) filter.date.$lte = dayStart(to);
  }

  const skip = (page - 1) * limit;
  const [items, total] = await Promise.all([
    WorkoutSession.find(filter)
      .sort({ date: -1, startedAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate('entries.exercise', 'name images primaryMuscles')
      .lean({ virtuals: true }),
    WorkoutSession.countDocuments(filter),
  ]);

  res.json({
    success: true,
    data: items,
    meta: { page, limit, total, hasMore: skip + items.length < total },
  });
});

export const getSession = asyncHandler(async (req, res) => {
  const session = await WorkoutSession.findOne({ _id: req.params.id, owner: req.userId })
    .populate('entries.exercise', 'name images primaryMuscles secondaryMuscles equipment instructions')
    .lean({ virtuals: true });
  if (!session) throw ApiError.notFound('Workout session not found');
  res.json({ success: true, data: session });
});

/** Append an exercise to a running session. */
export const addEntry = asyncHandler(async (req, res) => {
  const session = await loadOwnedSession(req.params.id, req.userId);

  const exercise = await Exercise.findOne({
    _id: req.body.exercise,
    $or: [{ owner: null }, { owner: req.userId }],
  }).select('name');
  if (!exercise) throw ApiError.badRequest('Exercise not found');

  session.entries.push({
    ...req.body,
    exerciseName: exercise.name,
    order: req.body.order ?? session.entries.length,
  });
  await session.save();

  const populated = await session.populate('entries.exercise', 'name images primaryMuscles equipment');
  res.status(201).json({ success: true, data: populated });
});

export const removeEntry = asyncHandler(async (req, res) => {
  const session = await loadOwnedSession(req.params.id, req.userId);
  const entry = session.entries.id(req.params.entryId);
  if (!entry) throw ApiError.notFound('Exercise not found in this session');

  entry.deleteOne();
  await session.save();
  res.json({ success: true, data: session });
});

export const updateEntry = asyncHandler(async (req, res) => {
  const session = await loadOwnedSession(req.params.id, req.userId);
  const entry = session.entries.id(req.params.entryId);
  if (!entry) throw ApiError.notFound('Exercise not found in this session');

  const { setType, supersetGroup, notes, order } = req.body;
  if (setType !== undefined) entry.setType = setType;
  if (supersetGroup !== undefined) entry.supersetGroup = supersetGroup;
  if (notes !== undefined) entry.notes = notes;
  if (order !== undefined) entry.order = order;

  await session.save();
  res.json({ success: true, data: session });
});

/** Log one completed set (including any drops) against an exercise. */
export const addSet = asyncHandler(async (req, res) => {
  const session = await loadOwnedSession(req.params.id, req.userId);
  const entry = session.entries.id(req.params.entryId);
  if (!entry) throw ApiError.notFound('Exercise not found in this session');

  const payload = { ...req.body };
  payload.setNumber = payload.setNumber ?? entry.sets.length + 1;
  payload.completedAt = payload.completedAt || new Date();
  payload.drops = (payload.drops || []).map((d, i) => ({ ...d, order: d.order ?? i }));

  entry.sets.push(payload);
  await session.save();

  res.status(201).json({ success: true, data: session });
});

export const updateSet = asyncHandler(async (req, res) => {
  const session = await loadOwnedSession(req.params.id, req.userId);
  const entry = session.entries.id(req.params.entryId);
  if (!entry) throw ApiError.notFound('Exercise not found in this session');
  const set = entry.sets.id(req.params.setId);
  if (!set) throw ApiError.notFound('Set not found');

  Object.assign(set, req.body);
  if (req.body.drops) {
    set.drops = req.body.drops.map((d, i) => ({ ...d, order: d.order ?? i }));
  }
  await session.save();

  res.json({ success: true, data: session });
});

export const deleteSet = asyncHandler(async (req, res) => {
  const session = await loadOwnedSession(req.params.id, req.userId);
  const entry = session.entries.id(req.params.entryId);
  if (!entry) throw ApiError.notFound('Exercise not found in this session');
  const set = entry.sets.id(req.params.setId);
  if (!set) throw ApiError.notFound('Set not found');

  set.deleteOne();
  entry.sets.forEach((s, i) => { s.setNumber = i + 1; });
  await session.save();

  res.json({ success: true, data: session });
});

/**
 * Record the rest that followed a set. The app calls this when the user taps
 * "start next set", handing back the seconds the rest timer counted.
 */
export const recordRest = asyncHandler(async (req, res) => {
  const session = await loadOwnedSession(req.params.id, req.userId);
  const entry = session.entries.id(req.params.entryId);
  if (!entry) throw ApiError.notFound('Exercise not found in this session');
  const set = entry.sets.id(req.params.setId);
  if (!set) throw ApiError.notFound('Set not found');

  const restSec = Number(req.body.restSec);
  if (!Number.isFinite(restSec) || restSec < 0) throw ApiError.badRequest('restSec must be >= 0');

  set.restSec = Math.round(restSec);
  await session.save();

  res.json({ success: true, data: { setId: set._id, restSec: set.restSec } });
});

export const finishSession = asyncHandler(async (req, res) => {
  const session = await loadOwnedSession(req.params.id, req.userId);
  if (session.status !== 'in_progress') throw ApiError.badRequest('Session is already closed');

  session.endedAt = req.body.endedAt || new Date();
  session.status = req.body.status;
  if (req.body.notes !== undefined) session.notes = req.body.notes;
  await session.save();

  // The in-app timer is the source of truth when it kept running in the
  // background; apply it after save() so the pre-save hook cannot clobber it.
  if (req.body.totalDurationSec != null) {
    session.totalDurationSec = req.body.totalDurationSec;
    await WorkoutSession.updateOne(
      { _id: session._id },
      { $set: { totalDurationSec: req.body.totalDurationSec } }
    );
  }

  res.json({ success: true, data: session });
});

export const deleteSession = asyncHandler(async (req, res) => {
  const result = await WorkoutSession.deleteOne({ _id: req.params.id, owner: req.userId });
  if (result.deletedCount === 0) throw ApiError.notFound('Workout session not found');
  res.json({ success: true, data: { message: 'Deleted' } });
});

/**
 * The last time this exercise was trained, so the app can prefill
 * weights and show "last time you did 60kg x 8".
 */
export const getLastPerformance = asyncHandler(async (req, res) => {
  const session = await WorkoutSession.findOne({
    owner: req.userId,
    status: 'completed',
    'entries.exercise': req.params.exerciseId,
  })
    .sort({ date: -1 })
    .lean({ virtuals: true });

  if (!session) return res.json({ success: true, data: null });

  const entry = session.entries.find((e) => String(e.exercise) === String(req.params.exerciseId));
  res.json({
    success: true,
    data: entry ? { date: session.date, sessionId: session._id, sets: entry.sets } : null,
  });
});

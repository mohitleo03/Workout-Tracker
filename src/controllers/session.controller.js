import { z } from 'zod';
import { WorkoutSession } from '../models/WorkoutSession.js';
import { Plan, SET_TYPES, EXERCISE_KINDS } from '../models/Plan.js';
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
  // Deliberate opt-in to training twice in one day. Without it a second
  // workout is refused, which is what keeps the common case simple.
  secondWorkout: z.boolean().default(false),
});

export const addEntrySchema = z.object({
  exercise: objectId,
  order: z.number().int().min(0).optional(),
  setType: z.enum(SET_TYPES).default('normal'),
  kind: z.enum(EXERCISE_KINDS).default('strength'),
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

export const completeWarmupSchema = z.object({
  // Only used when the block was never formally started - normally the server
  // measures the elapsed time itself from warmupStartedAt.
  durationSec: z.number().int().min(0).max(7200).optional(),
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
  const { planId, planDayId, dayOfWeek, title, date, fromPlan, secondWorkout } = req.body;

  const existing = await WorkoutSession.findOne({ owner: req.userId, status: 'in_progress' });
  if (existing) {
    throw ApiError.conflict(
      'You already have a workout in progress. Finish or discard it before starting another.'
    );
  }

  // One workout a day is the norm: nobody trains chest twice on a Tuesday.
  // Enforced here rather than only in the app so a stale screen, a retried
  // request or a second device cannot quietly open a duplicate.
  const dayOf = dayStart(date || new Date());
  const doneToday = await WorkoutSession.countDocuments({
    owner: req.userId,
    date: dayOf,
    status: 'completed',
  });

  if (doneToday > 0 && !secondWorkout) {
    throw ApiError.conflict(
      'You have already finished a workout today. Start a second workout of the day if you really are training again.'
    );
  }

  // Abandoned attempts do not get a number - only real workouts count.
  const sequence = doneToday + 1;

  const plan = planId
    ? await Plan.findOne({ _id: planId, owner: req.userId })
    : await Plan.findOne({ owner: req.userId, isActive: true });

  const now = new Date();
  const dow = dayOfWeek ?? now.getDay();

  let day = null;
  if (plan) {
    // The second workout of a day follows its own plan, not the first one's.
    // Without a plan for this sequence the session starts empty rather than
    // repeating the muscles already trained a few hours ago.
    day = planDayId
      ? plan.days.id(planDayId)
      : plan.days.find(
          (d) => d.dayOfWeek === dow && (d.sequence || 1) === sequence
        ) || null;
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
        kind: pe.kind,
        supersetGroup: pe.supersetGroup,
        notes: pe.notes,
        // Snapshot the targets; the actual sets are logged live.
        targetSets: pe.targetSets,
        targetRepsMin: pe.targetRepsMin,
        targetRepsMax: pe.targetRepsMax,
        targetWeight: pe.targetWeight,
        restSec: pe.restSec,
        // Per-set plan, so set 3 can prefill its own load rather than set 1's.
        plannedSets: (pe.sets || []).map((s) => ({
          setNumber: s.setNumber,
          setType: s.setType,
          reps: s.reps,
          weight: s.weight,
          drops: (s.drops || []).map((d) => ({ weight: d.weight, reps: d.reps })),
          durationSec: s.durationSec,
          restSec: s.restSec,
        })),
        sets: [],
      });
    }
  }

  const session = await WorkoutSession.create({
    owner: req.userId,
    plan: plan?._id || null,
    planDayId: day?._id || null,
    // A second workout says so in its own name, so history is readable.
    title:
      title ||
      (sequence > 1
        ? day?.label
          ? `${day.label} (${sequence})`
          : `Workout ${sequence}`
        : day?.label || 'Workout'),
    sequence,
    muscleGroups: day?.muscleGroups || [],
    date: dayOf,
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

/**
 * The sets a warm-up drill should be credited with when the block finishes.
 *
 * The plan is the record: "20 of these, 10 of those" was declared up front,
 * which is the whole reason the block needs no per-drill tapping.
 */
function plannedSetsForEntry(entry) {
  if (entry.plannedSets && entry.plannedSets.length > 0) {
    return entry.plannedSets
      .slice()
      .sort((a, b) => a.setNumber - b.setNumber)
      .map((s, i) => ({
        setNumber: i + 1,
        setType: s.setType || 'normal',
        reps: s.reps ?? 0,
        weight: s.weight ?? 0,
        durationSec: s.durationSec ?? 0,
      }));
  }

  // Plans written before per-set editing only carry aggregates.
  const count = Math.max(1, entry.targetSets || 1);
  return Array.from({ length: count }, (_, i) => ({
    setNumber: i + 1,
    setType: 'normal',
    reps: entry.targetRepsMin ?? 0,
    weight: entry.targetWeight ?? 0,
    durationSec: 0,
  }));
}

/** Marks the start of the warm-up block. Re-tapping does not restart it. */
export const startWarmup = asyncHandler(async (req, res) => {
  const session = await loadOwnedSession(req.params.id, req.userId);
  if (session.status !== 'in_progress') throw ApiError.badRequest('Session is already closed');

  if (!session.entries.some((e) => e.kind === 'warmup')) {
    throw ApiError.badRequest('This workout has no warm-up exercises.');
  }

  // Keeping the original start means a double tap costs no elapsed time.
  if (!session.warmupStartedAt) {
    session.warmupStartedAt = new Date();
    await session.save();
  }

  res.json({ success: true, data: session });
});

/**
 * Closes the warm-up block: every warm-up drill is credited with the sets its
 * plan declared, in one round trip, and the block's elapsed time is stored.
 *
 * Idempotent - a retry after a timeout finds the drills already logged and
 * returns the session rather than doubling them up.
 */
export const completeWarmup = asyncHandler(async (req, res) => {
  const session = await loadOwnedSession(req.params.id, req.userId);
  if (session.status !== 'in_progress') throw ApiError.badRequest('Session is already closed');

  const warmups = session.entries.filter((e) => e.kind === 'warmup');
  if (warmups.length === 0) throw ApiError.badRequest('This workout has no warm-up exercises.');

  const startedAt = session.warmupStartedAt;
  const elapsed = startedAt
    ? Math.max(0, Math.round((Date.now() - startedAt.getTime()) / 1000))
    : req.body.durationSec ?? 0;

  for (const entry of warmups) {
    if (entry.sets.length > 0) continue; // already credited
    entry.sets = plannedSetsForEntry(entry).map((s) => ({
      ...s,
      isWarmup: true,
      completed: true,
      completedAt: new Date(),
      restSec: 0,
    }));
  }

  // A retry keeps the first measurement rather than restarting the clock.
  if (!session.warmupSec) session.warmupSec = elapsed;
  session.warmupStartedAt = null;
  await session.save();

  const populated = await session.populate(
    'entries.exercise',
    'name images primaryMuscles equipment'
  );
  res.json({ success: true, data: populated });
});

export const finishSession = asyncHandler(async (req, res) => {
  const session = await loadOwnedSession(req.params.id, req.userId);
  if (session.status !== 'in_progress') throw ApiError.badRequest('Session is already closed');

  // A warm-up left running when the workout ends still gets its elapsed time,
  // rather than the block silently reading as zero.
  if (session.warmupStartedAt && !session.warmupSec) {
    session.warmupSec = Math.max(
      0,
      Math.round((Date.now() - session.warmupStartedAt.getTime()) / 1000)
    );
  }
  session.warmupStartedAt = null;

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

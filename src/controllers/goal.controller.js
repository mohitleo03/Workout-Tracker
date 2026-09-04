import { z } from 'zod';
import { Goal, GOAL_TYPES } from '../models/Goal.js';
import { Exercise } from '../models/Exercise.js';
import { WorkoutSession } from '../models/WorkoutSession.js';
import { BodyMetric } from '../models/BodyMetric.js';
import { ApiError } from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid id');

export const createGoalSchema = z
  .object({
    title: z.string().trim().min(1).max(120),
    type: z.enum(GOAL_TYPES),
    exercise: objectId.nullable().optional(),
    measurement: z.string().nullable().optional(),
    startValue: z.number(),
    targetValue: z.number(),
    unit: z.string().default('kg'),
    direction: z.enum(['increase', 'decrease']).optional(),
    startDate: z.coerce.date().default(() => new Date()),
    targetDate: z.coerce.date(),
    notes: z.string().max(1000).default(''),
  })
  .refine((d) => d.targetDate > d.startDate, {
    message: 'targetDate must be after startDate',
    path: ['targetDate'],
  })
  .refine((d) => !['exercise_weight', 'exercise_reps'].includes(d.type) || !!d.exercise, {
    message: 'An exercise is required for exercise goals',
    path: ['exercise'],
  });

export const updateGoalSchema = z.object({
  title: z.string().trim().min(1).max(120).optional(),
  targetValue: z.number().optional(),
  targetDate: z.coerce.date().optional(),
  status: z.enum(['active', 'achieved', 'missed', 'archived']).optional(),
  notes: z.string().max(1000).optional(),
});

export const checkpointSchema = z.object({
  value: z.number(),
  date: z.coerce.date().default(() => new Date()),
  note: z.string().max(300).default(''),
  nextTarget: z.number().nullable().optional(),
});

export const listGoals = asyncHandler(async (req, res) => {
  const filter = { owner: req.userId };
  if (req.query.status) filter.status = req.query.status;

  const goals = await Goal.find(filter)
    .sort({ status: 1, targetDate: 1 })
    .populate('exercise', 'name images primaryMuscles')
    .lean({ virtuals: true });

  res.json({ success: true, data: goals });
});

export const getGoal = asyncHandler(async (req, res) => {
  const goal = await Goal.findOne({ _id: req.params.id, owner: req.userId })
    .populate('exercise', 'name images primaryMuscles')
    .lean({ virtuals: true });
  if (!goal) throw ApiError.notFound('Goal not found');
  res.json({ success: true, data: goal });
});

export const createGoal = asyncHandler(async (req, res) => {
  const body = { ...req.body };

  if (body.exercise) {
    const exercise = await Exercise.findOne({
      _id: body.exercise,
      $or: [{ owner: null }, { owner: req.userId }],
    }).select('name');
    if (!exercise) throw ApiError.badRequest('Exercise not found');
    body.exerciseName = exercise.name;
  }

  // Infer direction from the numbers when the client did not state it.
  if (!body.direction) {
    body.direction = body.targetValue >= body.startValue ? 'increase' : 'decrease';
  }

  const goal = await Goal.create({ ...body, owner: req.userId, currentValue: body.startValue });
  res.status(201).json({ success: true, data: goal.toJSON() });
});

export const updateGoal = asyncHandler(async (req, res) => {
  const goal = await Goal.findOne({ _id: req.params.id, owner: req.userId });
  if (!goal) throw ApiError.notFound('Goal not found');
  Object.assign(goal, req.body);
  await goal.save();
  res.json({ success: true, data: goal.toJSON() });
});

export const deleteGoal = asyncHandler(async (req, res) => {
  const result = await Goal.deleteOne({ _id: req.params.id, owner: req.userId });
  if (result.deletedCount === 0) throw ApiError.notFound('Goal not found');
  res.json({ success: true, data: { message: 'Deleted' } });
});

/** Record "I hit 65 kg this week, aiming for 75 next week". */
export const addCheckpoint = asyncHandler(async (req, res) => {
  const goal = await Goal.findOne({ _id: req.params.id, owner: req.userId });
  if (!goal) throw ApiError.notFound('Goal not found');

  goal.checkpoints.push(req.body);
  goal.checkpoints.sort((a, b) => a.date - b.date);
  await goal.save();

  res.status(201).json({ success: true, data: goal.toJSON() });
});

export const deleteCheckpoint = asyncHandler(async (req, res) => {
  const goal = await Goal.findOne({ _id: req.params.id, owner: req.userId });
  if (!goal) throw ApiError.notFound('Goal not found');

  const cp = goal.checkpoints.id(req.params.checkpointId);
  if (!cp) throw ApiError.notFound('Checkpoint not found');

  cp.deleteOne();
  await goal.save();
  res.json({ success: true, data: goal.toJSON() });
});

/**
 * Pull the latest real number for each active goal out of the training and
 * bodyweight logs, and record it as a checkpoint when it beats what we had.
 */
export const syncGoals = asyncHandler(async (req, res) => {
  const goals = await Goal.find({ owner: req.userId, status: 'active' });
  const updated = [];

  for (const goal of goals) {
    let value = null;

    if (goal.type === 'exercise_weight' && goal.exercise) {
      const [best] = await WorkoutSession.aggregate([
        { $match: { owner: goal.owner, status: 'completed' } },
        { $unwind: '$entries' },
        { $match: { 'entries.exercise': goal.exercise } },
        { $unwind: '$entries.sets' },
        { $match: { 'entries.sets.completed': true, 'entries.sets.isWarmup': false } },
        { $group: { _id: null, max: { $max: '$entries.sets.weight' } } },
      ]);
      value = best?.max ?? null;
    } else if (goal.type === 'exercise_reps' && goal.exercise) {
      const [best] = await WorkoutSession.aggregate([
        { $match: { owner: goal.owner, status: 'completed' } },
        { $unwind: '$entries' },
        { $match: { 'entries.exercise': goal.exercise } },
        { $unwind: '$entries.sets' },
        { $match: { 'entries.sets.completed': true } },
        { $group: { _id: null, max: { $max: '$entries.sets.reps' } } },
      ]);
      value = best?.max ?? null;
    } else if (goal.type === 'body_weight') {
      const latest = await BodyMetric.findOne({ owner: goal.owner, weightKg: { $ne: null } })
        .sort({ date: -1 })
        .lean();
      value = latest?.weightKg ?? null;
    } else if (goal.type === 'workout_count') {
      value = await WorkoutSession.countDocuments({
        owner: goal.owner,
        status: 'completed',
        date: { $gte: goal.startDate, $lte: goal.targetDate },
      });
    }

    if (value == null) continue;

    const improved =
      goal.currentValue == null ||
      (goal.direction === 'increase' ? value > goal.currentValue : value < goal.currentValue);

    if (improved) {
      goal.currentValue = value;
      goal.checkpoints.push({ date: new Date(), value, note: 'Auto-synced from your logs' });
      await goal.save();
      updated.push(goal.toJSON());
    }
  }

  res.json({ success: true, data: { updated, count: updated.length } });
});

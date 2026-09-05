import { z } from 'zod';
import { Plan, SET_TYPES } from '../models/Plan.js';
import { Exercise } from '../models/Exercise.js';
import { ApiError } from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid id');

const plannedDrop = z.object({
  weight: z.number(),
  reps: z.number().int().min(0).nullable().optional(),
});

const plannedSet = z.object({
  setNumber: z.number().int().min(1),
  setType: z.enum(SET_TYPES).default('normal'),
  // Null is meaningful: "as many as possible" for failure and amrap sets.
  reps: z.number().int().min(0).nullable().optional(),
  weight: z.number().nullable().optional(),
  drops: z.array(plannedDrop).default([]),
  durationSec: z.number().int().min(0).max(7200).nullable().optional(),
  restSec: z.number().int().min(0).max(1800).nullable().optional(),
  notes: z.string().max(300).default(''),
});

const plannedExercise = z.object({
  exercise: objectId,
  order: z.number().int().min(0).default(0),
  setType: z.enum(SET_TYPES).default('normal'),
  supersetGroup: z.string().nullable().optional(),
  sets: z.array(plannedSet).max(30).default([]),
  targetSets: z.number().int().min(1).max(30).default(3),
  targetRepsMin: z.number().int().min(1).default(8),
  targetRepsMax: z.number().int().min(1).default(12),
  targetWeight: z.number().nullable().optional(),
  restSec: z.number().int().min(0).max(1800).default(90),
  notes: z.string().max(500).default(''),
});

const planDay = z.object({
  dayOfWeek: z.number().int().min(0).max(6),
  label: z.string().max(60).default(''),
  muscleGroups: z.array(z.string()).default([]),
  isRestDay: z.boolean().default(false),
  exercises: z.array(plannedExercise).default([]),
});

export const createPlanSchema = z.object({
  name: z.string().trim().min(1).max(80),
  description: z.string().max(500).default(''),
  isActive: z.boolean().default(false),
  days: z.array(planDay).default([]),
});

export const updatePlanSchema = createPlanSchema.partial();

export const upsertDaySchema = planDay;

export const listPlans = asyncHandler(async (req, res) => {
  const plans = await Plan.find({ owner: req.userId })
    .sort({ isActive: -1, updatedAt: -1 })
    .populate('days.exercises.exercise', 'name images primaryMuscles equipment')
    .lean();
  res.json({ success: true, data: plans });
});

export const getPlan = asyncHandler(async (req, res) => {
  const plan = await Plan.findOne({ _id: req.params.id, owner: req.userId })
    .populate('days.exercises.exercise', 'name images primaryMuscles secondaryMuscles equipment instructions')
    .lean();
  if (!plan) throw ApiError.notFound('Plan not found');
  res.json({ success: true, data: plan });
});

export const getActivePlan = asyncHandler(async (req, res) => {
  const plan = await Plan.findOne({ owner: req.userId, isActive: true })
    .populate('days.exercises.exercise', 'name images primaryMuscles secondaryMuscles equipment instructions')
    .lean();
  res.json({ success: true, data: plan || null });
});

/** The plan day matching a given weekday (defaults to today). */
export const getPlanForDay = asyncHandler(async (req, res) => {
  const dow = req.query.dayOfWeek != null ? Number(req.query.dayOfWeek) : new Date().getDay();
  if (Number.isNaN(dow) || dow < 0 || dow > 6) throw ApiError.badRequest('dayOfWeek must be 0-6');

  const plan = await Plan.findOne({ owner: req.userId, isActive: true })
    .populate('days.exercises.exercise', 'name images primaryMuscles secondaryMuscles equipment instructions')
    .lean();

  if (!plan) return res.json({ success: true, data: null });

  const day = plan.days.find((d) => d.dayOfWeek === dow) || null;
  res.json({
    success: true,
    data: { planId: plan._id, planName: plan.name, dayOfWeek: dow, day },
  });
});

async function assertExercisesVisible(userId, days) {
  const ids = [...new Set(days.flatMap((d) => d.exercises.map((e) => String(e.exercise))))];
  if (ids.length === 0) return;
  const count = await Exercise.countDocuments({
    _id: { $in: ids },
    $or: [{ owner: null }, { owner: userId }],
  });
  if (count !== ids.length) throw ApiError.badRequest('One or more exercises do not exist');
}

export const createPlan = asyncHandler(async (req, res) => {
  await assertExercisesVisible(req.userId, req.body.days || []);

  if (req.body.isActive) {
    await Plan.updateMany({ owner: req.userId, isActive: true }, { $set: { isActive: false } });
  }
  const plan = await Plan.create({ ...req.body, owner: req.userId });
  res.status(201).json({ success: true, data: plan });
});

export const updatePlan = asyncHandler(async (req, res) => {
  const plan = await Plan.findOne({ _id: req.params.id, owner: req.userId });
  if (!plan) throw ApiError.notFound('Plan not found');

  if (req.body.days) await assertExercisesVisible(req.userId, req.body.days);

  if (req.body.isActive === true) {
    await Plan.updateMany(
      { owner: req.userId, isActive: true, _id: { $ne: plan._id } },
      { $set: { isActive: false } }
    );
  }

  Object.assign(plan, req.body);
  await plan.save();
  res.json({ success: true, data: plan });
});

export const activatePlan = asyncHandler(async (req, res) => {
  const plan = await Plan.findOne({ _id: req.params.id, owner: req.userId });
  if (!plan) throw ApiError.notFound('Plan not found');

  await Plan.updateMany({ owner: req.userId }, { $set: { isActive: false } });
  plan.isActive = true;
  await plan.save();

  res.json({ success: true, data: plan });
});

/** Replace (or create) the configuration for one weekday inside a plan. */
export const upsertDay = asyncHandler(async (req, res) => {
  const plan = await Plan.findOne({ _id: req.params.id, owner: req.userId });
  if (!plan) throw ApiError.notFound('Plan not found');

  await assertExercisesVisible(req.userId, [req.body]);

  const idx = plan.days.findIndex((d) => d.dayOfWeek === req.body.dayOfWeek);
  if (idx >= 0) {
    plan.days[idx].set(req.body);
  } else {
    plan.days.push(req.body);
  }
  plan.days.sort((a, b) => a.dayOfWeek - b.dayOfWeek);
  await plan.save();

  const populated = await plan.populate(
    'days.exercises.exercise',
    'name images primaryMuscles equipment'
  );
  res.json({ success: true, data: populated });
});

export const deletePlan = asyncHandler(async (req, res) => {
  const result = await Plan.deleteOne({ _id: req.params.id, owner: req.userId });
  if (result.deletedCount === 0) throw ApiError.notFound('Plan not found');
  res.json({ success: true, data: { message: 'Deleted' } });
});

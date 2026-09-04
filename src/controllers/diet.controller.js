import { z } from 'zod';
import { DietPlan } from '../models/DietPlan.js';
import { DietLog } from '../models/DietLog.js';
import { Food } from '../models/Food.js';
import { ApiError } from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { dayStart, toDayKey } from '../utils/date.js';

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid id');
const timeString = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Time must be HH:mm');

const plannedItem = z.object({
  food: objectId,
  quantity: z.number().positive().default(100),
  unit: z.string().default('g'),
  order: z.number().int().min(0).default(0),
});

const meal = z.object({
  name: z.string().trim().min(1).max(60),
  time: timeString.default('08:00'),
  daysOfWeek: z.array(z.number().int().min(0).max(6)).default([]),
  reminderEnabled: z.boolean().default(true),
  reminderGraceMin: z.number().int().min(0).max(720).default(30),
  items: z.array(plannedItem).default([]),
  order: z.number().int().min(0).default(0),
});

export const upsertDietPlanSchema = z.object({
  name: z.string().trim().min(1).max(80).default('My daily diet'),
  isActive: z.boolean().default(true),
  meals: z.array(meal).default([]),
});

export const logItemSchema = z.object({
  food: objectId.nullable().optional(),
  foodName: z.string().trim().min(1).max(120).optional(),
  mealName: z.string().max(60).default('Other'),
  scheduledTime: timeString.nullable().optional(),
  quantity: z.number().positive().default(100),
  unit: z.string().default('g'),
  consumed: z.boolean().default(true),
  // Only needed for a free-text entry with no Food document behind it.
  macros: z
    .object({
      calories: z.number().min(0).default(0),
      protein: z.number().min(0).default(0),
      carbs: z.number().min(0).default(0),
      fat: z.number().min(0).default(0),
      sugar: z.number().min(0).default(0),
      fiber: z.number().min(0).default(0),
      sodium: z.number().min(0).default(0),
    })
    .optional(),
});

export const dayQuerySchema = z.object({
  date: z.string().optional(),
});

/* --------------------------------- plan ---------------------------------- */

export const getDietPlan = asyncHandler(async (req, res) => {
  const plan = await DietPlan.findOne({ owner: req.userId, isActive: true })
    .populate('meals.items.food')
    .lean();
  res.json({ success: true, data: plan || null });
});

export const upsertDietPlan = asyncHandler(async (req, res) => {
  const ids = [...new Set(req.body.meals.flatMap((m) => m.items.map((i) => i.food)))];
  if (ids.length) {
    const count = await Food.countDocuments({
      _id: { $in: ids },
      $or: [{ owner: null }, { owner: req.userId }],
    });
    if (count !== ids.length) throw ApiError.badRequest('One or more foods do not exist');
  }

  const plan = await DietPlan.findOneAndUpdate(
    { owner: req.userId, isActive: true },
    { $set: { ...req.body, owner: req.userId, isActive: true } },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  ).populate('meals.items.food');

  res.json({ success: true, data: plan });
});

/* ---------------------------------- log ---------------------------------- */

async function loadOrCreateLog(userId, dateInput) {
  const dayKey = toDayKey(dateInput);
  let log = await DietLog.findOne({ owner: userId, dayKey });
  if (!log) {
    log = new DietLog({ owner: userId, dayKey, date: dayStart(dayKey), items: [] });
  }
  return log;
}

/**
 * The day's log. On first read for a day we materialise the planned meals as
 * unconsumed rows so the app can render checkboxes straight away.
 */
export const getDayLog = asyncHandler(async (req, res) => {
  const dayKey = toDayKey(req.validatedQuery.date);
  const date = dayStart(dayKey);
  const dow = date.getUTCDay();

  let log = await DietLog.findOne({ owner: req.userId, dayKey });

  if (!log) {
    const plan = await DietPlan.findOne({ owner: req.userId, isActive: true }).populate(
      'meals.items.food'
    );

    const items = [];
    if (plan) {
      const meals = [...plan.meals].sort((a, b) => a.time.localeCompare(b.time));
      for (const m of meals) {
        if (m.daysOfWeek.length > 0 && !m.daysOfWeek.includes(dow)) continue;
        for (const it of [...m.items].sort((a, b) => a.order - b.order)) {
          if (!it.food) continue;
          const macros = it.food.macrosFor(it.quantity);
          items.push({
            food: it.food._id,
            foodName: it.food.name,
            mealName: m.name,
            scheduledTime: m.time,
            quantity: it.quantity,
            unit: it.unit || it.food.servingUnit,
            ...macros,
            consumed: false,
            fromPlan: true,
            planMealId: m._id,
            planItemId: it._id,
          });
        }
      }
    }

    log = new DietLog({ owner: req.userId, dayKey, date, items });
    await log.save();
  }

  const populated = await log.populate('items.food', 'name brand servingSize servingUnit');
  res.json({ success: true, data: populated });
});

/** Add an ad-hoc food (or a second helping) to a day. */
export const addLogItem = asyncHandler(async (req, res) => {
  const log = await loadOrCreateLog(req.userId, req.query.date);
  const body = req.body;

  let macros = body.macros;
  let foodName = body.foodName;
  let unit = body.unit;

  if (body.food) {
    const food = await Food.findOne({
      _id: body.food,
      $or: [{ owner: null }, { owner: req.userId }],
    });
    if (!food) throw ApiError.badRequest('Food not found');
    macros = food.macrosFor(body.quantity);
    foodName = foodName || food.name;
    unit = unit || food.servingUnit;
  }

  if (!foodName) throw ApiError.badRequest('foodName is required for a custom entry');
  if (!macros) throw ApiError.badRequest('macros are required when no food id is given');

  log.items.push({
    food: body.food || null,
    foodName,
    mealName: body.mealName,
    scheduledTime: body.scheduledTime || null,
    quantity: body.quantity,
    unit,
    ...macros,
    consumed: body.consumed,
    consumedAt: body.consumed ? new Date() : null,
    fromPlan: false,
  });

  await log.save();
  res.status(201).json({ success: true, data: log });
});

/** Tick / untick a planned item as eaten. */
export const toggleLogItem = asyncHandler(async (req, res) => {
  const log = await DietLog.findOne({ owner: req.userId, _id: req.params.logId });
  if (!log) throw ApiError.notFound('Diet log not found');

  const item = log.items.id(req.params.itemId);
  if (!item) throw ApiError.notFound('Item not found');

  const consumed = req.body.consumed ?? !item.consumed;
  item.consumed = consumed;
  item.consumedAt = consumed ? new Date() : null;

  await log.save();
  res.json({ success: true, data: log });
});

export const updateLogItem = asyncHandler(async (req, res) => {
  const log = await DietLog.findOne({ owner: req.userId, _id: req.params.logId });
  if (!log) throw ApiError.notFound('Diet log not found');

  const item = log.items.id(req.params.itemId);
  if (!item) throw ApiError.notFound('Item not found');

  // Rescale macros when the quantity changes and we still know the source food.
  if (req.body.quantity != null && item.food) {
    const food = await Food.findById(item.food);
    if (food) {
      const macros = food.macrosFor(req.body.quantity);
      Object.assign(item, macros);
    }
    item.quantity = req.body.quantity;
  }
  for (const key of ['mealName', 'scheduledTime', 'unit', 'consumed']) {
    if (req.body[key] !== undefined) item[key] = req.body[key];
  }

  await log.save();
  res.json({ success: true, data: log });
});

export const deleteLogItem = asyncHandler(async (req, res) => {
  const log = await DietLog.findOne({ owner: req.userId, _id: req.params.logId });
  if (!log) throw ApiError.notFound('Diet log not found');

  const item = log.items.id(req.params.itemId);
  if (!item) throw ApiError.notFound('Item not found');

  item.deleteOne();
  await log.save();
  res.json({ success: true, data: log });
});

export const setWater = asyncHandler(async (req, res) => {
  const log = await loadOrCreateLog(req.userId, req.query.date);
  log.waterMl = Math.max(0, Number(req.body.waterMl) || 0);
  await log.save();
  res.json({ success: true, data: log });
});

/**
 * Planned items whose time has passed by more than the grace period and that
 * are still unticked. The app turns these into local notifications.
 */
export const getPendingMeals = asyncHandler(async (req, res) => {
  const dayKey = toDayKey(req.validatedQuery.date);
  const log = await DietLog.findOne({ owner: req.userId, dayKey }).lean();
  if (!log) return res.json({ success: true, data: [] });

  const now = new Date();
  const nowMinutes = now.getHours() * 60 + now.getMinutes();

  const pending = log.items
    .filter((i) => i.fromPlan && !i.consumed && i.scheduledTime)
    .map((i) => {
      const [h, m] = i.scheduledTime.split(':').map(Number);
      return { item: i, dueMinutes: h * 60 + m };
    })
    .filter((x) => nowMinutes > x.dueMinutes)
    .map((x) => ({
      itemId: x.item._id,
      foodName: x.item.foodName,
      mealName: x.item.mealName,
      scheduledTime: x.item.scheduledTime,
      minutesLate: nowMinutes - x.dueMinutes,
    }));

  res.json({ success: true, data: pending });
});

/** Daily totals across a date range, for the diet trend chart. */
export const getDietSummary = asyncHandler(async (req, res) => {
  const days = Math.min(Number(req.query.days) || 7, 90);
  const to = dayStart(new Date());
  const from = new Date(to);
  from.setUTCDate(from.getUTCDate() - (days - 1));

  const logs = await DietLog.find({ owner: req.userId, date: { $gte: from, $lte: to } })
    .sort({ date: 1 })
    .select('dayKey date totals waterMl')
    .lean();

  res.json({ success: true, data: logs });
});

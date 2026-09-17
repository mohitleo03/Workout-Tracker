import mongoose from 'mongoose';
import { z } from 'zod';
import { Food } from '../models/Food.js';
import { DietLog } from '../models/DietLog.js';
import { DietPlan } from '../models/DietPlan.js';
import { ApiError } from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';

export const searchFoodQuerySchema = z.object({
  q: z.string().trim().max(80).optional(),
  category: z.string().trim().optional(),
  mine: z.coerce.boolean().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(30),
});

export const createFoodSchema = z.object({
  name: z.string().trim().min(1).max(120),
  brand: z.string().max(80).default(''),
  category: z.string().default('other'),
  servingSize: z.number().positive().default(100),
  servingUnit: z.string().default('g'),
  calories: z.number().min(0).default(0),
  protein: z.number().min(0).default(0),
  carbs: z.number().min(0).default(0),
  fat: z.number().min(0).default(0),
  sugar: z.number().min(0).default(0),
  fiber: z.number().min(0).default(0),
  sodium: z.number().min(0).default(0),
});

export const updateFoodSchema = createFoodSchema.partial();

/**
 * The foods this user logs most, most recently first among equals.
 *
 * Meals vary day to day but their components do not - chapati, rice, dal and
 * cucumber turn up in most of them. Surfacing those saves typing a search for
 * every single item.
 */
export const getRecentFoods = asyncHandler(async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 20, 50);
  const owner = new mongoose.Types.ObjectId(req.userId);

  const rows = await DietLog.aggregate([
    { $match: { owner } },
    { $unwind: '$items' },
    { $match: { 'items.food': { $ne: null } } },
    {
      $group: {
        _id: '$items.food',
        timesLogged: { $sum: 1 },
        lastLogged: { $max: '$date' },
        lastQuantity: { $last: '$items.quantity' },
      },
    },
    { $sort: { timesLogged: -1, lastLogged: -1 } },
    { $limit: limit },
    {
      $lookup: { from: 'foods', localField: '_id', foreignField: '_id', as: 'food' },
    },
    { $unwind: '$food' },
    // A food deleted since, or one belonging to somebody else, is not offered.
    {
      $match: {
        $or: [{ 'food.owner': null }, { 'food.owner': owner }],
      },
    },
    {
      $replaceRoot: {
        newRoot: {
          $mergeObjects: [
            '$food',
            { timesLogged: '$timesLogged', lastLogged: '$lastLogged', lastQuantity: '$lastQuantity' },
          ],
        },
      },
    },
  ]);

  res.json({ success: true, data: rows });
});

export const searchFoods = asyncHandler(async (req, res) => {
  const { q, category, mine, page, limit } = req.validatedQuery;

  const and = [mine ? { owner: req.userId } : { $or: [{ owner: null }, { owner: req.userId }] }];

  if (q) {
    const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    and.push({ searchName: new RegExp(escaped, 'i') });
  }
  if (category) and.push({ category });

  const filter = { $and: and };
  const skip = (page - 1) * limit;

  const [items, total] = await Promise.all([
    Food.find(filter).sort({ isCustom: -1, searchName: 1 }).skip(skip).limit(limit).lean(),
    Food.countDocuments(filter),
  ]);

  res.json({
    success: true,
    data: items,
    meta: { page, limit, total, hasMore: skip + items.length < total },
  });
});

export const createFood = asyncHandler(async (req, res) => {
  const food = await Food.create({ ...req.body, owner: req.userId, isCustom: true });
  res.status(201).json({ success: true, data: food });
});

export const updateFood = asyncHandler(async (req, res) => {
  const food = await Food.findOne({ _id: req.params.id, owner: req.userId });
  if (!food) throw ApiError.notFound('Custom food not found');
  Object.assign(food, req.body);
  await food.save();
  res.json({ success: true, data: food });
});

/**
 * Deletes a custom food. Days already logged keep their own copy of its name
 * and numbers, so they are unaffected - but the daily diet plan points at the
 * food itself, and would be left with a gap. That one is refused.
 */
export const deleteFood = asyncHandler(async (req, res) => {
  const food = await Food.findOne({ _id: req.params.id, owner: req.userId });
  if (!food) throw ApiError.notFound('Custom food not found');

  const inPlan = await DietPlan.countDocuments({
    owner: req.userId,
    'meals.items.food': food._id,
  });
  if (inPlan > 0) {
    throw ApiError.conflict(
      `${food.name} is in your daily diet plan, so it can't be deleted. Take it out of the plan first.`,
      { code: 'FOOD_IN_PLAN' }
    );
  }

  await Food.deleteOne({ _id: food._id });
  res.json({ success: true, data: { message: 'Deleted' } });
});

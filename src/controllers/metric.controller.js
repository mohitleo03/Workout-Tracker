import { z } from 'zod';
import { BodyMetric } from '../models/BodyMetric.js';
import { ApiError } from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { dayStart, toDayKey } from '../utils/date.js';

export const upsertMetricSchema = z.object({
  date: z.coerce.date().optional(),
  weightKg: z.number().positive().max(500).nullable().optional(),
  bodyFatPercent: z.number().min(0).max(80).nullable().optional(),
  measurements: z
    .object({
      chest: z.number().positive().nullable().optional(),
      waist: z.number().positive().nullable().optional(),
      hips: z.number().positive().nullable().optional(),
      leftArm: z.number().positive().nullable().optional(),
      rightArm: z.number().positive().nullable().optional(),
      leftThigh: z.number().positive().nullable().optional(),
      rightThigh: z.number().positive().nullable().optional(),
      neck: z.number().positive().nullable().optional(),
    })
    .optional(),
  note: z.string().max(300).optional(),
});

/** One row per day: logging twice updates the same entry. */
export const upsertMetric = asyncHandler(async (req, res) => {
  const dayKey = toDayKey(req.body.date);
  const { date, measurements, ...rest } = req.body;

  const update = { ...rest, owner: req.userId, dayKey, date: dayStart(dayKey) };
  if (measurements) {
    for (const [k, v] of Object.entries(measurements)) update[`measurements.${k}`] = v;
  }

  const metric = await BodyMetric.findOneAndUpdate(
    { owner: req.userId, dayKey },
    { $set: update },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );

  res.json({ success: true, data: metric });
});

export const listMetrics = asyncHandler(async (req, res) => {
  const days = Math.min(Number(req.query.days) || 90, 730);
  const from = dayStart(new Date());
  from.setUTCDate(from.getUTCDate() - (days - 1));

  const metrics = await BodyMetric.find({ owner: req.userId, date: { $gte: from } })
    .sort({ date: 1 })
    .lean();

  res.json({ success: true, data: metrics });
});

export const getLatestMetric = asyncHandler(async (req, res) => {
  const metric = await BodyMetric.findOne({ owner: req.userId }).sort({ date: -1 }).lean();
  res.json({ success: true, data: metric || null });
});

export const deleteMetric = asyncHandler(async (req, res) => {
  const result = await BodyMetric.deleteOne({ _id: req.params.id, owner: req.userId });
  if (result.deletedCount === 0) throw ApiError.notFound('Entry not found');
  res.json({ success: true, data: { message: 'Deleted' } });
});

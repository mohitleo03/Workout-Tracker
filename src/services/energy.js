import mongoose from 'mongoose';
import { WorkoutSession } from '../models/WorkoutSession.js';
import { Exercise } from '../models/Exercise.js';
import { BodyMetric } from '../models/BodyMetric.js';
import { estimateSessionCalories } from '../utils/calories.js';

/**
 * Everything the energy estimate needs that does not live on the session:
 * the user's current bodyweight, their best lift for each exercise in it, and
 * whether each one is a compound.
 */
export async function energyInputs(session, userId) {
  const exerciseIds = [...new Set(session.entries.map((e) => String(e.exercise)))];

  const [latestWeight, exercises, records] = await Promise.all([
    BodyMetric.findOne({ owner: userId, weightKg: { $ne: null } })
      .sort({ date: -1 })
      .select('weightKg')
      .lean(),
    Exercise.find({ _id: { $in: exerciseIds } }).select('mechanic').lean(),
    // Best estimated 1RM per exercise, so intensity is measured against this
    // user's own history rather than a generic table.
    WorkoutSession.aggregate([
      {
        $match: {
          owner: new mongoose.Types.ObjectId(userId),
          status: 'completed',
          'entries.exercise': { $in: exerciseIds.map((id) => new mongoose.Types.ObjectId(id)) },
        },
      },
      { $unwind: '$entries' },
      { $unwind: '$entries.sets' },
      { $match: { 'entries.sets.completed': true, 'entries.sets.isWarmup': false } },
      {
        $group: {
          _id: '$entries.exercise',
          best: {
            $max: {
              $multiply: [
                '$entries.sets.weight',
                { $add: [1, { $divide: ['$entries.sets.reps', 30] }] },
              ],
            },
          },
        },
      },
    ]),
  ]);

  return {
    bodyWeightKg: latestWeight?.weightKg ?? null,
    mechanicByExercise: new Map(exercises.map((e) => [String(e._id), e.mechanic])),
    bestE1RMByExercise: new Map(records.map((r) => [String(r._id), r.best])),
  };
}

/**
 * The estimate for one session, or null when it cannot be worked out - which
 * is almost always "this user has never recorded a bodyweight".
 */
export async function estimateFor(session, userId) {
  return estimateSessionCalories(session, await energyInputs(session, userId));
}

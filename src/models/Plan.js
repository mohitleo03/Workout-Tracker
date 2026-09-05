import mongoose from 'mongoose';

export const SET_TYPES = ['normal', 'warmup', 'drop', 'superset', 'amrap', 'failure', 'timed'];

/**
 * What kind of work an exercise is, so a day can be ordered the way it is
 * actually performed: warm up, lift, then cardio at the end (or cardio first).
 * Cardio and warm-up work is usually timed rather than counted in reps.
 */
export const EXERCISE_KINDS = ['warmup', 'strength', 'cardio'];

/** A planned weight reduction inside a drop set: "then 12.5 for 6". */
const plannedDropSchema = new mongoose.Schema(
  { weight: { type: Number, required: true }, reps: { type: Number, default: null, min: 0 } },
  { _id: false }
);

/**
 * One planned set. Sets within an exercise are independent, so a session can
 * ramp - 10kg x 12, then 12.5 x 12, then 15 x 6 dropping to 12.5 x 6.
 *
 * Which fields matter depends on setType:
 *   normal / warmup  weight + reps
 *   drop             weight + reps, plus `drops` for each reduction
 *   failure          weight only; reps are the outcome, so null means "as many
 *                    as possible" rather than "unset"
 *   amrap / timed    durationSec is the cap; reps are the outcome
 */
const plannedSetSchema = new mongoose.Schema(
  {
    setNumber: { type: Number, required: true, min: 1 },
    setType: { type: String, enum: SET_TYPES, default: 'normal' },

    reps: { type: Number, default: null, min: 0 },
    weight: { type: Number, default: null },

    drops: { type: [plannedDropSchema], default: [] },

    // Time cap for amrap/timed sets.
    durationSec: { type: Number, default: null, min: 0 },

    // Rest after this set. Null falls back to the exercise's restSec; a
    // superset's non-final exercise stores 0, since the pair is one set.
    restSec: { type: Number, default: null, min: 0 },

    notes: { type: String, default: '' },
  },
  { _id: true }
);

/** One exercise slot inside a planned day. */
const plannedExerciseSchema = new mongoose.Schema(
  {
    exercise: { type: mongoose.Schema.Types.ObjectId, ref: 'Exercise', required: true },
    order: { type: Number, default: 0 },
    setType: { type: String, enum: SET_TYPES, default: 'normal' },
    kind: { type: String, enum: EXERCISE_KINDS, default: 'strength' },

    // Exercises sharing a supersetGroup on the same day are performed back to
    // back with no rest between them; the rest belongs to the last one.
    supersetGroup: { type: String, default: null },

    // Per-set targets. Authoritative when present.
    sets: { type: [plannedSetSchema], default: [] },

    // Legacy aggregate targets, kept so plans written before per-set editing
    // still open. When `sets` is empty these expand into targetSets identical
    // sets; anything saved from the app now fills `sets` instead.
    targetSets: { type: Number, default: 3, min: 1, max: 30 },
    targetRepsMin: { type: Number, default: 8, min: 1 },
    targetRepsMax: { type: Number, default: 12, min: 1 },
    targetWeight: { type: Number, default: null },
    restSec: { type: Number, default: 90 },
    notes: { type: String, default: '' },
  },
  { _id: true }
);

// Keep the aggregates consistent with the per-set list, so older clients and
// the plan summary line stay correct without special-casing.
plannedExerciseSchema.pre('validate', function syncAggregates(next) {
  if (this.sets && this.sets.length > 0) {
    this.targetSets = this.sets.length;

    const reps = this.sets.map((s) => s.reps).filter((r) => typeof r === 'number' && r > 0);
    if (reps.length > 0) {
      this.targetRepsMin = Math.min(...reps);
      this.targetRepsMax = Math.max(...reps);
    }

    const weights = this.sets.map((s) => s.weight).filter((w) => typeof w === 'number');
    this.targetWeight = weights.length > 0 ? Math.max(...weights) : null;
  }
  next();
});

/** One day of the weekly split. dayOfWeek: 0 = Sunday ... 6 = Saturday. */
const planDaySchema = new mongoose.Schema(
  {
    dayOfWeek: { type: Number, required: true, min: 0, max: 6 },
    label: { type: String, default: '' }, // e.g. "Push A"
    muscleGroups: { type: [String], default: [] }, // e.g. ["chest", "biceps"]
    isRestDay: { type: Boolean, default: false },
    exercises: { type: [plannedExerciseSchema], default: [] },
  },
  { _id: true }
);

const planSchema = new mongoose.Schema(
  {
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    name: { type: String, required: true, trim: true },
    description: { type: String, default: '' },
    isActive: { type: Boolean, default: false },
    days: { type: [planDaySchema], default: [] },
  },
  { timestamps: true }
);

planSchema.index({ owner: 1, isActive: 1 });

export const Plan = mongoose.model('Plan', planSchema);

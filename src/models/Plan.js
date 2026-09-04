import mongoose from 'mongoose';

export const SET_TYPES = ['normal', 'warmup', 'drop', 'superset', 'amrap', 'failure', 'timed'];

/** One exercise slot inside a planned day. */
const plannedExerciseSchema = new mongoose.Schema(
  {
    exercise: { type: mongoose.Schema.Types.ObjectId, ref: 'Exercise', required: true },
    order: { type: Number, default: 0 },
    setType: { type: String, enum: SET_TYPES, default: 'normal' },

    // Exercises sharing a supersetGroup on the same day are performed back to back.
    supersetGroup: { type: String, default: null },

    targetSets: { type: Number, default: 3, min: 1, max: 30 },
    targetRepsMin: { type: Number, default: 8, min: 1 },
    targetRepsMax: { type: Number, default: 12, min: 1 },
    targetWeight: { type: Number, default: null },
    restSec: { type: Number, default: 90 },
    notes: { type: String, default: '' },
  },
  { _id: true }
);

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

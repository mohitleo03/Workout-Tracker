import mongoose from 'mongoose';

export const GOAL_TYPES = [
  'body_weight',     // reach X kg bodyweight
  'exercise_weight', // lift X kg on a given exercise
  'exercise_reps',   // hit X reps on a given exercise
  'workout_count',   // N workouts inside the window
  'body_measurement',
  'custom',
];

/** A user-recorded waypoint on the way to the target. */
const checkpointSchema = new mongoose.Schema(
  {
    date: { type: Date, required: true, default: Date.now },
    value: { type: Number, required: true },
    note: { type: String, default: '' },
    // Optional: what the user intends to hit by the next checkpoint.
    nextTarget: { type: Number, default: null },
    achieved: { type: Boolean, default: true },
  },
  { _id: true }
);

const goalSchema = new mongoose.Schema(
  {
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    title: { type: String, required: true, trim: true },
    type: { type: String, enum: GOAL_TYPES, required: true },

    // Only set for exercise_* goals.
    exercise: { type: mongoose.Schema.Types.ObjectId, ref: 'Exercise', default: null },
    exerciseName: { type: String, default: '' },
    measurement: { type: String, default: null }, // waist, arms, ... for body_measurement

    startValue: { type: Number, required: true },
    targetValue: { type: Number, required: true },
    currentValue: { type: Number, default: null },
    unit: { type: String, default: 'kg' },
    // Whether progress means going up (gain/lift more) or down (lose weight).
    direction: { type: String, enum: ['increase', 'decrease'], default: 'increase' },

    startDate: { type: Date, required: true, default: Date.now },
    targetDate: { type: Date, required: true },

    checkpoints: { type: [checkpointSchema], default: [] },
    status: {
      type: String,
      enum: ['active', 'achieved', 'missed', 'archived'],
      default: 'active',
      index: true,
    },
    achievedAt: { type: Date, default: null },
    notes: { type: String, default: '' },
  },
  { timestamps: true, toJSON: { virtuals: true }, toObject: { virtuals: true } }
);

goalSchema.index({ owner: 1, status: 1, targetDate: 1 });

/** 0-100 progress along startValue -> targetValue, clamped. */
goalSchema.virtual('progressPercent').get(function progressPercent() {
  const current = this.currentValue ?? this.startValue;
  const span = this.targetValue - this.startValue;
  if (span === 0) return current === this.targetValue ? 100 : 0;
  const pct = ((current - this.startValue) / span) * 100;
  return Math.max(0, Math.min(100, Math.round(pct * 10) / 10));
});

goalSchema.virtual('daysRemaining').get(function daysRemaining() {
  if (!this.targetDate) return null;
  return Math.ceil((this.targetDate - new Date()) / 86400000);
});

/** Latest checkpoint drives currentValue, and flips status when the target is met. */
goalSchema.methods.syncFromCheckpoints = function syncFromCheckpoints() {
  if (this.checkpoints.length > 0) {
    const latest = [...this.checkpoints].sort((a, b) => b.date - a.date)[0];
    this.currentValue = latest.value;
  } else if (this.currentValue == null) {
    this.currentValue = this.startValue;
  }

  if (this.status === 'active' && this.currentValue != null) {
    const hit =
      this.direction === 'increase'
        ? this.currentValue >= this.targetValue
        : this.currentValue <= this.targetValue;
    if (hit) {
      this.status = 'achieved';
      this.achievedAt = new Date();
    }
  }
  return this;
};

goalSchema.pre('save', function beforeSave(next) {
  this.syncFromCheckpoints();
  next();
});

export const Goal = mongoose.model('Goal', goalSchema);

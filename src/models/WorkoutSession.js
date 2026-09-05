import mongoose from 'mongoose';
import { SET_TYPES, EXERCISE_KINDS } from './Plan.js';

/**
 * A weight drop inside a single working set.
 * A set only counts as a real drop set when it has 2 or more drops, unless the
 * user explicitly flags it - see the isDropSet virtual below.
 */
const dropSchema = new mongoose.Schema(
  {
    weight: { type: Number, required: true },
    reps: { type: Number, required: true, min: 0 },
    order: { type: Number, default: 0 },
  },
  { _id: false }
);

const setSchema = new mongoose.Schema(
  {
    setNumber: { type: Number, required: true, min: 1 },
    reps: { type: Number, default: 0, min: 0 },
    weight: { type: Number, default: 0 },
    unit: { type: String, enum: ['kg', 'lb'], default: 'kg' },

    setType: { type: String, enum: SET_TYPES, default: 'normal' },
    isWarmup: { type: Boolean, default: false },
    // Explicit override: a single drop is not a drop set unless the user says so.
    forceDropSet: { type: Boolean, default: false },
    drops: { type: [dropSchema], default: [] },

    // How long the set itself took.
    durationSec: { type: Number, default: 0 },
    // Rest taken after this set, before the next one.
    restSec: { type: Number, default: 0 },

    completed: { type: Boolean, default: true },
    completedAt: { type: Date, default: Date.now },
    notes: { type: String, default: '' },
  },
  { _id: true, toJSON: { virtuals: true }, toObject: { virtuals: true } }
);

// Total reps across the top set plus every drop.
setSchema.virtual('totalReps').get(function totalReps() {
  return (this.reps || 0) + this.drops.reduce((s, d) => s + (d.reps || 0), 0);
});

// Volume = sum of weight x reps for the top set and each drop.
setSchema.virtual('volume').get(function volume() {
  const base = (this.weight || 0) * (this.reps || 0);
  return this.drops.reduce((s, d) => s + (d.weight || 0) * (d.reps || 0), base);
});

setSchema.virtual('isDropSet').get(function isDropSet() {
  return this.forceDropSet || this.drops.length >= 2;
});

const sessionExerciseSchema = new mongoose.Schema(
  {
    exercise: { type: mongoose.Schema.Types.ObjectId, ref: 'Exercise', required: true },
    exerciseName: { type: String, default: '' }, // denormalised for fast history reads
    order: { type: Number, default: 0 },
    setType: { type: String, enum: SET_TYPES, default: 'normal' },
    kind: { type: String, enum: EXERCISE_KINDS, default: 'strength' },
    supersetGroup: { type: String, default: null },
    sets: { type: [setSchema], default: [] },
    notes: { type: String, default: '' },

    // Copied from the plan when the session starts, so the app can show
    // "3 of 4 sets - target 8-12 @ 60kg" while you train, and so history
    // still shows what you were aiming for even if the plan changes later.
    targetSets: { type: Number, default: null },
    targetRepsMin: { type: Number, default: null },
    targetRepsMax: { type: Number, default: null },
    targetWeight: { type: Number, default: null },
    restSec: { type: Number, default: null },

    // Per-set plan for this exercise, snapshotted at start. Lets the workout
    // screen prefill set 3 with its own weight rather than repeating set 1's.
    plannedSets: {
      type: [
        {
          _id: false,
          setNumber: Number,
          setType: String,
          reps: { type: Number, default: null },
          weight: { type: Number, default: null },
          drops: { type: [{ _id: false, weight: Number, reps: Number }], default: [] },
          durationSec: { type: Number, default: null },
          restSec: { type: Number, default: null },
        },
      ],
      default: [],
    },
  },
  { _id: true, toJSON: { virtuals: true }, toObject: { virtuals: true } }
);

sessionExerciseSchema.virtual('totalVolume').get(function totalVolume() {
  return this.sets.reduce((s, set) => s + (set.volume || 0), 0);
});

const workoutSessionSchema = new mongoose.Schema(
  {
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    plan: { type: mongoose.Schema.Types.ObjectId, ref: 'Plan', default: null },
    planDayId: { type: mongoose.Schema.Types.ObjectId, default: null },

    title: { type: String, default: '' },
    muscleGroups: { type: [String], default: [] },

    date: { type: Date, required: true, index: true }, // UTC start of day
    startedAt: { type: Date, default: Date.now },
    endedAt: { type: Date, default: null },

    // Wall clock from start to finish.
    totalDurationSec: { type: Number, default: 0 },
    // Sum of set durations vs sum of rest periods.
    workDurationSec: { type: Number, default: 0 },
    restDurationSec: { type: Number, default: 0 },

    // The warm-up is performed as one block - one tap to start it, one when
    // the whole thing is done - rather than a tap per drill. warmupStartedAt
    // lives on the server so the elapsed time survives the app being killed
    // mid-warm-up, and so a phone with a wrong clock cannot skew it.
    warmupStartedAt: { type: Date, default: null },
    warmupSec: { type: Number, default: 0, min: 0 },

    status: {
      type: String,
      enum: ['in_progress', 'completed', 'abandoned'],
      default: 'in_progress',
      index: true,
    },
    entries: { type: [sessionExerciseSchema], default: [] },
    notes: { type: String, default: '' },

    // Denormalised roll-ups, recomputed on every save.
    totalVolume: { type: Number, default: 0 },
    totalSets: { type: Number, default: 0 },
    totalReps: { type: Number, default: 0 },
  },
  { timestamps: true, toJSON: { virtuals: true }, toObject: { virtuals: true } }
);

workoutSessionSchema.index({ owner: 1, date: -1 });
workoutSessionSchema.index({ owner: 1, status: 1 });
workoutSessionSchema.index({ owner: 1, 'entries.exercise': 1, date: -1 });

/** Recompute roll-ups so list and stat queries never have to walk the sets. */
workoutSessionSchema.methods.recalculate = function recalculate() {
  let volume = 0;
  let sets = 0;
  let reps = 0;
  let work = 0;
  let rest = 0;

  for (const entry of this.entries) {
    // Warm-up work is recorded but kept out of the roll-ups: six mobility
    // drills should not report as six of the day's sets, and the block's real
    // elapsed time is held in warmupSec rather than summed from the drills.
    if (entry.kind === 'warmup') continue;

    for (const set of entry.sets) {
      if (!set.completed) continue;
      sets += 1;
      const dropReps = set.drops.reduce((s, d) => s + (d.reps || 0), 0);
      const dropVol = set.drops.reduce((s, d) => s + (d.weight || 0) * (d.reps || 0), 0);
      reps += (set.reps || 0) + dropReps;
      volume += (set.weight || 0) * (set.reps || 0) + dropVol;
      work += set.durationSec || 0;
      rest += set.restSec || 0;
    }
  }

  this.totalVolume = Math.round(volume * 100) / 100;
  this.totalSets = sets;
  this.totalReps = reps;
  this.workDurationSec = work;
  this.restDurationSec = rest;

  if (this.endedAt && this.startedAt) {
    this.totalDurationSec = Math.max(0, Math.round((this.endedAt - this.startedAt) / 1000));
  }
  return this;
};

workoutSessionSchema.pre('save', function beforeSave(next) {
  this.recalculate();
  next();
});

export const WorkoutSession = mongoose.model('WorkoutSession', workoutSessionSchema);

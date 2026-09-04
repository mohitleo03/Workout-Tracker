import mongoose from 'mongoose';

/** A dated bodyweight / measurement entry. One row per user per day. */
const bodyMetricSchema = new mongoose.Schema(
  {
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    date: { type: Date, required: true },
    dayKey: { type: String, required: true },

    weightKg: { type: Number, default: null },
    bodyFatPercent: { type: Number, default: null },
    measurements: {
      chest: { type: Number, default: null },
      waist: { type: Number, default: null },
      hips: { type: Number, default: null },
      leftArm: { type: Number, default: null },
      rightArm: { type: Number, default: null },
      leftThigh: { type: Number, default: null },
      rightThigh: { type: Number, default: null },
      neck: { type: Number, default: null },
    },
    note: { type: String, default: '' },
  },
  { timestamps: true }
);

bodyMetricSchema.index({ owner: 1, dayKey: 1 }, { unique: true });
bodyMetricSchema.index({ owner: 1, date: -1 });

export const BodyMetric = mongoose.model('BodyMetric', bodyMetricSchema);

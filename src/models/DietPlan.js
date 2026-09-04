import mongoose from 'mongoose';

/** One food inside a scheduled meal, with the quantity normally eaten. */
const plannedItemSchema = new mongoose.Schema(
  {
    food: { type: mongoose.Schema.Types.ObjectId, ref: 'Food', required: true },
    quantity: { type: Number, required: true, default: 100 },
    unit: { type: String, default: 'g' },
    order: { type: Number, default: 0 },
  },
  { _id: true }
);

/**
 * A recurring meal. `time` is "HH:mm" local to the user and drives both the
 * "did you eat it yet" check and the reminder notification.
 */
const mealSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true }, // Breakfast, Pre-workout, ...
    time: { type: String, required: true, default: '08:00' },
    // 0-6, empty means every day.
    daysOfWeek: { type: [Number], default: [] },
    reminderEnabled: { type: Boolean, default: true },
    // Minutes after `time` before we consider the meal missed.
    reminderGraceMin: { type: Number, default: 30 },
    items: { type: [plannedItemSchema], default: [] },
    order: { type: Number, default: 0 },
  },
  { _id: true }
);

const dietPlanSchema = new mongoose.Schema(
  {
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    name: { type: String, required: true, default: 'My daily diet' },
    isActive: { type: Boolean, default: true },
    meals: { type: [mealSchema], default: [] },
  },
  { timestamps: true }
);

dietPlanSchema.index({ owner: 1, isActive: 1 });

export const DietPlan = mongoose.model('DietPlan', dietPlanSchema);

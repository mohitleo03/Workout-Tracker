import mongoose from 'mongoose';

/**
 * One food actually eaten (or planned-but-not-yet-eaten) on a given day.
 * Macros are snapshotted at log time so editing the Food later never rewrites history.
 */
const logItemSchema = new mongoose.Schema(
  {
    food: { type: mongoose.Schema.Types.ObjectId, ref: 'Food', default: null },
    foodName: { type: String, required: true },
    mealName: { type: String, default: 'Other' },
    scheduledTime: { type: String, default: null }, // "HH:mm" copied from the plan

    quantity: { type: Number, required: true, default: 100 },
    unit: { type: String, default: 'g' },

    calories: { type: Number, default: 0 },
    protein: { type: Number, default: 0 },
    carbs: { type: Number, default: 0 },
    fat: { type: Number, default: 0 },
    sugar: { type: Number, default: 0 },
    fiber: { type: Number, default: 0 },
    sodium: { type: Number, default: 0 },

    consumed: { type: Boolean, default: false },
    consumedAt: { type: Date, default: null },
    // True when this row came from the diet plan rather than an ad-hoc add.
    fromPlan: { type: Boolean, default: false },
    planMealId: { type: mongoose.Schema.Types.ObjectId, default: null },
    planItemId: { type: mongoose.Schema.Types.ObjectId, default: null },
  },
  { _id: true }
);

const dietLogSchema = new mongoose.Schema(
  {
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    date: { type: Date, required: true }, // UTC start of day
    dayKey: { type: String, required: true }, // YYYY-MM-DD, unique per user
    items: { type: [logItemSchema], default: [] },
    waterMl: { type: Number, default: 0 },
    notes: { type: String, default: '' },

    // Roll-ups over *consumed* items only.
    totals: {
      calories: { type: Number, default: 0 },
      protein: { type: Number, default: 0 },
      carbs: { type: Number, default: 0 },
      fat: { type: Number, default: 0 },
      sugar: { type: Number, default: 0 },
      fiber: { type: Number, default: 0 },
      sodium: { type: Number, default: 0 },
    },
  },
  { timestamps: true }
);

dietLogSchema.index({ owner: 1, dayKey: 1 }, { unique: true });
dietLogSchema.index({ owner: 1, date: -1 });

dietLogSchema.methods.recalculate = function recalculate() {
  const t = { calories: 0, protein: 0, carbs: 0, fat: 0, sugar: 0, fiber: 0, sodium: 0 };
  for (const item of this.items) {
    if (!item.consumed) continue;
    for (const key of Object.keys(t)) t[key] += item[key] || 0;
  }
  for (const key of Object.keys(t)) t[key] = Math.round(t[key] * 100) / 100;
  this.totals = t;
  return this;
};

dietLogSchema.pre('save', function beforeSave(next) {
  this.recalculate();
  next();
});

export const DietLog = mongoose.model('DietLog', dietLogSchema);

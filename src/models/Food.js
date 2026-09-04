import mongoose from 'mongoose';

/**
 * A food item with macros expressed per `servingSize` `servingUnit`.
 * Catalog items have owner = null; anything a user creates is scoped to them.
 */
const foodSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    searchName: { type: String, required: true, index: true },
    brand: { type: String, default: '' },
    category: { type: String, default: 'other' },

    servingSize: { type: Number, required: true, default: 100 },
    servingUnit: { type: String, default: 'g' }, // g | ml | piece | cup | scoop | slice

    calories: { type: Number, default: 0 },
    protein: { type: Number, default: 0 },
    carbs: { type: Number, default: 0 },
    fat: { type: Number, default: 0 },
    sugar: { type: Number, default: 0 },
    fiber: { type: Number, default: 0 },
    sodium: { type: Number, default: 0 },

    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
    isCustom: { type: Boolean, default: false },
  },
  { timestamps: true }
);

foodSchema.index({ name: 'text', brand: 'text' });
foodSchema.index({ owner: 1, searchName: 1 });

foodSchema.pre('validate', function normalise(next) {
  if (this.name) this.searchName = this.name.toLowerCase().trim();
  next();
});

/** Scale this food's macros to an arbitrary quantity of servingUnit. */
foodSchema.methods.macrosFor = function macrosFor(quantity) {
  const factor = this.servingSize > 0 ? quantity / this.servingSize : 0;
  const round = (n) => Math.round(n * 100) / 100;
  return {
    calories: round(this.calories * factor),
    protein: round(this.protein * factor),
    carbs: round(this.carbs * factor),
    fat: round(this.fat * factor),
    sugar: round(this.sugar * factor),
    fiber: round(this.fiber * factor),
    sodium: round(this.sodium * factor),
  };
};

export const Food = mongoose.model('Food', foodSchema);

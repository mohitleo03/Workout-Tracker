import mongoose from 'mongoose';

// Matches the free-exercise-db vocabulary exactly, so filter chips always
// line up with what is actually stored on the seeded exercises.
export const MUSCLE_GROUPS = [
  'abdominals', 'abductors', 'adductors', 'biceps', 'calves', 'chest',
  'forearms', 'glutes', 'hamstrings', 'lats', 'lower back', 'middle back',
  'neck', 'quadriceps', 'shoulders', 'traps', 'triceps',
];

const exerciseSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    // Lowercased name used for fast prefix / substring search.
    searchName: { type: String, required: true, index: true },
    aliases: { type: [String], default: [] },

    primaryMuscles: { type: [String], default: [] },
    secondaryMuscles: { type: [String], default: [] },

    equipment: { type: String, default: 'body only' },
    category: { type: String, default: 'strength' },
    force: { type: String, default: null },       // push | pull | static
    mechanic: { type: String, default: null },    // compound | isolation
    level: { type: String, default: 'intermediate' },

    instructions: { type: [String], default: [] },
    images: { type: [String], default: [] },      // absolute URLs

    // Custom exercises belong to one user; catalog exercises have owner = null.
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
    isCustom: { type: Boolean, default: false },
    externalId: { type: String, default: null, index: true },
    source: { type: String, default: 'free-exercise-db' },
  },
  { timestamps: true }
);

// Text index gives us relevance-ranked full text search across name + aliases + muscles.
exerciseSchema.index({ name: 'text', aliases: 'text', primaryMuscles: 'text', equipment: 'text' });
exerciseSchema.index({ owner: 1, searchName: 1 });
exerciseSchema.index({ primaryMuscles: 1 });

exerciseSchema.pre('validate', function normalise(next) {
  if (this.name) this.searchName = this.name.toLowerCase().trim();
  next();
});

export const Exercise = mongoose.model('Exercise', exerciseSchema);

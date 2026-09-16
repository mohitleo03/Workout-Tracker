import mongoose from 'mongoose';

/**
 * A user's own note about an exercise - "seat 4, pin at 7", "narrow grip".
 *
 * Kept per user and per exercise rather than on a plan or a workout: the seat
 * height on the leg press is the same whichever day it is done and whichever
 * plan it sits in.
 */
const exerciseNoteSchema = new mongoose.Schema(
  {
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    exercise: { type: mongoose.Schema.Types.ObjectId, ref: 'Exercise', required: true },
    text: { type: String, trim: true, maxlength: 300, default: '' },
  },
  { timestamps: true }
);

exerciseNoteSchema.index({ owner: 1, exercise: 1 }, { unique: true });

export const ExerciseNote = mongoose.model('ExerciseNote', exerciseNoteSchema);

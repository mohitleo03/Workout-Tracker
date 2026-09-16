import mongoose from 'mongoose';
import { z } from 'zod';
import { Exercise } from '../models/Exercise.js';
import { ExerciseNote } from '../models/ExerciseNote.js';
import { ApiError } from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';

export const saveNoteSchema = z.object({
  text: z.string().max(300),
});

const toRow = (note) => ({
  exercise: note.exercise,
  text: note.text,
  updatedAt: note.updatedAt,
});

/** Every note this user has written, so a workout can show them all at once. */
export const listNotes = asyncHandler(async (req, res) => {
  const notes = await ExerciseNote.find({ owner: req.userId })
    .select('exercise text updatedAt')
    .lean();
  res.json({ success: true, data: notes.map(toRow) });
});

/**
 * Saves the note for one exercise. Blank text removes it, so clearing the field
 * is how a note is deleted - there is no separate call to forget.
 */
export const saveNote = asyncHandler(async (req, res) => {
  const { exerciseId } = req.params;
  if (!mongoose.isValidObjectId(exerciseId)) throw ApiError.badRequest('Invalid exercise id');

  // Only an exercise this user can actually see: a catalog one, or their own.
  const visible = await Exercise.exists({
    _id: exerciseId,
    $or: [{ owner: null }, { owner: req.userId }],
  });
  if (!visible) throw ApiError.notFound('Exercise not found');

  const text = req.body.text.trim();
  if (!text) {
    await ExerciseNote.deleteOne({ owner: req.userId, exercise: exerciseId });
    return res.json({ success: true, data: null });
  }

  const note = await ExerciseNote.findOneAndUpdate(
    { owner: req.userId, exercise: exerciseId },
    { $set: { text } },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  ).lean();

  res.json({ success: true, data: toRow(note) });
});

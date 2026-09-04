import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const userSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    passwordHash: { type: String, required: true, select: false },
    name: { type: String, trim: true, default: '' },

    // Reserved for a future Google sign-in without a schema migration.
    provider: { type: String, enum: ['local', 'google'], default: 'local' },
    providerId: { type: String, default: null },

    profile: {
      heightCm: { type: Number, default: null },
      birthDate: { type: Date, default: null },
      gender: { type: String, enum: ['male', 'female', 'other', null], default: null },
    },
    preferences: {
      weightUnit: { type: String, enum: ['kg', 'lb'], default: 'kg' },
      restTimerDefaultSec: { type: Number, default: 90 },
      dailyCalorieTarget: { type: Number, default: null },
      dailyProteinTarget: { type: Number, default: null },
      dailyCarbsTarget: { type: Number, default: null },
      dailyFatTarget: { type: Number, default: null },
      mealRemindersEnabled: { type: Boolean, default: true },
    },
  },
  { timestamps: true }
);

userSchema.methods.setPassword = async function setPassword(plain) {
  this.passwordHash = await bcrypt.hash(plain, 12);
};

userSchema.methods.verifyPassword = function verifyPassword(plain) {
  return bcrypt.compare(plain, this.passwordHash);
};

userSchema.methods.toPublic = function toPublic() {
  return {
    id: this._id,
    email: this.email,
    name: this.name,
    profile: this.profile,
    preferences: this.preferences,
    createdAt: this.createdAt,
  };
};

export const User = mongoose.model('User', userSchema);

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
    // Accounts are approved by hand: a new sign-up can log in and see its
    // own status, but nothing else, until this is turned on.
    isActive: { type: Boolean, default: false, index: true },
    activatedAt: { type: Date, default: null },

    // Access runs out on this date. Set to 30 days from sign-up.
    subscriptionExpiresAt: { type: Date, default: null, index: true },

    preferences: {
      weightUnit: { type: String, enum: ['kg', 'lb'], default: 'kg' },
      restTimerDefaultSec: { type: Number, default: 90 },
      dailyCalorieTarget: { type: Number, default: null },
      dailyProteinTarget: { type: Number, default: null },
      dailyCarbsTarget: { type: Number, default: null },
      dailyFatTarget: { type: Number, default: null },
      mealRemindersEnabled: { type: Boolean, default: true },
      // "HH:mm" in the user's own local time. Null until they tell us.
      usualTrainingTime: { type: String, default: null },
      // Daily water target in millilitres.
      dailyWaterMl: { type: Number, default: 3000 },
      // The user's chosen look. Null until they pick one, which is how the
      // app knows to keep whatever the device is already showing.
      themeMode: { type: String, enum: ['system', 'dark', 'light'], default: null },
      accentColor: { type: String, default: null },
    },
  },
  { timestamps: true }
);

/**
 * Why the account can or cannot be used: 'active', 'pending' (never approved)
 * or 'expired'. One field the app can branch on beats it re-deriving the rule.
 */
userSchema.virtual('accessState').get(function accessState() {
  if (!this.isActive) return 'pending';
  if (this.subscriptionExpiresAt && this.subscriptionExpiresAt.getTime() < Date.now()) {
    return 'expired';
  }
  return 'active';
});

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
    isActive: this.isActive,
    subscriptionExpiresAt: this.subscriptionExpiresAt,
    accessState: this.accessState,
    createdAt: this.createdAt,
  };
};

export const User = mongoose.model('User', userSchema);

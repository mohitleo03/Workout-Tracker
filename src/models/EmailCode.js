import mongoose from 'mongoose';

/**
 * A one-time code sent by email - to confirm an address at sign-up, or to
 * reset a forgotten password. Only a hash is kept, never the code itself.
 *
 * One live code per email and purpose: asking again replaces it. MongoDB
 * removes a code on its own once it has expired.
 */
const emailCodeSchema = new mongoose.Schema(
  {
    email: { type: String, required: true, lowercase: true, trim: true },
    purpose: { type: String, enum: ['verify_email', 'reset_password'], required: true },
    codeHash: { type: String, required: true },
    expiresAt: { type: Date, required: true },
    sentAt: { type: Date, required: true },
    attempts: { type: Number, default: 0 },
  },
  { timestamps: false }
);

emailCodeSchema.index({ email: 1, purpose: 1 }, { unique: true });
emailCodeSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const EmailCode = mongoose.model('EmailCode', emailCodeSchema);

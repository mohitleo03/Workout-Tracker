import crypto from 'node:crypto';
import { env } from '../config/env.js';
import { EmailCode } from '../models/EmailCode.js';
import { ApiError } from '../utils/ApiError.js';
import { codeEmail, sendMail } from './mailer.js';

/** How long a code works for. */
export const CODE_TTL_MS = 10 * 60 * 1000;

/** How long before another code can be sent to the same address. */
export const RESEND_COOLDOWN_MS = 60 * 1000;

/**
 * Wrong guesses allowed on one code. Four digits is only 10,000 possibilities,
 * so this - not the length - is what makes guessing hopeless.
 */
export const MAX_ATTEMPTS = 5;

function hashCode(email, purpose, code) {
  return crypto
    .createHmac('sha256', env.jwt.accessSecret)
    .update(`${purpose}:${email}:${code}`)
    .digest('hex');
}

/**
 * Makes a new code and emails it, replacing any code sent before.
 *
 * Refused while the last one is under a minute old, so a finger held on
 * "resend" cannot flood an inbox or burn through the mail account's limits.
 * The code is only kept if the email actually went, so a failed send never
 * blocks the next try behind the cooldown.
 */
export async function sendCode(email, purpose) {
  const address = email.toLowerCase();
  const existing = await EmailCode.findOne({ email: address, purpose }).lean();
  const waited = existing ? Date.now() - existing.sentAt.getTime() : Infinity;
  if (waited < RESEND_COOLDOWN_MS) {
    const retryAfterSec = Math.ceil((RESEND_COOLDOWN_MS - waited) / 1000);
    throw ApiError.tooManyRequests(`Wait ${retryAfterSec}s before asking for another code.`, {
      code: 'CODE_COOLDOWN',
      retryAfterSec,
    });
  }

  const code = String(crypto.randomInt(0, 10000)).padStart(4, '0');
  await sendMail({ to: address, ...codeEmail(code, purpose) });

  const now = new Date();
  await EmailCode.updateOne(
    { email: address, purpose },
    {
      $set: {
        codeHash: hashCode(address, purpose, code),
        sentAt: now,
        expiresAt: new Date(now.getTime() + CODE_TTL_MS),
        attempts: 0,
      },
    },
    { upsert: true }
  );

  return { resendInSec: RESEND_COOLDOWN_MS / 1000 };
}

/**
 * Checks a code and uses it up. Throws with a reason the app can show:
 * wrong (with tries left), expired, or locked after too many wrong tries.
 */
export async function useCode(email, purpose, code) {
  const address = email.toLowerCase();
  const doc = await EmailCode.findOne({ email: address, purpose });

  if (!doc || doc.expiresAt.getTime() < Date.now()) {
    throw ApiError.badRequest('That code has expired. Ask for a new one.', { code: 'CODE_EXPIRED' });
  }
  if (doc.attempts >= MAX_ATTEMPTS) {
    throw ApiError.badRequest('Too many wrong tries. Ask for a new code.', { code: 'CODE_LOCKED' });
  }

  const expected = Buffer.from(doc.codeHash, 'hex');
  const given = Buffer.from(hashCode(address, purpose, String(code)), 'hex');
  if (!crypto.timingSafeEqual(expected, given)) {
    // Counted atomically, so guesses fired in parallel cannot each see the
    // same count and slip past the limit together.
    const updated = await EmailCode.findOneAndUpdate(
      { _id: doc._id },
      { $inc: { attempts: 1 } },
      { new: true }
    ).lean();
    const attemptsLeft = Math.max(0, MAX_ATTEMPTS - (updated?.attempts ?? MAX_ATTEMPTS));
    throw ApiError.badRequest(
      attemptsLeft > 0
        ? `That code is not right. ${attemptsLeft} ${attemptsLeft === 1 ? 'try' : 'tries'} left.`
        : 'Too many wrong tries. Ask for a new code.',
      { code: attemptsLeft > 0 ? 'CODE_WRONG' : 'CODE_LOCKED', attemptsLeft }
    );
  }

  // One use only.
  await EmailCode.deleteOne({ _id: doc._id });
}

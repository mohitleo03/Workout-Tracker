import nodemailer from 'nodemailer';
import { env } from '../config/env.js';
import { ApiError } from '../utils/ApiError.js';

/** Messages kept by the 'memory' transport, newest last. Test scripts only. */
export const sentMail = [];

let transporter = null;

const notConfigured = () =>
  ApiError.serviceUnavailable('Email is not set up on the server.', {
    code: 'MAIL_NOT_CONFIGURED',
  });

function smtp() {
  if (!env.mail.user || !env.mail.pass) throw notConfigured();
  transporter ??= nodemailer.createTransport({
    host: env.mail.host,
    port: env.mail.port,
    // 465 speaks TLS from the first byte; 587 upgrades with STARTTLS.
    secure: env.mail.port === 465,
    auth: { user: env.mail.user, pass: env.mail.pass },
  });
  return transporter;
}

/** Sends one email, however this environment is set up to. */
export async function sendMail({ to, subject, text, html }) {
  const message = {
    from: `"${env.mail.fromName}" <${env.mail.user ?? 'no-reply@localhost'}>`,
    to,
    subject,
    text,
    html,
  };

  switch (env.mail.transport) {
    case 'memory':
      sentMail.push(message);
      return;
    case 'log':
      if (env.isProd) throw notConfigured();
      console.log(`[mail] to ${to}: ${subject}\n${text}`);
      return;
    default:
      try {
        await smtp().sendMail(message);
      } catch (err) {
        if (err instanceof ApiError) throw err;
        console.error('[mail] send failed:', err.message);
        throw ApiError.serviceUnavailable(
          'Could not send the email right now. Try again in a minute.',
          { code: 'MAIL_SEND_FAILED' }
        );
      }
  }
}

/** Checks the mail account can be logged into, without sending anything. */
export function verifyMailer() {
  return smtp().verify();
}

/**
 * The email carrying a one-time code. The code leads the subject line, so it
 * can be read straight off the phone's notification.
 */
export function codeEmail(code, purpose) {
  const why =
    purpose === 'reset_password' ? 'reset your password' : 'confirm your email address';
  const text =
    `Your ${env.mail.fromName} code is ${code}.\n\n` +
    `Enter it in the app to ${why}. It expires in 10 minutes.\n\n` +
    "If you didn't ask for this, you can ignore this email.";
  const html = `
    <div style="font-family:Arial,sans-serif;max-width:420px;margin:auto;padding:24px;color:#222">
      <p style="margin:0 0 12px">Enter this code in the app to ${why}:</p>
      <p style="font-size:34px;letter-spacing:10px;font-weight:bold;margin:8px 0 16px">${code}</p>
      <p style="margin:0 0 12px;color:#555">It expires in 10 minutes.</p>
      <p style="margin:0;color:#888;font-size:13px">If you didn't ask for this, you can ignore this email.</p>
    </div>`;
  return { subject: `${code} is your ${env.mail.fromName} code`, text, html };
}

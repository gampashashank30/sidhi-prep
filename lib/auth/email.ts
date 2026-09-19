// lib/auth/email.ts
// Resend-powered transactional email sending — SERVER-SIDE ONLY.
// NEVER import this in client components.

import { Resend } from 'resend';

function getResendClient(): Resend {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error('RESEND_API_KEY is not set');
  return new Resend(apiKey);
}

function getFromEmail(): string {
  const from = process.env.RESEND_FROM_EMAIL;
  if (!from) throw new Error('RESEND_FROM_EMAIL is not set');
  return from;
}

function getAppUrl(): string {
  const url = process.env.APP_URL;
  if (!url) throw new Error('APP_URL is not set');
  return url.replace(/\/$/, ''); // strip trailing slash
}

// ─── Email templates ──────────────────────────────────────────────────────────

function baseEmailLayout(content: string, previewText: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Siddhi Prep</title>
</head>
<body style="margin:0;padding:0;background:#F0F4F8;font-family:'Inter',Arial,sans-serif;">
  <div style="display:none;font-size:1px;line-height:1px;max-height:0;overflow:hidden;opacity:0;">${previewText}</div>
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#F0F4F8;padding:40px 16px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;">
          <!-- Header -->
          <tr>
            <td style="background:linear-gradient(135deg,#0F3D6E 0%,#1B5EA7 55%,#1d7ad4 75%,#14B89A 100%);border-radius:16px 16px 0 0;padding:32px 40px;text-align:center;">
              <h1 style="margin:0;font-family:Georgia,serif;font-style:italic;font-size:28px;color:#fff;font-weight:700;letter-spacing:-0.5px;">Siddhi</h1>
              <p style="margin:4px 0 0;font-size:11px;color:rgba(255,255,255,0.65);letter-spacing:2px;text-transform:uppercase;">Question Bank PDF Generator</p>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="background:#ffffff;padding:40px;border-radius:0 0 16px 16px;border:1px solid #E2E8F0;border-top:none;">
              ${content}
              <hr style="border:none;border-top:1px solid #E2E8F0;margin:32px 0;">
              <p style="margin:0;font-size:12px;color:#94A3B8;text-align:center;">
                This email was sent by Siddhi Prep. If you did not request this, please ignore it.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

// ─── 1. Account invitation / set-password email ───────────────────────────────

export async function sendInviteEmail(
  recipientEmail: string,
  rawToken: string
): Promise<void> {
  const link = `${getAppUrl()}/set-password?token=${rawToken}`;
  const resend = getResendClient();

  const content = `
    <h2 style="margin:0 0 8px;font-size:22px;color:#0F172A;font-weight:700;">You're invited to Siddhi Prep</h2>
    <p style="margin:0 0 24px;font-size:15px;color:#475569;line-height:1.6;">
      An admin has created an account for you on Siddhi Prep. Click the button below to set your password and get started.
    </p>
    <div style="text-align:center;margin:0 0 24px;">
      <a href="${link}" style="display:inline-block;background:linear-gradient(135deg,#1B5EA7,#14B89A);color:#fff;text-decoration:none;font-weight:700;font-size:15px;padding:14px 32px;border-radius:8px;letter-spacing:0.3px;">
        Set My Password
      </a>
    </div>
    <p style="margin:0 0 8px;font-size:13px;color:#94A3B8;">If the button doesn't work, copy this link:</p>
    <p style="margin:0;font-size:12px;word-break:break-all;color:#1B5EA7;">${link}</p>
    <div style="margin:24px 0 0;padding:16px;background:#FFF7ED;border-radius:8px;border-left:4px solid #F59E0B;">
      <p style="margin:0;font-size:13px;color:#92400E;font-weight:600;">⚠️ This link expires in 7 days and can only be used once.</p>
    </div>
  `;

  await resend.emails.send({
    from: getFromEmail(),
    to: recipientEmail,
    subject: 'You\'ve been invited to Siddhi Prep — Set your password',
    html: baseEmailLayout(content, 'Set your password to access Siddhi Prep'),
  });
}

// ─── 2. Forgot password email ─────────────────────────────────────────────────

export async function sendForgotPasswordEmail(
  recipientEmail: string,
  rawToken: string
): Promise<void> {
  const link = `${getAppUrl()}/reset-password?token=${rawToken}`;
  const resend = getResendClient();

  const content = `
    <h2 style="margin:0 0 8px;font-size:22px;color:#0F172A;font-weight:700;">Reset your password</h2>
    <p style="margin:0 0 24px;font-size:15px;color:#475569;line-height:1.6;">
      We received a request to reset your Siddhi Prep password. Click the button below to choose a new password.
    </p>
    <div style="text-align:center;margin:0 0 24px;">
      <a href="${link}" style="display:inline-block;background:linear-gradient(135deg,#1B5EA7,#14B89A);color:#fff;text-decoration:none;font-weight:700;font-size:15px;padding:14px 32px;border-radius:8px;letter-spacing:0.3px;">
        Reset Password
      </a>
    </div>
    <p style="margin:0 0 8px;font-size:13px;color:#94A3B8;">If the button doesn't work, copy this link:</p>
    <p style="margin:0;font-size:12px;word-break:break-all;color:#1B5EA7;">${link}</p>
    <div style="margin:24px 0 0;padding:16px;background:#FFF7ED;border-radius:8px;border-left:4px solid #F59E0B;">
      <p style="margin:0;font-size:13px;color:#92400E;font-weight:600;">⚠️ This link expires in 1 hour and can only be used once.</p>
    </div>
    <p style="margin:16px 0 0;font-size:13px;color:#94A3B8;">If you didn't request a password reset, you can safely ignore this email.</p>
  `;

  await resend.emails.send({
    from: getFromEmail(),
    to: recipientEmail,
    subject: 'Reset your Siddhi Prep password',
    html: baseEmailLayout(content, 'Reset your Siddhi Prep password — link expires in 1 hour'),
  });
}

// ─── 3. Admin-triggered password reset email ──────────────────────────────────

export async function sendAdminResetEmail(
  recipientEmail: string,
  rawToken: string
): Promise<void> {
  const link = `${getAppUrl()}/reset-password?token=${rawToken}`;
  const resend = getResendClient();

  const content = `
    <h2 style="margin:0 0 8px;font-size:22px;color:#0F172A;font-weight:700;">Your password has been reset</h2>
    <p style="margin:0 0 24px;font-size:15px;color:#475569;line-height:1.6;">
      An administrator has requested a password reset for your Siddhi Prep account. Click the button below to set a new password.
    </p>
    <div style="text-align:center;margin:0 0 24px;">
      <a href="${link}" style="display:inline-block;background:linear-gradient(135deg,#1B5EA7,#14B89A);color:#fff;text-decoration:none;font-weight:700;font-size:15px;padding:14px 32px;border-radius:8px;letter-spacing:0.3px;">
        Set New Password
      </a>
    </div>
    <p style="margin:0 0 8px;font-size:13px;color:#94A3B8;">If the button doesn't work, copy this link:</p>
    <p style="margin:0;font-size:12px;word-break:break-all;color:#1B5EA7;">${link}</p>
    <div style="margin:24px 0 0;padding:16px;background:#FFF7ED;border-radius:8px;border-left:4px solid #F59E0B;">
      <p style="margin:0;font-size:13px;color:#92400E;font-weight:600;">⚠️ This link expires in 1 hour and can only be used once.</p>
    </div>
    <p style="margin:16px 0 0;font-size:13px;color:#94A3B8;">If you did not expect this, please contact your administrator.</p>
  `;

  await resend.emails.send({
    from: getFromEmail(),
    to: recipientEmail,
    subject: 'Your Siddhi Prep password needs to be reset',
    html: baseEmailLayout(content, 'An admin has reset your Siddhi Prep password'),
  });
}

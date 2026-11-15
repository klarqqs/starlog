import nodemailer from 'nodemailer';

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Builds the mailer from environment variables.
// With SMTP_HOST set, mail goes out over SMTP. Without it, links print to the log (development only).
export function createMailer(env = process.env, transport) {
  if (!env.SMTP_HOST && !transport) {
    if (env.NODE_ENV === 'production') throw new Error('SMTP_HOST is required in production so projects can verify their email.');
    return { kind: 'console', async send(m) { console.log(`[mail] to=${m.to} link=${m.link}`); } };
  }
  const port = Number(env.SMTP_PORT || 587);
  const t = transport || nodemailer.createTransport({
    host: env.SMTP_HOST,
    port,
    secure: env.SMTP_SECURE ? env.SMTP_SECURE === 'true' : port === 465,
    auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASSWORD || '' } : undefined,
    connectionTimeout: 10000,
    socketTimeout: 15000,
  });
  const from = env.MAIL_FROM || env.SMTP_USER || 'Starlog <no-reply@localhost>';
  return {
    kind: 'smtp',
    async send(m) {
      const copy = {
        verify: ['Welcome to Starlog.', 'Verify your email', 'Verify your email by opening this link (valid for 24 hours):', 'If you did not create an account, ignore this message.'],
        reset: ['A password reset was requested for your Starlog account.', 'Choose a new password', 'Set a new password by opening this link (valid for 1 hour):', 'If you did not ask for this, ignore this message. Your password stays the same.'],
        invite: ['You have been invited to operate Starlog for SCF.', 'Accept the invite and set a password', 'Set your password by opening this link (valid for 72 hours):', 'If you were not expecting this, ignore this message.'],
      }[m.kind || 'verify'];
      await t.sendMail({
        from, to: m.to, subject: m.subject,
        text: `${copy[0]}\n\n${copy[2]}\n${m.link}\n\n${copy[3]}`,
        html: `<p>${copy[0]}</p><p><a href="${esc(m.link)}">${copy[1]}</a></p><p>${copy[3]}</p>`,
      });
    },
  };
}

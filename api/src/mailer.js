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
  const from = env.MAIL_FROM || env.SMTP_USER || 'Stellog <no-reply@localhost>';
  return {
    kind: 'smtp',
    async send(m) {
      await t.sendMail({
        from, to: m.to, subject: m.subject,
        text: `Welcome to Stellog.\n\nVerify your email by opening this link (valid for 24 hours):\n${m.link}\n\nIf you did not create an account, ignore this message.`,
        html: `<p>Welcome to Stellog.</p><p><a href="${esc(m.link)}">Verify your email</a> (valid for 24 hours).</p><p>If you did not create an account, ignore this message.</p>`,
      });
    },
  };
}

const nodemailer = require('nodemailer');

function mailConfigured() {
  return Boolean(process.env.SMTP_USER && process.env.SMTP_PASS);
}

function createTransport() {
  const host = process.env.SMTP_HOST || 'smtp.qq.com';
  const port = Number(process.env.SMTP_PORT || 465);
  const secure = String(process.env.SMTP_SECURE || 'true') !== 'false';
  return nodemailer.createTransport({
    host,
    port,
    secure,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS
    }
  });
}

async function sendMail({ to, subject, html }) {
  if (!mailConfigured()) {
    const err = new Error('邮件未配置：请在 .env 填写 SMTP_USER / SMTP_PASS（QQ邮箱授权码）');
    err.status = 500;
    throw err;
  }
  const transporter = createTransport();
  const fromName = process.env.MAIL_FROM_NAME || '老街网创';
  const fromAddr = process.env.SMTP_FROM || process.env.SMTP_USER;
  await transporter.sendMail({
    from: `"${fromName}" <${fromAddr}>`,
    to,
    subject,
    html
  });
}

module.exports = { sendMail, mailConfigured };

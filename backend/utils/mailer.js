const nodemailer = require('nodemailer');

// Returns null if email isn't configured yet, so callers can skip sending
// gracefully instead of crashing.
function getTransporter() {
  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) return null;
  return nodemailer.createTransport({
    host: process.env.EMAIL_HOST || 'smtp.gmail.com',
    port: process.env.EMAIL_PORT || 587,
    secure: process.env.EMAIL_PORT == 465,
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS
    }
  });
}

async function sendMail({ to, subject, html }) {
  const transporter = getTransporter();
  if (!transporter) {
    throw new Error('Email is not configured (EMAIL_USER/EMAIL_PASS missing)');
  }
  return transporter.sendMail({
    from: `"Vehicle Management System" <${process.env.EMAIL_USER}>`,
    to,
    subject,
    html
  });
}

module.exports = { sendMail };

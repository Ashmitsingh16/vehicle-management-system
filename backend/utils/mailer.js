// Uses Resend (https://resend.com) over HTTPS instead of raw SMTP, because
// many free hosting tiers (including Render's) block outbound SMTP ports
// like 587/465 to prevent spam abuse. HTTPS-based email APIs aren't affected.
async function sendMail({ to, subject, html }) {
  if (!process.env.RESEND_API_KEY) {
    throw new Error('Email is not configured (RESEND_API_KEY missing)');
  }

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      from: process.env.RESEND_FROM || 'Vehicle Management System <onboarding@resend.dev>',
      to,
      subject,
      html
    })
  });

  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(`Resend API error (${res.status}): ${errBody}`);
  }

  return res.json();
}

module.exports = { sendMail };

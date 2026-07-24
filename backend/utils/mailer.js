const { google } = require('googleapis');

// Sends real email from your own Gmail account via the Gmail REST API
// (HTTPS), not SMTP — this is what lets it work on hosts like Render's free
// tier that block outbound SMTP ports (587/465) to prevent spam abuse.
//
// Required env vars:
//   GMAIL_CLIENT_ID
//   GMAIL_CLIENT_SECRET
//   GMAIL_REFRESH_TOKEN
//   GMAIL_USER            (the Gmail address these tokens belong to)

function buildRawMessage({ to, from, subject, html }) {
  const messageParts = [
    `From: ${from}`,
    `To: ${to}`,
    `Subject: ${subject}`,
    'MIME-Version: 1.0',
    'Content-Type: text/html; charset=utf-8',
    '',
    html
  ];
  const message = messageParts.join('\n');

  // Gmail API requires base64url encoding (not standard base64)
  return Buffer.from(message)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

async function sendMail({ to, subject, html }) {
  const { GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REFRESH_TOKEN, GMAIL_USER } = process.env;

  if (!GMAIL_CLIENT_ID || !GMAIL_CLIENT_SECRET || !GMAIL_REFRESH_TOKEN || !GMAIL_USER) {
    throw new Error('Gmail API is not configured (missing GMAIL_CLIENT_ID/SECRET/REFRESH_TOKEN/USER)');
  }

  const oAuth2Client = new google.auth.OAuth2(GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET);
  oAuth2Client.setCredentials({ refresh_token: GMAIL_REFRESH_TOKEN });

  const gmail = google.gmail({ version: 'v1', auth: oAuth2Client });

  const raw = buildRawMessage({
    to,
    from: `Vehicle Management System <${GMAIL_USER}>`,
    subject,
    html
  });

  return gmail.users.messages.send({
    userId: 'me',
    requestBody: { raw }
  });
}

module.exports = { sendMail };

const nodemailer = require('nodemailer');

let transporter;

function parsePort(value, fallback = 587) {
  const port = Number.parseInt(value, 10);
  return Number.isFinite(port) ? port : fallback;
}

function getTransporter() {
  if (transporter) {
    return transporter;
  }

  const host = process.env.SMTP_HOST || process.env.EMAIL_HOST;
  const port = parsePort(process.env.SMTP_PORT || process.env.EMAIL_PORT, 587);
  const user = process.env.SMTP_USER || process.env.EMAIL_USER;
  const pass = process.env.SMTP_PASS || process.env.EMAIL_PASSWORD;

  if (!host || !user || !pass) {
    throw new Error('SMTP configuration is missing. Set SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS.');
  }

  transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass }
  });

  return transporter;
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function sendEmail({ to, subject, html, text, templateId, metadata }) {
  const fromName = process.env.SMTP_FROM_NAME || 'NVM Marketplace';
  const fromEmail = process.env.SMTP_FROM_EMAIL || process.env.SMTP_USER || process.env.EMAIL_USER;

  if (!to || !subject) {
    throw new Error('Email requires to and subject');
  }

  if (!fromEmail) {
    throw new Error('SMTP sender is not configured. Set SMTP_FROM_EMAIL.');
  }

  const mail = {
    from: `"${fromName}" <${fromEmail}>`,
    to,
    subject,
    html,
    text,
    headers: {
      'X-Template-Id': templateId || 'custom',
      ...(metadata?.event ? { 'X-Event-Name': String(metadata.event) } : {})
    }
  };

  const maxAttempts = 3;
  let lastError;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const tx = getTransporter();
      const result = await tx.sendMail(mail);
      return {
        success: true,
        messageId: result.messageId,
        accepted: result.accepted,
        rejected: result.rejected
      };
    } catch (error) {
      lastError = error;
      console.error('[mail] send failed', {
        attempt,
        to,
        subject,
        templateId,
        error: error.message
      });

      if (attempt < maxAttempts) {
        await delay(250 * attempt);
      }
    }
  }

  throw lastError;
}

module.exports = {
  sendEmail
};

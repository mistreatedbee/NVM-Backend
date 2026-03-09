const nodemailer = require('nodemailer');
const { renderTemplate } = require('../emails/templates');
const EmailLog = require('../models/EmailLog');

let smtpTransporter;

function getProvider() {
  return String(process.env.EMAIL_PROVIDER || 'BREVO_API').toUpperCase();
}

function parsePort(value, fallback = 587) {
  const port = Number.parseInt(value, 10);
  return Number.isFinite(port) ? port : fallback;
}

function getFromDetails() {
  const fromName = process.env.SMTP_FROM_NAME || process.env.EMAIL_FROM_NAME || 'NVM Marketplace';
  const fromEmail = process.env.SMTP_FROM_EMAIL || process.env.EMAIL_FROM_EMAIL || process.env.SMTP_USER || process.env.EMAIL_USER;

  if (!fromEmail) {
    throw new Error('Sender email missing. Set SMTP_FROM_EMAIL (or EMAIL_FROM_EMAIL).');
  }

  return { fromName, fromEmail };
}

function getSmtpTransporter() {
  if (smtpTransporter) return smtpTransporter;

  const host = process.env.SMTP_HOST || process.env.EMAIL_HOST;
  const port = parsePort(process.env.SMTP_PORT || process.env.EMAIL_PORT, 587);
  const user = process.env.SMTP_USER || process.env.EMAIL_USER;
  const pass = process.env.SMTP_PASS || process.env.EMAIL_PASSWORD;

  if (!host || !user || !pass) {
    throw new Error('SMTP credentials missing. Set SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS.');
  }

  smtpTransporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass }
  });

  return smtpTransporter;
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function writeLog(payload) {
  try {
    await EmailLog.create(payload);
  } catch (_error) {
    // Optional logging only.
  }
}

async function sendWithSmtp(payload) {
  const tx = getSmtpTransporter();
  const result = await tx.sendMail(payload);
  return {
    provider: 'SMTP',
    messageId: result.messageId,
    accepted: result.accepted,
    rejected: result.rejected
  };
}

async function sendWithBrevoApi(payload) {
  const apiKey = process.env.BREVO_API_KEY;
  if (!apiKey) {
    throw new Error('BREVO_API_KEY is missing.');
  }

  const response = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      'api-key': apiKey,
      'Content-Type': 'application/json',
      Accept: 'application/json'
    },
    body: JSON.stringify({
      sender: {
        name: payload.fromName,
        email: payload.fromEmail
      },
      to: [{ email: payload.to }],
      subject: payload.subject,
      htmlContent: payload.html || undefined,
      textContent: payload.text || undefined,
      params: payload.metadata || undefined
    })
  });

  const responseBody = await response.text();
  if (!response.ok) {
    throw new Error(`Brevo API send failed (${response.status}): ${responseBody}`);
  }

  let parsedBody = null;
  try {
    parsedBody = responseBody ? JSON.parse(responseBody) : null;
  } catch (_error) {
    parsedBody = responseBody || null;
  }

  return {
    provider: 'BREVO_API',
    status: response.status,
    messageId: parsedBody?.messageId || null,
    response: parsedBody
  };
}

async function sendWithSendgrid(payload) {
  const apiKey = process.env.SENDGRID_API_KEY;
  if (!apiKey) {
    throw new Error('SENDGRID_API_KEY is missing.');
  }

  const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      personalizations: [{ to: [{ email: payload.to }] }],
      from: { email: payload.fromEmail, name: payload.fromName },
      subject: payload.subject,
      content: [
        { type: 'text/plain', value: payload.text || '' },
        { type: 'text/html', value: payload.html || '' }
      ]
    })
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`SendGrid send failed (${response.status}): ${errorBody}`);
  }

  return {
    provider: 'SENDGRID',
    messageId: response.headers.get('x-message-id') || null,
    status: response.status
  };
}

async function sendWithMailgun(payload) {
  const apiKey = process.env.MAILGUN_API_KEY;
  const domain = process.env.MAILGUN_DOMAIN;
  if (!apiKey || !domain) {
    throw new Error('MAILGUN_API_KEY and MAILGUN_DOMAIN are required.');
  }

  const body = new URLSearchParams();
  body.append('from', `${payload.fromName} <${payload.fromEmail}>`);
  body.append('to', payload.to);
  body.append('subject', payload.subject);
  body.append('text', payload.text || '');
  body.append('html', payload.html || '');

  const credentials = Buffer.from(`api:${apiKey}`).toString('base64');
  const response = await fetch(`https://api.mailgun.net/v3/${domain}/messages`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${credentials}`
    },
    body
  });

  const responseText = await response.text();
  if (!response.ok) {
    throw new Error(`Mailgun send failed (${response.status}): ${responseText}`);
  }

  return {
    provider: 'MAILGUN',
    status: response.status,
    body: responseText
  };
}

async function sendWithResend(payload) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    throw new Error('RESEND_API_KEY is missing.');
  }

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      from: `${payload.fromName} <${payload.fromEmail}>`,
      to: [payload.to],
      subject: payload.subject,
      html: payload.html,
      text: payload.text
    })
  });

  const body = await response.text();
  if (!response.ok) {
    throw new Error(`Resend send failed (${response.status}): ${body}`);
  }

  return {
    provider: 'RESEND',
    status: response.status,
    body
  };
}

async function sendByProvider(payload) {
  const provider = getProvider();

  if (provider === 'BREVO_API' || provider === 'BREVO') {
    try {
      return await sendWithBrevoApi(payload);
    } catch (error) {
      const canFallbackToSmtp = Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
      if (!canFallbackToSmtp) throw error;

      console.warn('[email] brevo api failed, falling back to smtp', { error: error.message });
      return sendWithSmtp(payload);
    }
  }
  if (provider === 'BREVO_SMTP') return sendWithSmtp(payload);
  if (provider === 'SMTP') return sendWithSmtp(payload);
  if (provider === 'SENDGRID') return sendWithSendgrid(payload);
  if (provider === 'MAILGUN') return sendWithMailgun(payload);
  if (provider === 'RESEND') return sendWithResend(payload);

  throw new Error(`Unsupported EMAIL_PROVIDER: ${provider}`);
}

async function sendEmail({ to, subject, html, text, metadata = {}, templateName = null }) {
  if (!to || !subject) {
    throw new Error('sendEmail requires to and subject.');
  }

  const { fromName, fromEmail } = getFromDetails();
  const maxAttempts = Number.parseInt(process.env.EMAIL_RETRY_ATTEMPTS || '3', 10);
  let lastError;

  const payload = {
    to,
    subject,
    html,
    text,
    metadata,
    fromName,
    fromEmail,
    headers: {
      'X-Template-Id': templateName || metadata.templateName || 'custom'
    }
  };

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const result = await sendByProvider(payload);

      await writeLog({
        to,
        provider: result.provider || getProvider(),
        templateName,
        subject,
        status: 'sent',
        response: result,
        metadata
      });

      console.log('[email] sent', {
        to,
        templateName,
        provider: result.provider || getProvider(),
        attempt
      });

      return {
        success: true,
        ...result
      };
    } catch (error) {
      lastError = error;
      console.error('[email] send failed', {
        to,
        templateName,
        attempt,
        provider: getProvider(),
        error: error.message
      });

      if (attempt < maxAttempts) {
        await delay(300 * attempt);
      }
    }
  }

  await writeLog({
    to,
    provider: getProvider(),
    templateName,
    subject,
    status: 'failed',
    error: lastError?.message || 'Unknown email failure',
    metadata
  });

  throw lastError;
}

async function sendTemplate(templateName, to, variables = {}, metadata = {}) {
  const rendered = renderTemplate(templateName, variables);
  return sendEmail({
    to,
    subject: rendered.subject,
    html: rendered.html,
    text: rendered.text,
    metadata: {
      ...metadata,
      templateName: rendered.key,
      requiredVariables: rendered.requiredVariables
    },
    templateName: rendered.key
  });
}

module.exports = {
  sendEmail,
  sendTemplate
};

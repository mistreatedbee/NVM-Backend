require('dotenv').config();
const { sendTemplate } = require('../services/emailService');
const { buildAppUrl } = require('../utils/appUrl');

async function main() {
  const to = process.argv[2];
  const templateName = process.argv[3] || 'email_verification';

  if (!to) {
    console.error('Usage: node scripts/sendTestEmail.js <to> [templateName]');
    process.exit(1);
  }

  const result = await sendTemplate(templateName, to, {
    userName: 'Local Tester',
    orderId: `NVM-${Date.now()}`,
    actionUrl: buildAppUrl('/orders'),
    supportEmail: process.env.SUPPORT_EMAIL || 'support@nvm.local',
    vendorName: 'Sample Vendor',
    status: 'pending',
    reason: 'Sample reason'
  }, { event: 'email.script.test' });

  console.log('Email sent:', result);
}

main().catch((error) => {
  console.error('Failed to send test email:', error.message);
  process.exit(1);
});

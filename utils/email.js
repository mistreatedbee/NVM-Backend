const { sendEmail: sendMail } = require('../services/mailService');
const { renderTemplate } = require('../services/emailTemplates');

function normalizeOptions(options = {}) {
  const to = options.to || options.email;
  const html = options.html || options.message;
  const text = options.text || options.message;
  return {
    to,
    subject: options.subject,
    html,
    text,
    templateId: options.templateId,
    metadata: options.metadata
  };
}

async function sendEmail(options = {}) {
  const payload = normalizeOptions(options);
  return sendMail(payload);
}

function verificationEmail(userName, verificationUrl) {
  return renderTemplate('verification', {
    userName,
    actionLinks: [{ label: 'Verify Email', url: verificationUrl }]
  }).html;
}

function passwordResetEmail(userName, resetUrl) {
  return renderTemplate('password_reset', {
    userName,
    actionLinks: [{ label: 'Reset Password', url: resetUrl }]
  }).html;
}

function vendorApprovalEmail(vendorName, storeName) {
  return renderTemplate('vendor_approved', {
    userName: vendorName,
    vendorName: storeName,
    actionLinks: [{ label: 'Open Vendor Dashboard', url: `${process.env.APP_BASE_URL || process.env.FRONTEND_URL || ''}/vendor/dashboard` }]
  }).html;
}

function orderConfirmationEmail(customerName, orderNumber) {
  return renderTemplate('order_confirmation', {
    userName: customerName,
    orderId: orderNumber,
    actionLinks: [{ label: 'Track Order', url: `${process.env.APP_BASE_URL || process.env.FRONTEND_URL || ''}/orders` }]
  }).html;
}

sendEmail.sendEmail = sendEmail;
sendEmail.verificationEmail = verificationEmail;
sendEmail.passwordResetEmail = passwordResetEmail;
sendEmail.vendorApprovalEmail = vendorApprovalEmail;
sendEmail.orderConfirmationEmail = orderConfirmationEmail;

module.exports = sendEmail;

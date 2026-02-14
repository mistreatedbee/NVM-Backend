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
    actionUrl: verificationUrl,
    actionLabel: 'Verify Email'
  }).html;
}

function passwordResetEmail(userName, resetUrl) {
  return renderTemplate('password_reset', {
    userName,
    actionUrl: resetUrl,
    actionLabel: 'Reset Password'
  }).html;
}

function vendorApprovalEmail(vendorName, storeName) {
  return renderTemplate('vendor_approved', {
    userName: vendorName,
    vendorName: storeName,
    actionUrl: `${process.env.APP_BASE_URL || process.env.FRONTEND_URL || ''}/vendor/dashboard`,
    actionLabel: 'Open Vendor Dashboard'
  }).html;
}

function orderConfirmationEmail(customerName, orderNumber) {
  return renderTemplate('order_confirmation', {
    userName: customerName,
    orderId: orderNumber,
    actionUrl: `${process.env.APP_BASE_URL || process.env.FRONTEND_URL || ''}/orders`,
    actionLabel: 'Track Order'
  }).html;
}

sendEmail.sendEmail = sendEmail;
sendEmail.verificationEmail = verificationEmail;
sendEmail.passwordResetEmail = passwordResetEmail;
sendEmail.vendorApprovalEmail = vendorApprovalEmail;
sendEmail.orderConfirmationEmail = orderConfirmationEmail;

module.exports = sendEmail;

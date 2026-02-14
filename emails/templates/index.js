const { authTemplates } = require('./auth');
const { accountTemplates } = require('./account');
const { orderTemplates } = require('./orders');
const { paymentTemplates } = require('./payments');
const { supportTemplates } = require('./support');
const { systemTemplates } = require('./system');
const { renderTemplate: factoryRender } = require('./_factory');

const allTemplates = [
  ...authTemplates,
  ...accountTemplates,
  ...orderTemplates,
  ...paymentTemplates,
  ...supportTemplates,
  ...systemTemplates
];

const registry = new Map(allTemplates.map((tpl) => [tpl.key, tpl]));

const aliasMap = {
  verifyEmail: 'email_verification',
  resetPassword: 'password_reset',
  passwordChanged: 'password_changed',
  vendorPending: 'vendor_registration_received',
  vendorApproved: 'vendor_approved',
  vendorRejected: 'vendor_rejected',
  accountSuspended: 'account_suspended',
  accountUnsuspended: 'account_unsuspended',
  accountBanned: 'account_banned',
  accountUnbanned: 'account_unbanned',
  orderConfirmationCustomer: 'order_confirmation',
  newOrderVendor: 'new_order_received',
  orderStatusUpdateCustomer: 'order_status_update',
  orderDeliveredCustomer: 'order_delivered',
  orderCancelledCustomer: 'order_cancelled',
  invoiceAvailableCustomer: 'invoice_available',
  newVendorPendingAdmin: 'new_vendor_needs_approval',
  chatbotEscalationAdmin: 'chatbot_escalation_admin',
  verification: 'email_verification',
  resend_verification_email: 'resend_verification',
  welcome: 'welcome_email',
  forgot_password: 'password_reset',
  password_successfully_changed: 'password_changed',
  suspicious_login_alert: 'new_login_alert',
  two_factor_code_email: 'two_factor_code',
  vendor_registration_submitted: 'vendor_registration_received',
  vendor_approval: 'vendor_approved',
  account_status: 'account_status_update',
  order_status: 'order_status_update',
  invoice_ready: 'invoice_available',
  system_alert: 'new_vendor_needs_approval',
  admin_escalation: 'chatbot_escalation_admin',
  payout_processed: 'payout_completed',
  new_order_vendor: 'new_order_received'
};

function resolveTemplateKey(input) {
  const key = String(input || '').trim();
  if (registry.has(key)) return key;
  if (aliasMap[key] && registry.has(aliasMap[key])) return aliasMap[key];
  return null;
}

function renderTemplate(templateName, variables = {}) {
  const key = resolveTemplateKey(templateName);
  if (!key) {
    throw new Error(`Unknown email template: ${templateName}`);
  }

  const template = registry.get(key);
  return factoryRender(template, variables);
}

function listTemplates() {
  return allTemplates.map((tpl) => ({
    name: tpl.key,
    subject: typeof tpl.subject === 'string' ? tpl.subject : 'Dynamic subject',
    requiredVariables: tpl.requiredVariables || []
  }));
}

module.exports = {
  renderTemplate,
  listTemplates,
  resolveTemplateKey,
  templateNames: Array.from(registry.keys()),
  aliasMap
};

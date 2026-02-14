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
  payout_processed: 'payout_completed',
  admin_escalation: 'support_ticket_created',
  system_alert: 'critical_system_alert',
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

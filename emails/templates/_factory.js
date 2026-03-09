const { baseLayout } = require('../components/baseLayout');
const { orderSummaryTable } = require('../components/orderSummaryTable');
const { statusBadge } = require('../components/statusBadge');
const { escapeHtml, safeUrl, toText } = require('../components/utils');
const { getAppBaseUrl } = require('../../utils/appUrl');

function commonVars(vars = {}) {
  const actionUrl = vars.actionUrl || (Array.isArray(vars.actionLinks) && vars.actionLinks[0]?.url) || '';
  const actionLabel = vars.actionLabel || (Array.isArray(vars.actionLinks) && vars.actionLinks[0]?.label) || '';
  return {
    supportEmail: vars.supportEmail || process.env.SUPPORT_EMAIL || 'support@nvm.local',
    appUrl: vars.appUrl || getAppBaseUrl(),
    actionUrl,
    actionLabel,
    ...vars
  };
}

function fallbackText({ title, lines = [], actionUrl }) {
  return [title, ...lines, actionUrl ? `Action: ${actionUrl}` : ''].filter(Boolean).join('\n');
}

function cardBlock(content) {
  return `<div style="margin:14px 0;padding:12px;border:1px solid #e5e7eb;border-radius:8px;background:#fafafa;">${content}</div>`;
}

function buildTemplate({ key, subject, requiredVariables = [], compose }) {
  return { key, subject, requiredVariables, compose };
}

function renderTemplate(template, rawVars = {}) {
  const vars = commonVars(rawVars);
  const payload = template.compose(vars);
  return {
    key: template.key,
    requiredVariables: template.requiredVariables,
    subject: typeof template.subject === 'function' ? template.subject(vars) : template.subject,
    html: payload.html,
    text: payload.text
  };
}

function actionLabel(vars, fallback) {
  return vars.actionLabel || fallback;
}

module.exports = {
  buildTemplate,
  renderTemplate,
  fallbackText,
  cardBlock,
  actionLabel,
  commonVars,
  baseLayout,
  orderSummaryTable,
  statusBadge,
  escapeHtml,
  safeUrl,
  toText
};

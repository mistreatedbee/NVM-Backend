const {
  buildTemplate,
  renderTemplate,
  fallbackText,
  actionLabel,
  baseLayout,
  cardBlock,
  escapeHtml
} = require('./_factory');

const paymentTemplates = [
  buildTemplate({
    key: 'payout_initiated',
    subject: 'Payout initiated',
    requiredVariables: ['userName'],
    compose: (vars) => {
      const details = cardBlock(`<p style="margin:0;"><strong>Reference:</strong> ${escapeHtml(vars.reference || vars.orderId || '-')}</p>`);
      const html = baseLayout({
        title: 'Payout initiated',
        preheader: 'A payout transfer has started.',
        greeting: `Hi ${vars.userName || 'there'},`,
        paragraphs: ['Your payout has been initiated and is being processed.'],
        cta: { label: actionLabel(vars, 'View Payouts'), url: vars.actionUrl || `${vars.appUrl}/vendor/dashboard` },
        supportEmail: vars.supportEmail,
        footerLinks: [{ label: 'Vendor Dashboard', url: `${vars.appUrl}/vendor/dashboard` }]
      }).replace('</td>', `${details}</td>`);
      return { html, text: fallbackText({ title: 'Payout initiated', lines: [`Reference: ${vars.reference || vars.orderId || '-'}`], actionUrl: vars.actionUrl || `${vars.appUrl}/vendor/dashboard` }) };
    }
  }),
  buildTemplate({
    key: 'payout_completed',
    subject: 'Payout completed',
    requiredVariables: ['userName'],
    compose: (vars) => {
      const amount = vars.amount ? `Amount: ${vars.amount}` : 'Amount: statement available in dashboard.';
      const html = baseLayout({
        title: 'Payout completed',
        preheader: 'Funds have been sent.',
        greeting: `Hi ${vars.userName || 'there'},`,
        paragraphs: ['Your payout was completed successfully.', amount],
        cta: { label: actionLabel(vars, 'Open Dashboard'), url: vars.actionUrl || `${vars.appUrl}/vendor/dashboard` },
        supportEmail: vars.supportEmail,
        footerLinks: [{ label: 'Dashboard', url: `${vars.appUrl}/vendor/dashboard` }]
      });
      return { html, text: fallbackText({ title: 'Payout completed', lines: [amount], actionUrl: vars.actionUrl || `${vars.appUrl}/vendor/dashboard` }) };
    }
  }),
  buildTemplate({
    key: 'withdrawal_requested',
    subject: 'Withdrawal request received',
    requiredVariables: ['userName'],
    compose: (vars) => {
      const html = baseLayout({
        title: 'Withdrawal requested',
        preheader: 'Your request is under review.',
        greeting: `Hi ${vars.userName || 'there'},`,
        paragraphs: ['We received your withdrawal request and started processing it.'],
        cta: { label: actionLabel(vars, 'View Withdrawal Status'), url: vars.actionUrl || `${vars.appUrl}/vendor/dashboard` },
        supportEmail: vars.supportEmail,
        footerLinks: [{ label: 'Payouts', url: `${vars.appUrl}/vendor/dashboard` }]
      });
      return { html, text: fallbackText({ title: 'Withdrawal requested', lines: ['Your request is under review.'], actionUrl: vars.actionUrl || `${vars.appUrl}/vendor/dashboard` }) };
    }
  }),
  buildTemplate({
    key: 'withdrawal_failed',
    subject: 'Withdrawal failed',
    requiredVariables: ['userName'],
    compose: (vars) => {
      const reason = vars.reason || 'Please verify bank details and retry.';
      const html = baseLayout({
        title: 'Withdrawal failed',
        preheader: 'Action required',
        greeting: `Hi ${vars.userName || 'there'},`,
        paragraphs: ['Your withdrawal request failed.', `Reason: ${reason}`],
        cta: { label: actionLabel(vars, 'Update Bank Details'), url: vars.actionUrl || `${vars.appUrl}/vendor/dashboard` },
        supportEmail: vars.supportEmail,
        footerLinks: [{ label: 'Support', url: `mailto:${vars.supportEmail}` }]
      });
      return { html, text: fallbackText({ title: 'Withdrawal failed', lines: [`Reason: ${reason}`], actionUrl: vars.actionUrl || `${vars.appUrl}/vendor/dashboard` }) };
    }
  })
];

module.exports = {
  paymentTemplates,
  renderTemplate
};

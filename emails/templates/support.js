const {
  buildTemplate,
  renderTemplate,
  fallbackText,
  actionLabel,
  baseLayout
} = require('./_factory');

const supportTemplates = [
  buildTemplate({
    key: 'support_ticket_created',
    subject: 'Support ticket created',
    requiredVariables: ['ticketId'],
    compose: (vars) => {
      const html = baseLayout({
        title: 'Support ticket created',
        preheader: 'Your support ticket is open.',
        greeting: `Hi ${vars.userName || 'there'},`,
        paragraphs: [`Ticket ${vars.ticketId || '-'} has been created.`, 'Our team will update you soon.'],
        cta: { label: actionLabel(vars, 'View Ticket'), url: vars.actionUrl || `${vars.appUrl}/chat` },
        supportEmail: vars.supportEmail,
        footerLinks: [{ label: 'Support center', url: `${vars.appUrl}/chat` }]
      });
      return { html, text: fallbackText({ title: 'Support ticket created', lines: [`Ticket: ${vars.ticketId || '-'}`], actionUrl: vars.actionUrl || `${vars.appUrl}/chat` }) };
    }
  }),
  buildTemplate({
    key: 'support_ticket_updated',
    subject: 'Support ticket updated',
    requiredVariables: ['ticketId'],
    compose: (vars) => {
      const html = baseLayout({
        title: 'Support ticket updated',
        preheader: 'There is an update on your ticket.',
        greeting: `Hi ${vars.userName || 'there'},`,
        paragraphs: [`Ticket ${vars.ticketId || '-'} has a new update.`],
        cta: { label: actionLabel(vars, 'Open Ticket'), url: vars.actionUrl || `${vars.appUrl}/chat` },
        supportEmail: vars.supportEmail,
        footerLinks: [{ label: 'Support center', url: `${vars.appUrl}/chat` }]
      });
      return { html, text: fallbackText({ title: 'Support ticket updated', lines: [`Ticket: ${vars.ticketId || '-'}`], actionUrl: vars.actionUrl || `${vars.appUrl}/chat` }) };
    }
  }),
  buildTemplate({
    key: 'dispute_opened',
    subject: 'Dispute opened',
    requiredVariables: ['orderId'],
    compose: (vars) => {
      const html = baseLayout({
        title: 'Dispute opened',
        preheader: 'A dispute case has been opened.',
        greeting: `Hi ${vars.userName || 'there'},`,
        paragraphs: [`Dispute created for order ${vars.orderId || '-'}.`],
        cta: { label: actionLabel(vars, 'View Dispute'), url: vars.actionUrl || `${vars.appUrl}/orders` },
        supportEmail: vars.supportEmail,
        footerLinks: [{ label: 'Order details', url: `${vars.appUrl}/orders` }]
      });
      return { html, text: fallbackText({ title: 'Dispute opened', lines: [`Order: ${vars.orderId || '-'}`], actionUrl: vars.actionUrl || `${vars.appUrl}/orders` }) };
    }
  }),
  buildTemplate({
    key: 'dispute_resolved',
    subject: 'Dispute resolved',
    requiredVariables: ['orderId'],
    compose: (vars) => {
      const outcome = vars.outcome || 'Resolved';
      const html = baseLayout({
        title: 'Dispute resolved',
        preheader: 'Dispute case update',
        greeting: `Hi ${vars.userName || 'there'},`,
        paragraphs: [`Dispute for order ${vars.orderId || '-'} has been resolved.`, `Outcome: ${outcome}`],
        cta: { label: actionLabel(vars, 'Review Resolution'), url: vars.actionUrl || `${vars.appUrl}/orders` },
        supportEmail: vars.supportEmail,
        footerLinks: [{ label: 'Order details', url: `${vars.appUrl}/orders` }]
      });
      return { html, text: fallbackText({ title: 'Dispute resolved', lines: [`Outcome: ${outcome}`], actionUrl: vars.actionUrl || `${vars.appUrl}/orders` }) };
    }
  })
];

module.exports = {
  supportTemplates,
  renderTemplate
};

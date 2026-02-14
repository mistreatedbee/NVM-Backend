const {
  buildTemplate,
  renderTemplate,
  fallbackText,
  actionLabel,
  baseLayout
} = require('./_factory');

const systemTemplates = [
  buildTemplate({
    key: 'chatbot_escalation_admin',
    subject: 'Admin alert: Chatbot escalation',
    requiredVariables: [],
    compose: (vars) => {
      const html = baseLayout({
        title: 'Chat escalation requires admin',
        preheader: 'A conversation has been escalated to support.',
        greeting: 'Hello Admin,',
        paragraphs: [vars.details || 'A chatbot conversation could not be resolved and needs manual support.'],
        cta: { label: actionLabel(vars, 'Open escalations'), url: vars.actionUrl || `${vars.appUrl}/admin/chats` },
        supportEmail: vars.supportEmail,
        footerLinks: [{ label: 'Admin chats', url: `${vars.appUrl}/admin/chats` }]
      });
      return { html, text: fallbackText({ title: 'Chat escalation requires admin', lines: [vars.details || 'A chatbot escalation requires attention.'], actionUrl: vars.actionUrl || `${vars.appUrl}/admin/chats` }) };
    }
  }),
  buildTemplate({
    key: 'new_vendor_needs_approval',
    subject: 'Admin alert: Vendor pending approval',
    requiredVariables: ['vendorName'],
    compose: (vars) => {
      const html = baseLayout({
        title: 'Vendor awaiting approval',
        preheader: 'Admin action required',
        greeting: 'Hello Admin,',
        paragraphs: [`Vendor ${vars.vendorName || '-'} submitted an application and needs review.`],
        cta: { label: actionLabel(vars, 'Review Vendors'), url: vars.actionUrl || `${vars.appUrl}/admin/vendors` },
        supportEmail: vars.supportEmail,
        footerLinks: [{ label: 'Admin dashboard', url: `${vars.appUrl}/admin/vendors` }]
      });
      return { html, text: fallbackText({ title: 'Vendor awaiting approval', lines: [`Vendor: ${vars.vendorName || '-'}`], actionUrl: vars.actionUrl || `${vars.appUrl}/admin/vendors` }) };
    }
  }),
  buildTemplate({
    key: 'fraud_report_alert',
    subject: 'Admin alert: Fraud/abuse report',
    requiredVariables: [],
    compose: (vars) => {
      const html = baseLayout({
        title: 'Fraud or abuse report',
        preheader: 'Immediate admin review recommended.',
        greeting: 'Hello Admin,',
        paragraphs: [vars.details || 'A fraud/abuse report was submitted and requires investigation.'],
        cta: { label: actionLabel(vars, 'Open Admin Review'), url: vars.actionUrl || `${vars.appUrl}/admin` },
        supportEmail: vars.supportEmail,
        footerLinks: [{ label: 'Admin', url: `${vars.appUrl}/admin` }]
      });
      return { html, text: fallbackText({ title: 'Fraud report alert', lines: [vars.details || 'A report was submitted.'], actionUrl: vars.actionUrl || `${vars.appUrl}/admin` }) };
    }
  }),
  buildTemplate({
    key: 'critical_system_alert',
    subject: 'Critical system alert',
    requiredVariables: [],
    compose: (vars) => {
      const html = baseLayout({
        title: 'Critical system alert',
        preheader: 'System intervention required.',
        greeting: 'Hello Admin,',
        paragraphs: [vars.details || 'A critical system event has occurred.'],
        cta: { label: actionLabel(vars, 'Open Monitoring'), url: vars.actionUrl || `${vars.appUrl}/admin` },
        supportEmail: vars.supportEmail,
        footerLinks: [{ label: 'Admin', url: `${vars.appUrl}/admin` }]
      });
      return { html, text: fallbackText({ title: 'Critical system alert', lines: [vars.details || 'A critical system event occurred.'], actionUrl: vars.actionUrl || `${vars.appUrl}/admin` }) };
    }
  })
];

module.exports = {
  systemTemplates,
  renderTemplate
};

const {
  buildTemplate,
  renderTemplate,
  fallbackText,
  actionLabel,
  baseLayout,
  statusBadge,
  cardBlock
} = require('./_factory');

const accountTemplates = [
  buildTemplate({
    key: 'vendor_registration_received',
    subject: 'Vendor registration received',
    requiredVariables: ['userName', 'vendorName'],
    compose: (vars) => {
      const html = baseLayout({
        title: 'Vendor registration submitted',
        preheader: 'Your application is pending review.',
        greeting: `Hi ${vars.userName || 'there'},`,
        paragraphs: [`We received your registration for ${vars.vendorName || 'your store'}.`, 'Our team will review and notify you once complete.'],
        cta: { label: actionLabel(vars, 'Check Application Status'), url: vars.actionUrl || `${vars.appUrl}/vendor/approval-status` },
        supportEmail: vars.supportEmail,
        footerLinks: [{ label: 'Vendor Portal', url: `${vars.appUrl}/vendor/approval-status` }]
      });
      return { html, text: fallbackText({ title: 'Vendor registration submitted', lines: ['Your application is pending review.'], actionUrl: vars.actionUrl || `${vars.appUrl}/vendor/approval-status` }) };
    }
  }),
  buildTemplate({
    key: 'vendor_approved',
    subject: 'Vendor application approved',
    requiredVariables: ['userName', 'vendorName'],
    compose: (vars) => {
      const html = baseLayout({
        title: 'You are approved to sell',
        preheader: 'Your vendor account is active.',
        greeting: `Hi ${vars.userName || 'there'},`,
        paragraphs: [`${vars.vendorName || 'Your store'} is now approved.`, 'You can start listing products and receiving orders.'],
        cta: { label: actionLabel(vars, 'Go to Vendor Dashboard'), url: vars.actionUrl || `${vars.appUrl}/vendor/dashboard` },
        supportEmail: vars.supportEmail,
        footerLinks: [{ label: 'Vendor Dashboard', url: `${vars.appUrl}/vendor/dashboard` }]
      });
      return { html, text: fallbackText({ title: 'Vendor approved', lines: ['Your vendor account is active.'], actionUrl: vars.actionUrl || `${vars.appUrl}/vendor/dashboard` }) };
    }
  }),
  buildTemplate({
    key: 'vendor_rejected',
    subject: 'Vendor application update',
    requiredVariables: ['userName'],
    compose: (vars) => {
      const reason = vars.reason || 'No reason provided.';
      const reasonBlock = cardBlock(`<p style="margin:0;"><strong>Reason:</strong> ${reason}</p>`);
      const html = baseLayout({
        title: 'Vendor application rejected',
        preheader: 'Your application could not be approved.',
        greeting: `Hi ${vars.userName || 'there'},`,
        paragraphs: ['Your vendor application was not approved at this time.'],
        cta: { label: actionLabel(vars, 'Contact Support'), url: vars.actionUrl || `mailto:${vars.supportEmail}` },
        supportEmail: vars.supportEmail,
        footerLinks: [{ label: 'Support', url: `mailto:${vars.supportEmail}` }]
      }).replace('</td>', `${reasonBlock}</td>`);
      return { html, text: fallbackText({ title: 'Vendor application rejected', lines: [`Reason: ${reason}`], actionUrl: vars.actionUrl || `mailto:${vars.supportEmail}` }) };
    }
  }),
  buildTemplate({
    key: 'account_suspended',
    subject: 'Account suspended',
    requiredVariables: ['userName'],
    compose: (vars) => {
      const reason = vars.reason || 'Policy review pending.';
      const html = baseLayout({
        title: 'Your account is suspended',
        preheader: 'Action required',
        greeting: `Hi ${vars.userName || 'there'},`,
        paragraphs: ['Your account has been temporarily suspended.', `Reason: ${reason}`, 'You can submit an appeal using the link below.'],
        cta: { label: actionLabel(vars, 'Submit Appeal'), url: vars.actionUrl || `mailto:${vars.supportEmail}` },
        supportEmail: vars.supportEmail,
        footerLinks: [{ label: 'Appeal Support', url: `mailto:${vars.supportEmail}` }]
      });
      return { html, text: fallbackText({ title: 'Account suspended', lines: [`Reason: ${reason}`], actionUrl: vars.actionUrl || `mailto:${vars.supportEmail}` }) };
    }
  }),
  buildTemplate({
    key: 'account_banned',
    subject: 'Account banned notice',
    requiredVariables: ['userName'],
    compose: (vars) => {
      const reason = vars.reason || 'Terms violation.';
      const html = baseLayout({
        title: 'Your account is banned',
        preheader: 'Account restriction notice',
        greeting: `Hi ${vars.userName || 'there'},`,
        paragraphs: ['Your account has been permanently restricted.', `Reason: ${reason}`, 'You may contact support for appeal options.'],
        cta: { label: actionLabel(vars, 'Contact Support'), url: vars.actionUrl || `mailto:${vars.supportEmail}` },
        supportEmail: vars.supportEmail,
        footerLinks: [{ label: 'Support', url: `mailto:${vars.supportEmail}` }]
      });
      return { html, text: fallbackText({ title: 'Account banned', lines: [`Reason: ${reason}`], actionUrl: vars.actionUrl || `mailto:${vars.supportEmail}` }) };
    }
  }),
  buildTemplate({
    key: 'account_reinstated',
    subject: 'Account reinstated',
    requiredVariables: ['userName'],
    compose: (vars) => {
      const html = baseLayout({
        title: 'Account reinstated',
        preheader: 'Your account is active again.',
        greeting: `Hi ${vars.userName || 'there'},`,
        paragraphs: ['Your account restriction has been lifted. You can now sign in and continue using the platform.'],
        cta: { label: actionLabel(vars, 'Sign In'), url: vars.actionUrl || `${vars.appUrl}/login` },
        supportEmail: vars.supportEmail,
        footerLinks: [{ label: 'Login', url: `${vars.appUrl}/login` }]
      });
      return { html, text: fallbackText({ title: 'Account reinstated', lines: ['Your account is active again.'], actionUrl: vars.actionUrl || `${vars.appUrl}/login` }) };
    }
  }),
  buildTemplate({
    key: 'profile_updated',
    subject: 'Profile updated confirmation',
    requiredVariables: ['userName'],
    compose: (vars) => {
      const html = baseLayout({
        title: 'Profile updated',
        preheader: 'Your account details were updated.',
        greeting: `Hi ${vars.userName || 'there'},`,
        paragraphs: ['Your profile information was changed successfully.', 'If this was not you, secure your account immediately.'],
        cta: { label: actionLabel(vars, 'Review Profile'), url: vars.actionUrl || `${vars.appUrl}/profile` },
        supportEmail: vars.supportEmail,
        footerLinks: [{ label: 'Profile', url: `${vars.appUrl}/profile` }]
      });
      return { html, text: fallbackText({ title: 'Profile updated', lines: ['Your profile was updated successfully.'], actionUrl: vars.actionUrl || `${vars.appUrl}/profile` }) };
    }
  }),
  buildTemplate({
    key: 'account_status_update',
    subject: (vars) => `Account status update: ${vars.status || 'updated'}`,
    requiredVariables: ['userName', 'status'],
    compose: (vars) => {
      const badge = cardBlock(statusBadge(vars.status || 'updated'));
      const html = baseLayout({
        title: 'Account status update',
        preheader: 'Status change notification',
        greeting: `Hi ${vars.userName || 'there'},`,
        paragraphs: ['Your account status has changed.'],
        cta: { label: actionLabel(vars, 'View Account'), url: vars.actionUrl || `${vars.appUrl}/profile` },
        supportEmail: vars.supportEmail,
        footerLinks: [{ label: 'Profile', url: `${vars.appUrl}/profile` }]
      }).replace('</td>', `${badge}</td>`);
      return { html, text: fallbackText({ title: 'Account status update', lines: [`Status: ${vars.status || 'updated'}`], actionUrl: vars.actionUrl || `${vars.appUrl}/profile` }) };
    }
  })
];

module.exports = {
  accountTemplates,
  renderTemplate
};

const {
  buildTemplate,
  renderTemplate,
  fallbackText,
  actionLabel,
  baseLayout,
  escapeHtml,
  safeUrl,
  cardBlock
} = require('./_factory');

const authTemplates = [
  buildTemplate({
    key: 'email_verification',
    subject: 'Verify your NVM account',
    requiredVariables: ['userName', 'actionUrl'],
    compose: (vars) => {
      const html = baseLayout({
        title: 'Verify your email',
        preheader: 'Activate your account securely.',
        greeting: `Hi ${vars.userName || 'there'},`,
        paragraphs: ['Confirm your email address to complete account setup.'],
        cta: { label: actionLabel(vars, 'Verify Email'), url: vars.actionUrl },
        supportEmail: vars.supportEmail,
        footerLinks: [{ label: 'Open NVM', url: vars.appUrl }]
      });
      return { html, text: fallbackText({ title: 'Verify your email', lines: ['Confirm your email address to complete account setup.'], actionUrl: vars.actionUrl }) };
    }
  }),
  buildTemplate({
    key: 'resend_verification',
    subject: 'Your new verification link',
    requiredVariables: ['userName', 'actionUrl'],
    compose: (vars) => {
      const html = baseLayout({
        title: 'Verification email resent',
        preheader: 'Use this latest link to verify your account.',
        greeting: `Hi ${vars.userName || 'there'},`,
        paragraphs: ['Use the new verification link below. Previous links may no longer work.'],
        cta: { label: actionLabel(vars, 'Verify Now'), url: vars.actionUrl },
        supportEmail: vars.supportEmail,
        footerLinks: [{ label: 'Open NVM', url: vars.appUrl }]
      });
      return { html, text: fallbackText({ title: 'Verification email resent', lines: ['Use the new link below to verify your account.'], actionUrl: vars.actionUrl }) };
    }
  }),
  buildTemplate({
    key: 'welcome_email',
    subject: 'Welcome to NVM Marketplace',
    requiredVariables: ['userName'],
    compose: (vars) => {
      const html = baseLayout({
        title: 'Welcome to NVM',
        preheader: 'Your account is active.',
        greeting: `Hi ${vars.userName || 'there'},`,
        paragraphs: ['Your account is verified and ready. Explore products and vendors now.'],
        cta: { label: actionLabel(vars, 'Go to Marketplace'), url: vars.actionUrl || `${vars.appUrl}/marketplace` },
        supportEmail: vars.supportEmail,
        footerLinks: [{ label: 'Marketplace', url: `${vars.appUrl}/marketplace` }]
      });
      return { html, text: fallbackText({ title: 'Welcome to NVM', lines: ['Your account is verified and ready.'], actionUrl: vars.actionUrl || `${vars.appUrl}/marketplace` }) };
    }
  }),
  buildTemplate({
    key: 'password_reset',
    subject: 'Reset your password',
    requiredVariables: ['actionUrl'],
    compose: (vars) => {
      const html = baseLayout({
        title: 'Reset password request',
        preheader: 'If this was you, continue securely.',
        greeting: `Hi ${vars.userName || 'there'},`,
        paragraphs: ['We received a request to reset your password. This link expires soon.'],
        cta: { label: actionLabel(vars, 'Reset Password'), url: vars.actionUrl },
        supportEmail: vars.supportEmail,
        footerLinks: [{ label: 'Security Help', url: `${vars.appUrl}/profile` }]
      });
      return { html, text: fallbackText({ title: 'Reset password request', lines: ['Use the secure link below to reset your password.'], actionUrl: vars.actionUrl }) };
    }
  }),
  buildTemplate({
    key: 'password_changed',
    subject: 'Your password was changed',
    requiredVariables: ['userName'],
    compose: (vars) => {
      const html = baseLayout({
        title: 'Password updated',
        preheader: 'Security confirmation',
        greeting: `Hi ${vars.userName || 'there'},`,
        paragraphs: ['Your password has just been changed.', 'If this was not you, contact support immediately.'],
        cta: { label: actionLabel(vars, 'Review Security Settings'), url: vars.actionUrl || `${vars.appUrl}/profile` },
        supportEmail: vars.supportEmail,
        footerLinks: [{ label: 'Security', url: `${vars.appUrl}/profile` }]
      });
      return { html, text: fallbackText({ title: 'Password updated', lines: ['Your password has been changed.'], actionUrl: vars.actionUrl || `${vars.appUrl}/profile` }) };
    }
  }),
  buildTemplate({
    key: 'new_login_alert',
    subject: 'New login detected',
    requiredVariables: ['userName'],
    compose: (vars) => {
      const details = cardBlock(`
        <p style="margin:0 0 6px 0;"><strong>Time:</strong> ${escapeHtml(vars.loginTime || 'Unknown')}</p>
        <p style="margin:0 0 6px 0;"><strong>IP:</strong> ${escapeHtml(vars.ipAddress || 'Unknown')}</p>
        <p style="margin:0;"><strong>Device:</strong> ${escapeHtml(vars.device || 'Unknown')}</p>
      `);
      const html = baseLayout({
        title: 'New login detected',
        preheader: 'Security alert',
        greeting: `Hi ${vars.userName || 'there'},`,
        paragraphs: ['A new login was detected on your account.'],
        cta: { label: actionLabel(vars, 'Secure Account'), url: vars.actionUrl || `${vars.appUrl}/profile` },
        supportEmail: vars.supportEmail,
        footerLinks: [{ label: 'Account', url: `${vars.appUrl}/profile` }]
      }).replace('</td>', `${details}</td>`);
      return { html, text: fallbackText({ title: 'New login detected', lines: [`Time: ${vars.loginTime || 'Unknown'}`, `IP: ${vars.ipAddress || 'Unknown'}`], actionUrl: vars.actionUrl || `${vars.appUrl}/profile` }) };
    }
  }),
  buildTemplate({
    key: 'two_factor_code',
    subject: 'Your verification code',
    requiredVariables: ['code'],
    compose: (vars) => {
      const codeBlock = cardBlock(`<p style="margin:0;font-size:28px;letter-spacing:6px;font-weight:700;text-align:center;">${escapeHtml(vars.code || '000000')}</p>`);
      const html = baseLayout({
        title: 'Two-factor verification',
        preheader: 'Use this one-time code.',
        greeting: `Hi ${vars.userName || 'there'},`,
        paragraphs: ['Use this code to complete login. Do not share it.'],
        supportEmail: vars.supportEmail,
        footerLinks: [{ label: 'NVM Security', url: `${vars.appUrl}/profile` }]
      }).replace('</td>', `${codeBlock}</td>`);
      return { html, text: fallbackText({ title: 'Two-factor verification', lines: [`Code: ${vars.code || '000000'}`] }) };
    }
  })
];

module.exports = {
  authTemplates,
  renderTemplate
};

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderActionLinks(actionLinks = []) {
  if (!Array.isArray(actionLinks) || !actionLinks.length) {
    return '';
  }

  return actionLinks
    .map((link) => {
      const label = escapeHtml(link?.label || 'Open');
      const href = escapeHtml(link?.url || '#');
      return `<a href="${href}" style="display:inline-block;padding:10px 16px;background:#14532d;color:#ffffff;text-decoration:none;border-radius:8px;margin-right:8px;margin-bottom:8px;">${label}</a>`;
    })
    .join('');
}

function layout({ title, preheader, body, actionLinks }) {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>${escapeHtml(title)}</title>
</head>
<body style="margin:0;padding:0;background:#f5f7f9;font-family:Arial,sans-serif;color:#111827;">
  <div style="max-width:640px;margin:0 auto;padding:24px;">
    <div style="background:#ffffff;border-radius:14px;overflow:hidden;border:1px solid #e5e7eb;">
      <div style="padding:20px;background:#14532d;color:#ffffff;">
        <div style="font-size:12px;letter-spacing:0.08em;text-transform:uppercase;opacity:0.85;">NVM Marketplace</div>
        <h1 style="margin:8px 0 0 0;font-size:22px;line-height:1.2;">${escapeHtml(title)}</h1>
      </div>
      <div style="padding:24px;">
        <p style="margin-top:0;color:#4b5563;">${escapeHtml(preheader || '')}</p>
        ${body}
        <div style="margin-top:18px;">${renderActionLinks(actionLinks)}</div>
      </div>
    </div>
  </div>
</body>
</html>`;
}

function asParagraphs(lines = []) {
  return lines
    .filter(Boolean)
    .map((line) => `<p style="margin:0 0 12px 0;line-height:1.55;">${escapeHtml(line)}</p>`)
    .join('');
}

const templates = {
  verification: ({ userName, actionLinks }) => ({
    subject: 'Verify your email address',
    html: layout({
      title: 'Verify your email',
      preheader: 'Complete your account setup.',
      body: asParagraphs([
        `Hi ${userName || 'there'},`,
        'Please verify your email to secure your account and unlock protected actions.'
      ]),
      actionLinks
    }),
    text: `Verify your email. ${actionLinks?.[0]?.url || ''}`
  }),
  password_reset: ({ userName, actionLinks }) => ({
    subject: 'Reset your password',
    html: layout({
      title: 'Reset password request',
      preheader: 'If you requested this, use the button below.',
      body: asParagraphs([
        `Hi ${userName || 'there'},`,
        'We received a password reset request. This link expires shortly.'
      ]),
      actionLinks
    }),
    text: `Reset your password: ${actionLinks?.[0]?.url || ''}`
  }),
  vendor_approved: ({ userName, vendorName, actionLinks }) => ({
    subject: 'Vendor application approved',
    html: layout({
      title: 'You are approved',
      preheader: 'Your vendor account is now active.',
      body: asParagraphs([
        `Hi ${userName || 'there'},`,
        `${vendorName || 'Your store'} is now approved and can start selling.`
      ]),
      actionLinks
    }),
    text: `${vendorName || 'Store'} approved.`
  }),
  vendor_rejected: ({ userName, status, actionLinks }) => ({
    subject: 'Vendor application update',
    html: layout({
      title: 'Vendor application update',
      preheader: 'Your registration has been reviewed.',
      body: asParagraphs([
        `Hi ${userName || 'there'},`,
        `Status: ${status || 'rejected'}. Contact support if you need help.`
      ]),
      actionLinks
    }),
    text: `Vendor status: ${status || 'rejected'}`
  }),
  order_confirmation: ({ userName, orderId, actionLinks }) => ({
    subject: `Order ${orderId} confirmed`,
    html: layout({
      title: 'Order confirmed',
      preheader: 'Your order has been placed successfully.',
      body: asParagraphs([
        `Hi ${userName || 'there'},`,
        `Your order ${orderId || ''} has been received and is now processing.`
      ]),
      actionLinks
    }),
    text: `Order ${orderId || ''} confirmed.`
  }),
  new_order_vendor: ({ userName, orderId, actionLinks }) => ({
    subject: `New order ${orderId}`,
    html: layout({
      title: 'New order received',
      preheader: 'A new customer order needs your attention.',
      body: asParagraphs([
        `Hi ${userName || 'there'},`,
        `You received order ${orderId || ''}.`
      ]),
      actionLinks
    }),
    text: `New order ${orderId || ''}`
  }),
  order_status: ({ userName, orderId, status, actionLinks }) => ({
    subject: `Order ${orderId} status: ${status}`,
    html: layout({
      title: 'Order status update',
      preheader: 'Your order status has changed.',
      body: asParagraphs([
        `Hi ${userName || 'there'},`,
        `Order ${orderId || ''} is now ${status || 'updated'}.`
      ]),
      actionLinks
    }),
    text: `Order ${orderId || ''} status: ${status || 'updated'}`
  }),
  payout_processed: ({ userName, orderId, actionLinks }) => ({
    subject: 'Payout processed',
    html: layout({
      title: 'Payout processed',
      preheader: 'A payout was processed for your account.',
      body: asParagraphs([
        `Hi ${userName || 'there'},`,
        `A payout related to order ${orderId || ''} has been processed.`
      ]),
      actionLinks
    }),
    text: 'Payout processed.'
  }),
  account_status: ({ userName, status, actionLinks }) => ({
    subject: 'Account status updated',
    html: layout({
      title: 'Account status update',
      preheader: 'Your account status has changed.',
      body: asParagraphs([
        `Hi ${userName || 'there'},`,
        `Your account status is now ${status || 'updated'}.`
      ]),
      actionLinks
    }),
    text: `Account status: ${status || 'updated'}`
  }),
  admin_escalation: ({ orderId, actionLinks }) => ({
    subject: 'Escalation requires attention',
    html: layout({
      title: 'New escalation',
      preheader: 'A support escalation has been created.',
      body: asParagraphs([
        `Escalation linked to ${orderId ? `order ${orderId}` : 'a conversation'} requires review.`
      ]),
      actionLinks
    }),
    text: 'New escalation.'
  }),
  system_alert: ({ status, actionLinks }) => ({
    subject: 'System alert',
    html: layout({
      title: 'System alert',
      preheader: 'A system event requires your attention.',
      body: asParagraphs([`Alert status: ${status || 'unknown'}.`]),
      actionLinks
    }),
    text: `System alert: ${status || 'unknown'}`
  }),
  invoice_ready: ({ userName, orderId, actionLinks }) => ({
    subject: `Invoice ready for ${orderId}`,
    html: layout({
      title: 'Invoice ready',
      preheader: 'Your invoice is now available.',
      body: asParagraphs([
        `Hi ${userName || 'there'},`,
        `Invoice for order ${orderId || ''} is ready to view/download.`
      ]),
      actionLinks
    }),
    text: `Invoice ready for order ${orderId || ''}`
  })
};

function renderTemplate(templateId, context = {}) {
  const tpl = templates[templateId];
  if (!tpl) {
    throw new Error(`Unknown email template: ${templateId}`);
  }
  return tpl(context);
}

module.exports = {
  renderTemplate,
  escapeHtml
};

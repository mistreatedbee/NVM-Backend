const { escapeHtml, safeUrl } = require('./utils');
const { ctaButton } = require('./ctaButton');

function baseLayout({ title, preheader, greeting, paragraphs = [], cta, secondaryCta, supportEmail, footerLinks = [] }) {
  const greetingLine = greeting ? `<p style="margin:0 0 12px 0;line-height:1.6;">${escapeHtml(greeting)}</p>` : '';
  const paragraphHtml = paragraphs
    .filter(Boolean)
    .map((line) => `<p style="margin:0 0 12px 0;line-height:1.6;">${escapeHtml(line)}</p>`)
    .join('');

  const ctaHtml = cta ? `<div style="margin:18px 0;">${ctaButton(cta)}</div>` : '';
  const secondaryHtml = secondaryCta ? `<div style="margin:0 0 18px 0;">${ctaButton({ ...secondaryCta, variant: 'secondary' })}</div>` : '';

  const footerLinkHtml = footerLinks
    .filter((item) => item?.url && item?.label)
    .map((item) => `<a href="${escapeHtml(safeUrl(item.url))}" style="color:#14532d;text-decoration:none;margin-right:10px;">${escapeHtml(item.label)}</a>`)
    .join('');

  const supportLine = supportEmail
    ? `<p style="margin:14px 0 0 0;font-size:12px;color:#6b7280;">Need help? Contact <a href="mailto:${escapeHtml(supportEmail)}" style="color:#14532d;">${escapeHtml(supportEmail)}</a></p>`
    : '';

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(title)}</title>
</head>
<body style="margin:0;padding:0;background:#f4f7f6;font-family:Arial,Helvetica,sans-serif;color:#111827;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(preheader || '')}</div>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f4f7f6;padding:20px 8px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" style="max-width:640px;background:#ffffff;border-radius:14px;overflow:hidden;border:1px solid #e5e7eb;" cellspacing="0" cellpadding="0">
          <tr>
            <td style="background:#14532d;padding:20px;">
              <h1 style="margin:0;color:#ffffff;font-size:24px;line-height:1.3;">NVM Marketplace</h1>
              <p style="margin:6px 0 0 0;color:#d1fae5;font-size:13px;">${escapeHtml(preheader || '')}</p>
            </td>
          </tr>
          <tr>
            <td style="padding:24px;">
              <h2 style="margin:0 0 12px 0;font-size:22px;line-height:1.35;color:#111827;">${escapeHtml(title)}</h2>
              ${greetingLine}
              ${paragraphHtml}
              ${ctaHtml}
              ${secondaryHtml}
              ${supportLine}
            </td>
          </tr>
          <tr>
            <td style="padding:16px 24px;border-top:1px solid #e5e7eb;background:#f9fafb;">
              <p style="margin:0;font-size:12px;color:#6b7280;">Ndingoho Vendor Markets (NVM)</p>
              <p style="margin:8px 0 0 0;font-size:12px;color:#6b7280;word-break:break-all;">${footerLinkHtml}</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

module.exports = {
  baseLayout
};

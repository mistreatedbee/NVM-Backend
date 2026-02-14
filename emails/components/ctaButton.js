const { escapeHtml, safeUrl } = require('./utils');

function ctaButton({ label, url, variant = 'primary' }) {
  const bg = variant === 'secondary' ? '#0f766e' : '#14532d';
  return `<a href="${escapeHtml(safeUrl(url))}" style="display:inline-block;padding:12px 18px;background:${bg};color:#ffffff;text-decoration:none;border-radius:8px;font-weight:700;font-size:14px;">${escapeHtml(label || 'Open')}</a>`;
}

module.exports = {
  ctaButton
};

const { escapeHtml } = require('./utils');

function statusBadge(status = '') {
  const normalized = String(status).toLowerCase();
  const palette = {
    approved: '#166534',
    verified: '#166534',
    completed: '#166534',
    shipped: '#1d4ed8',
    pending: '#92400e',
    processing: '#92400e',
    rejected: '#991b1b',
    failed: '#991b1b',
    suspended: '#991b1b',
    banned: '#991b1b'
  };

  const color = palette[normalized] || '#334155';
  return `<span style="display:inline-block;padding:4px 10px;border-radius:999px;background:${color};color:#ffffff;font-size:12px;font-weight:700;text-transform:capitalize;">${escapeHtml(status || 'update')}</span>`;
}

module.exports = {
  statusBadge
};

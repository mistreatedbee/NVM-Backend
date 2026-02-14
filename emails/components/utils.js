function escapeHtml(input) {
  return String(input ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function safeUrl(input, fallback = '#') {
  const value = String(input || '').trim();
  if (!value) return fallback;
  return value;
}

function toText(input) {
  return String(input ?? '').replace(/\s+/g, ' ').trim();
}

module.exports = {
  escapeHtml,
  safeUrl,
  toText
};

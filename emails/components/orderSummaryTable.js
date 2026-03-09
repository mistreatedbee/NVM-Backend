const { escapeHtml } = require('./utils');

function orderSummaryTable(items = []) {
  if (!Array.isArray(items) || !items.length) {
    return '';
  }

  const rows = items
    .slice(0, 20)
    .map((item) => {
      const name = escapeHtml(item?.name || 'Item');
      const qty = Number(item?.quantity || 1);
      const total = escapeHtml(item?.total || item?.subtotal || '');
      return `<tr>
        <td style="padding:8px;border-bottom:1px solid #e5e7eb;">${name}</td>
        <td style="padding:8px;border-bottom:1px solid #e5e7eb;text-align:center;">${qty}</td>
        <td style="padding:8px;border-bottom:1px solid #e5e7eb;text-align:right;">${total}</td>
      </tr>`;
    })
    .join('');

  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:12px 0;border-collapse:collapse;font-size:14px;">
    <thead>
      <tr>
        <th style="padding:8px;background:#f3f4f6;text-align:left;">Item</th>
        <th style="padding:8px;background:#f3f4f6;text-align:center;">Qty</th>
        <th style="padding:8px;background:#f3f4f6;text-align:right;">Total</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>`;
}

module.exports = {
  orderSummaryTable
};

const PDFDocument = require('pdfkit');

function formatCurrency(amount) {
  const numeric = Number(amount || 0);
  return `R ${numeric.toFixed(2)}`;
}

function formatDate(dateValue) {
  const date = dateValue ? new Date(dateValue) : new Date();
  return date.toLocaleDateString('en-ZA', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
}

function writeLine(doc, label, value, x, y) {
  doc.font('Helvetica-Bold').text(label, x, y);
  doc.font('Helvetica').text(value || '-', x + 130, y);
}

function drawTableHeader(doc, y) {
  doc.fontSize(10).font('Helvetica-Bold');
  doc.text('Item', 50, y, { width: 250 });
  doc.text('Qty', 320, y, { width: 50, align: 'right' });
  doc.text('Unit Price', 380, y, { width: 80, align: 'right' });
  doc.text('Line Total', 470, y, { width: 90, align: 'right' });
  doc.moveTo(50, y + 14).lineTo(550, y + 14).stroke();
  return y + 22;
}

function ensureSpace(doc, y, needed = 40) {
  if (y + needed < 740) return y;
  doc.addPage();
  return 50;
}

function bufferFromDoc(doc) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    doc.end();
  });
}

async function generateInvoicePdfBuffer(invoice) {
  const doc = new PDFDocument({ margin: 50, size: 'A4' });
  let y = 50;

  doc.fontSize(22).font('Helvetica-Bold').text('NVM MARKETPLACE', 50, y);
  y += 28;
  doc.fontSize(10).font('Helvetica').text('Ndingoho Vendor Markets', 50, y);
  y += 14;
  doc.text('South Africa', 50, y);
  y += 24;

  doc.fontSize(18).font('Helvetica-Bold').text(`${invoice.type} INVOICE`, 50, y);
  y += 26;
  writeLine(doc, 'Invoice #', invoice.invoiceNumber, 50, y);
  y += 16;
  writeLine(doc, 'Issued At', formatDate(invoice.issuedAt), 50, y);
  y += 16;
  writeLine(doc, 'Currency', invoice.currency || 'ZAR', 50, y);
  y += 16;
  writeLine(doc, 'Status', invoice.status, 50, y);
  y += 16;
  writeLine(doc, 'Order ID', String(invoice.orderId), 50, y);
  y += 20;

  doc.moveTo(50, y).lineTo(550, y).stroke();
  y += 18;

  doc.fontSize(12).font('Helvetica-Bold').text('Billing Details', 50, y);
  y += 18;
  const billing = invoice.billingDetails || {};
  const billingAddress = billing.address || {};
  doc.fontSize(10).font('Helvetica');
  doc.text(billing.name || '-', 50, y);
  y += 14;
  doc.text(billing.email || '-', 50, y);
  y += 14;
  doc.text(billing.phone || '-', 50, y);
  y += 14;
  doc.text(
    [billingAddress.street, billingAddress.city, billingAddress.state, billingAddress.country, billingAddress.zipCode]
      .filter(Boolean)
      .join(', ') || '-',
    50,
    y,
    { width: 500 }
  );
  y += 24;

  if (invoice.type === 'VENDOR' && invoice.vendorDetails) {
    y = ensureSpace(doc, y, 100);
    doc.fontSize(12).font('Helvetica-Bold').text('Vendor Details', 50, y);
    y += 18;
    const vendor = invoice.vendorDetails;
    const contact = vendor.contact || {};
    const location = vendor.location || {};
    const banking = vendor.banking || {};
    doc.fontSize(10).font('Helvetica');
    doc.text(vendor.storeName || '-', 50, y);
    y += 14;
    doc.text([contact.name, contact.email, contact.phone].filter(Boolean).join(' | ') || '-', 50, y);
    y += 14;
    doc.text([location.addressLine, location.suburb, location.city, location.state, location.country].filter(Boolean).join(', ') || '-', 50, y, { width: 500 });
    y += 14;
    doc.font('Helvetica-Bold').text('Banking Snapshot', 50, y);
    y += 14;
    doc.font('Helvetica').text(
      [
        `Bank: ${banking.bankName || '-'}`,
        `Account Holder: ${banking.accountHolder || '-'}`,
        `Account Number: ${banking.accountNumber || '-'}`,
        `Branch Code: ${banking.branchCode || '-'}`,
        `Account Type: ${banking.accountType || '-'}`,
        `Payout Email: ${banking.payoutEmail || '-'}`,
        `Payout Ref: ${banking.payoutReference || '-'}`
      ].join(' | '),
      50,
      y,
      { width: 500 }
    );
    y += 30;
  }

  y = ensureSpace(doc, y, 100);
  y = drawTableHeader(doc, y);

  for (const item of invoice.lineItems || []) {
    y = ensureSpace(doc, y, 26);
    doc.fontSize(10).font('Helvetica').text(item.titleSnapshot || '-', 50, y, { width: 250 });
    doc.text(String(item.qty || 0), 320, y, { width: 50, align: 'right' });
    doc.text(formatCurrency(item.unitPrice), 380, y, { width: 80, align: 'right' });
    doc.text(formatCurrency(item.lineTotal), 470, y, { width: 90, align: 'right' });
    y += 18;
  }

  y += 8;
  doc.moveTo(330, y).lineTo(550, y).stroke();
  y += 10;
  const totals = invoice.totals || {};
  const rows = [
    ['Subtotal', totals.subtotal],
    ['Delivery', totals.deliveryFee],
    ['Discount', totals.discount],
    ['Tax', totals.tax],
    ['Total', totals.total]
  ];
  for (const [label, value] of rows) {
    doc.fontSize(label === 'Total' ? 12 : 10).font(label === 'Total' ? 'Helvetica-Bold' : 'Helvetica');
    doc.text(label, 330, y, { width: 90 });
    doc.text(formatCurrency(value), 440, y, { width: 110, align: 'right' });
    y += label === 'Total' ? 18 : 14;
  }

  doc.fontSize(8).font('Helvetica').text('Generated by NVM Marketplace', 50, 790, { align: 'center', width: 500 });

  return bufferFromDoc(doc);
}

module.exports = {
  generateInvoicePdfBuffer
};

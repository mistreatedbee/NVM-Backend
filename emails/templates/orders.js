const {
  buildTemplate,
  renderTemplate,
  fallbackText,
  actionLabel,
  baseLayout,
  orderSummaryTable,
  statusBadge,
  cardBlock,
  escapeHtml
} = require('./_factory');

function orderHeader(vars, fallbackStatus) {
  const badge = statusBadge(vars.status || fallbackStatus || 'pending');
  const lines = [`Order: ${vars.orderId || '-'}`, `Status: ${vars.status || fallbackStatus || 'pending'}`];
  return { badgeBlock: cardBlock(badge), lines };
}

const orderTemplates = [
  buildTemplate({
    key: 'order_status_update',
    subject: (vars) => `Order update: ${vars.orderId || ''}`.trim(),
    requiredVariables: ['orderId'],
    compose: (vars) => {
      const status = vars.status || 'updated';
      const { badgeBlock } = orderHeader(vars, status);
      const html = baseLayout({
        title: 'Order status updated',
        preheader: 'There is a status update on your order.',
        greeting: `Hi ${vars.userName || 'there'},`,
        paragraphs: [`Order ${vars.orderId || ''} is now ${status}.`],
        cta: { label: actionLabel(vars, 'Track Order'), url: vars.actionUrl || `${vars.appUrl}/orders` },
        supportEmail: vars.supportEmail,
        footerLinks: [{ label: 'Orders', url: `${vars.appUrl}/orders` }]
      }).replace('</td>', `${badgeBlock}</td>`);
      return { html, text: fallbackText({ title: `Order update: ${vars.orderId || ''}`, lines: [`Status: ${status}`], actionUrl: vars.actionUrl || `${vars.appUrl}/orders` }) };
    }
  }),
  buildTemplate({
    key: 'order_confirmation',
    subject: (vars) => `Order confirmed: ${vars.orderId || ''}`.trim(),
    requiredVariables: ['userName', 'orderId'],
    compose: (vars) => {
      const summary = orderSummaryTable(vars.items || []);
      const { badgeBlock, lines } = orderHeader(vars, 'confirmed');
      const html = baseLayout({
        title: 'Order confirmed',
        preheader: 'Thanks for your purchase.',
        greeting: `Hi ${vars.userName || 'there'},`,
        paragraphs: lines,
        cta: { label: actionLabel(vars, 'Track Order'), url: vars.actionUrl || `${vars.appUrl}/orders` },
        supportEmail: vars.supportEmail,
        footerLinks: [{ label: 'Orders', url: `${vars.appUrl}/orders` }]
      }).replace('</td>', `${badgeBlock}${summary}</td>`);
      return { html, text: fallbackText({ title: `Order confirmed: ${vars.orderId || ''}`, lines, actionUrl: vars.actionUrl || `${vars.appUrl}/orders` }) };
    }
  }),
  buildTemplate({
    key: 'new_order_received',
    subject: (vars) => `New order received: ${vars.orderId || ''}`.trim(),
    requiredVariables: ['userName', 'orderId'],
    compose: (vars) => {
      const html = baseLayout({
        title: 'New order received',
        preheader: 'A customer placed an order.',
        greeting: `Hi ${vars.userName || 'vendor'},`,
        paragraphs: [`Order ${vars.orderId || ''} requires your action.`],
        cta: { label: actionLabel(vars, 'Open Vendor Orders'), url: vars.actionUrl || `${vars.appUrl}/vendor/orders` },
        supportEmail: vars.supportEmail,
        footerLinks: [{ label: 'Vendor Orders', url: `${vars.appUrl}/vendor/orders` }]
      });
      return { html, text: fallbackText({ title: `New order received: ${vars.orderId || ''}`, lines: ['Please review and fulfill this order.'], actionUrl: vars.actionUrl || `${vars.appUrl}/vendor/orders` }) };
    }
  }),
  buildTemplate({
    key: 'order_accepted',
    subject: (vars) => `Order accepted: ${vars.orderId || ''}`.trim(),
    requiredVariables: ['orderId'],
    compose: (vars) => {
      const { badgeBlock, lines } = orderHeader({ ...vars, status: 'accepted' }, 'accepted');
      const html = baseLayout({
        title: 'Order accepted',
        preheader: 'Your order is being prepared.',
        greeting: `Hi ${vars.userName || 'there'},`,
        paragraphs: lines,
        cta: { label: actionLabel(vars, 'Track Progress'), url: vars.actionUrl || `${vars.appUrl}/orders` },
        supportEmail: vars.supportEmail,
        footerLinks: [{ label: 'Track Order', url: `${vars.appUrl}/orders` }]
      }).replace('</td>', `${badgeBlock}</td>`);
      return { html, text: fallbackText({ title: `Order accepted: ${vars.orderId || ''}`, lines, actionUrl: vars.actionUrl || `${vars.appUrl}/orders` }) };
    }
  }),
  buildTemplate({
    key: 'order_shipped',
    subject: (vars) => `Order shipped: ${vars.orderId || ''}`.trim(),
    requiredVariables: ['orderId'],
    compose: (vars) => {
      const tracking = cardBlock(`<p style="margin:0;"><strong>Tracking:</strong> ${escapeHtml(vars.trackingNumber || 'Pending')}</p>`);
      const html = baseLayout({
        title: 'Order shipped',
        preheader: 'Your package is on the way.',
        greeting: `Hi ${vars.userName || 'there'},`,
        paragraphs: [`Order ${vars.orderId || ''} has been shipped.`],
        cta: { label: actionLabel(vars, 'Track Shipment'), url: vars.actionUrl || `${vars.appUrl}/orders` },
        supportEmail: vars.supportEmail,
        footerLinks: [{ label: 'Tracking', url: vars.actionUrl || `${vars.appUrl}/orders` }]
      }).replace('</td>', `${tracking}</td>`);
      return { html, text: fallbackText({ title: `Order shipped: ${vars.orderId || ''}`, lines: [`Tracking: ${vars.trackingNumber || 'Pending'}`], actionUrl: vars.actionUrl || `${vars.appUrl}/orders` }) };
    }
  }),
  buildTemplate({
    key: 'order_delivered',
    subject: (vars) => `Order delivered: ${vars.orderId || ''}`.trim(),
    requiredVariables: ['orderId'],
    compose: (vars) => {
      const html = baseLayout({
        title: 'Order delivered',
        preheader: 'Delivery complete.',
        greeting: `Hi ${vars.userName || 'there'},`,
        paragraphs: [`Order ${vars.orderId || ''} has been delivered/completed.`],
        cta: { label: actionLabel(vars, 'View Order'), url: vars.actionUrl || `${vars.appUrl}/orders` },
        supportEmail: vars.supportEmail,
        footerLinks: [{ label: 'Orders', url: `${vars.appUrl}/orders` }]
      });
      return { html, text: fallbackText({ title: `Order delivered: ${vars.orderId || ''}`, lines: ['Delivery completed.'], actionUrl: vars.actionUrl || `${vars.appUrl}/orders` }) };
    }
  }),
  buildTemplate({
    key: 'order_cancelled',
    subject: (vars) => `Order cancelled: ${vars.orderId || ''}`.trim(),
    requiredVariables: ['orderId'],
    compose: (vars) => {
      const reason = vars.reason ? `Reason: ${vars.reason}` : 'Reason: Not provided';
      const html = baseLayout({
        title: 'Order cancelled',
        preheader: 'Order update',
        greeting: `Hi ${vars.userName || 'there'},`,
        paragraphs: [`Order ${vars.orderId || ''} has been cancelled.`, reason],
        cta: { label: actionLabel(vars, 'View Orders'), url: vars.actionUrl || `${vars.appUrl}/orders` },
        supportEmail: vars.supportEmail,
        footerLinks: [{ label: 'Orders', url: `${vars.appUrl}/orders` }]
      });
      return { html, text: fallbackText({ title: `Order cancelled: ${vars.orderId || ''}`, lines: [reason], actionUrl: vars.actionUrl || `${vars.appUrl}/orders` }) };
    }
  }),
  buildTemplate({
    key: 'partial_fulfillment',
    subject: (vars) => `Partial fulfillment update: ${vars.orderId || ''}`.trim(),
    requiredVariables: ['orderId'],
    compose: (vars) => {
      const html = baseLayout({
        title: 'Partial fulfillment update',
        preheader: 'Some items are delayed or backordered.',
        greeting: `Hi ${vars.userName || 'there'},`,
        paragraphs: [`Order ${vars.orderId || ''} is partially fulfilled.`, vars.details || 'Some items are delayed.'],
        cta: { label: actionLabel(vars, 'Review Order'), url: vars.actionUrl || `${vars.appUrl}/orders` },
        supportEmail: vars.supportEmail,
        footerLinks: [{ label: 'Order details', url: `${vars.appUrl}/orders` }]
      });
      return { html, text: fallbackText({ title: `Partial fulfillment update: ${vars.orderId || ''}`, lines: [vars.details || 'Some items are delayed.'], actionUrl: vars.actionUrl || `${vars.appUrl}/orders` }) };
    }
  }),
  buildTemplate({
    key: 'return_request_received',
    subject: (vars) => `Return request received: ${vars.orderId || ''}`.trim(),
    requiredVariables: ['orderId'],
    compose: (vars) => {
      const html = baseLayout({
        title: 'Return request received',
        preheader: 'A return request was created.',
        greeting: `Hi ${vars.userName || 'there'},`,
        paragraphs: [`A return request has been opened for order ${vars.orderId || ''}.`],
        cta: { label: actionLabel(vars, 'Open Return Request'), url: vars.actionUrl || `${vars.appUrl}/orders` },
        supportEmail: vars.supportEmail,
        footerLinks: [{ label: 'Return center', url: `${vars.appUrl}/orders` }]
      });
      return { html, text: fallbackText({ title: `Return request received: ${vars.orderId || ''}`, lines: ['A return request has been opened.'], actionUrl: vars.actionUrl || `${vars.appUrl}/orders` }) };
    }
  }),
  buildTemplate({
    key: 'return_approved',
    subject: (vars) => `Return approved: ${vars.orderId || ''}`.trim(),
    requiredVariables: ['orderId'],
    compose: (vars) => {
      const html = baseLayout({
        title: 'Return approved',
        preheader: 'Your return has been approved.',
        greeting: `Hi ${vars.userName || 'there'},`,
        paragraphs: [`Your return for order ${vars.orderId || ''} has been approved.`],
        cta: { label: actionLabel(vars, 'View Return Details'), url: vars.actionUrl || `${vars.appUrl}/orders` },
        supportEmail: vars.supportEmail,
        footerLinks: [{ label: 'Return details', url: `${vars.appUrl}/orders` }]
      });
      return { html, text: fallbackText({ title: `Return approved: ${vars.orderId || ''}`, lines: ['Your return was approved.'], actionUrl: vars.actionUrl || `${vars.appUrl}/orders` }) };
    }
  }),
  buildTemplate({
    key: 'return_rejected',
    subject: (vars) => `Return rejected: ${vars.orderId || ''}`.trim(),
    requiredVariables: ['orderId'],
    compose: (vars) => {
      const reason = vars.reason || 'No reason provided';
      const html = baseLayout({
        title: 'Return rejected',
        preheader: 'Your return request was rejected.',
        greeting: `Hi ${vars.userName || 'there'},`,
        paragraphs: [`Your return for order ${vars.orderId || ''} was rejected.`, `Reason: ${reason}`],
        cta: { label: actionLabel(vars, 'Contact Support'), url: vars.actionUrl || `mailto:${vars.supportEmail}` },
        supportEmail: vars.supportEmail,
        footerLinks: [{ label: 'Support', url: `mailto:${vars.supportEmail}` }]
      });
      return { html, text: fallbackText({ title: `Return rejected: ${vars.orderId || ''}`, lines: [`Reason: ${reason}`], actionUrl: vars.actionUrl || `mailto:${vars.supportEmail}` }) };
    }
  }),
  buildTemplate({
    key: 'refund_processed',
    subject: (vars) => `Refund processed: ${vars.orderId || ''}`.trim(),
    requiredVariables: ['orderId'],
    compose: (vars) => {
      const amount = vars.amount ? `Amount: ${vars.amount}` : 'Amount: See account statement';
      const html = baseLayout({
        title: 'Refund processed',
        preheader: 'Refund completed.',
        greeting: `Hi ${vars.userName || 'there'},`,
        paragraphs: [`Refund for order ${vars.orderId || ''} has been processed.`, amount],
        cta: { label: actionLabel(vars, 'View Order'), url: vars.actionUrl || `${vars.appUrl}/orders` },
        supportEmail: vars.supportEmail,
        footerLinks: [{ label: 'Orders', url: `${vars.appUrl}/orders` }]
      });
      return { html, text: fallbackText({ title: `Refund processed: ${vars.orderId || ''}`, lines: [amount], actionUrl: vars.actionUrl || `${vars.appUrl}/orders` }) };
    }
  }),
  buildTemplate({
    key: 'invoice_available',
    subject: (vars) => `Invoice available: ${vars.orderId || ''}`.trim(),
    requiredVariables: ['orderId'],
    compose: (vars) => {
      const link = vars.invoiceUrl || vars.actionUrl || `${vars.appUrl}/orders`;
      const html = baseLayout({
        title: 'Invoice available',
        preheader: 'Your receipt is ready.',
        greeting: `Hi ${vars.userName || 'there'},`,
        paragraphs: [`Invoice/receipt for order ${vars.orderId || ''} is ready.`],
        cta: { label: actionLabel(vars, 'Download Invoice'), url: link },
        supportEmail: vars.supportEmail,
        footerLinks: [{ label: 'Invoices', url: link }]
      });
      return { html, text: fallbackText({ title: `Invoice available: ${vars.orderId || ''}`, lines: ['Your invoice is ready.'], actionUrl: link }) };
    }
  }),
  buildTemplate({
    key: 'payment_failed',
    subject: (vars) => `Payment failed: ${vars.orderId || ''}`.trim(),
    requiredVariables: ['orderId'],
    compose: (vars) => {
      const html = baseLayout({
        title: 'Payment failed',
        preheader: 'Action needed to complete your order.',
        greeting: `Hi ${vars.userName || 'there'},`,
        paragraphs: [`Payment for order ${vars.orderId || ''} failed.`, 'Please retry payment or use another payment method.'],
        cta: { label: actionLabel(vars, 'Retry Payment'), url: vars.actionUrl || `${vars.appUrl}/orders` },
        supportEmail: vars.supportEmail,
        footerLinks: [{ label: 'Orders', url: `${vars.appUrl}/orders` }]
      });
      return { html, text: fallbackText({ title: `Payment failed: ${vars.orderId || ''}`, lines: ['Retry payment to complete your order.'], actionUrl: vars.actionUrl || `${vars.appUrl}/orders` }) };
    }
  }),
  buildTemplate({
    key: 'payment_pending',
    subject: (vars) => `Payment pending: ${vars.orderId || ''}`.trim(),
    requiredVariables: ['orderId'],
    compose: (vars) => {
      const html = baseLayout({
        title: 'Payment pending',
        preheader: 'We are waiting for payment confirmation.',
        greeting: `Hi ${vars.userName || 'there'},`,
        paragraphs: [`Payment for order ${vars.orderId || ''} is still pending.`],
        cta: { label: actionLabel(vars, 'View Payment Status'), url: vars.actionUrl || `${vars.appUrl}/orders` },
        supportEmail: vars.supportEmail,
        footerLinks: [{ label: 'Payments', url: `${vars.appUrl}/orders` }]
      });
      return { html, text: fallbackText({ title: `Payment pending: ${vars.orderId || ''}`, lines: ['Payment confirmation is still pending.'], actionUrl: vars.actionUrl || `${vars.appUrl}/orders` }) };
    }
  })
];

module.exports = {
  orderTemplates,
  renderTemplate
};

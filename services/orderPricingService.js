const DEFAULT_TAX_RATE = Number(process.env.TAX_RATE || 0.15);

/**
 * Calculate canonical order totals from core pricing inputs.
 *
 * All monetary inputs should already be validated and expressed in the same currency.
 */
function calculateOrderTotals({ subtotal, deliveryFee = 0, discount = 0 }) {
  const normalizedSubtotal = Number(subtotal || 0);
  const normalizedDelivery = Number(deliveryFee || 0);
  const baseTax = normalizedSubtotal * DEFAULT_TAX_RATE;
  const tax = Number(baseTax.toFixed(2));

  const preDiscountTotal = normalizedSubtotal + normalizedDelivery + tax;
  const maxDiscount = Math.max(0, preDiscountTotal);
  const appliedDiscount = Math.min(maxDiscount, Math.max(0, Number(discount || 0)));

  const total = Number(Math.max(0, preDiscountTotal - appliedDiscount).toFixed(2));

  return {
    tax,
    discount: appliedDiscount,
    total,
    totals: {
      subtotal: Number(normalizedSubtotal.toFixed(2)),
      delivery: Number(normalizedDelivery.toFixed(2)),
      discount: appliedDiscount,
      total
    }
  };
}

module.exports = {
  TAX_RATE: DEFAULT_TAX_RATE,
  calculateOrderTotals
};


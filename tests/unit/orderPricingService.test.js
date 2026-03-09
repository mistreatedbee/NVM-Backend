const { calculateOrderTotals, TAX_RATE } = require('../../services/orderPricingService');

describe('orderPricingService.calculateOrderTotals', () => {
  it('calculates tax and total with no discount', () => {
    const result = calculateOrderTotals({ subtotal: 1000, deliveryFee: 50, discount: 0 });
    const expectedTax = Number((1000 * TAX_RATE).toFixed(2));
    const expectedTotal = Number((1000 + 50 + expectedTax).toFixed(2));

    expect(result.tax).toBe(expectedTax);
    expect(result.discount).toBe(0);
    expect(result.total).toBe(expectedTotal);
    expect(result.totals.subtotal).toBe(1000);
    expect(result.totals.delivery).toBe(50);
  });

  it('caps discount so it never exceeds gross total', () => {
    const result = calculateOrderTotals({ subtotal: 500, deliveryFee: 50, discount: 5000 });
    const gross = 500 + 50 + result.tax;
    expect(result.discount).toBe(gross);
    expect(result.total).toBe(0);
  });

  it('handles zero and negative inputs safely', () => {
    const result = calculateOrderTotals({ subtotal: 0, deliveryFee: -10, discount: -5 });
    expect(result.totals.subtotal).toBe(0);
    expect(result.totals.delivery).toBe(0);
    expect(result.discount).toBe(0);
    expect(result.total).toBe(0);
  });
});


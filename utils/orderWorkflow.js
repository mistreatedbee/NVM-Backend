const ITEM_STATUSES = [
  'PENDING',
  'ACCEPTED',
  'PACKING',
  'SHIPPED',
  'DELIVERED',
  'CANCELLED',
  'REFUNDED'
];

const ORDER_STATUSES = [
  'PENDING',
  'PROCESSING',
  'PARTIALLY_SHIPPED',
  'SHIPPED',
  'PARTIALLY_DELIVERED',
  'DELIVERED',
  'CANCELLED',
  'REFUNDED'
];

const LEGACY_TO_ITEM = {
  pending: 'PENDING',
  confirmed: 'ACCEPTED',
  processing: 'PACKING',
  shipped: 'SHIPPED',
  delivered: 'DELIVERED',
  cancelled: 'CANCELLED',
  refunded: 'REFUNDED'
};

const LEGACY_FROM_ORDER = {
  PENDING: 'pending',
  PROCESSING: 'processing',
  PARTIALLY_SHIPPED: 'shipped',
  SHIPPED: 'shipped',
  PARTIALLY_DELIVERED: 'delivered',
  DELIVERED: 'delivered',
  CANCELLED: 'cancelled',
  REFUNDED: 'refunded'
};

function normalizeItemStatus(status) {
  if (!status) return 'PENDING';
  if (ITEM_STATUSES.includes(status)) return status;
  if (typeof status === 'string') {
    const upper = status.toUpperCase();
    if (ITEM_STATUSES.includes(upper)) return upper;
    if (LEGACY_TO_ITEM[status.toLowerCase()]) return LEGACY_TO_ITEM[status.toLowerCase()];
  }
  return 'PENDING';
}

function normalizeOrderStatus(status) {
  if (!status) return 'PENDING';
  if (ORDER_STATUSES.includes(status)) return status;
  if (typeof status === 'string') {
    const upper = status.toUpperCase();
    if (ORDER_STATUSES.includes(upper)) return upper;
    if (LEGACY_TO_ITEM[status.toLowerCase()]) {
      const itemStatus = LEGACY_TO_ITEM[status.toLowerCase()];
      if (itemStatus === 'PENDING') return 'PENDING';
      if (itemStatus === 'ACCEPTED' || itemStatus === 'PACKING') return 'PROCESSING';
      if (itemStatus === 'SHIPPED') return 'SHIPPED';
      if (itemStatus === 'DELIVERED') return 'DELIVERED';
      if (itemStatus === 'CANCELLED') return 'CANCELLED';
      if (itemStatus === 'REFUNDED') return 'REFUNDED';
    }
  }
  return 'PENDING';
}

function canTransitionVendorItemStatus(fromStatus, toStatus) {
  const from = normalizeItemStatus(fromStatus);
  const to = normalizeItemStatus(toStatus);

  if (from === to) {
    return { allowed: false, reason: 'Status is unchanged' };
  }

  if (to === 'REFUNDED') {
    return { allowed: false, reason: 'Refunded status is managed by admin/payment flow only' };
  }

  const allowedTransitions = {
    PENDING: ['ACCEPTED', 'CANCELLED'],
    ACCEPTED: ['PACKING', 'CANCELLED'],
    PACKING: ['SHIPPED', 'CANCELLED'],
    SHIPPED: ['DELIVERED', 'CANCELLED'],
    DELIVERED: [],
    CANCELLED: [],
    REFUNDED: []
  };

  if (to === 'CANCELLED' && from === 'DELIVERED') {
    return { allowed: false, reason: 'Cannot cancel an already delivered item' };
  }

  const next = allowedTransitions[from] || [];
  if (!next.includes(to)) {
    return { allowed: false, reason: `Invalid transition from ${from} to ${to}` };
  }

  return { allowed: true };
}

function computeOverallOrderStatus(items = []) {
  if (!items.length) return 'PENDING';

  const statuses = items.map((item) => normalizeItemStatus(item.status));
  const all = (status) => statuses.every((s) => s === status);
  const has = (status) => statuses.includes(status);

  if (all('REFUNDED')) return 'REFUNDED';
  if (all('CANCELLED')) return 'CANCELLED';
  if (all('DELIVERED')) return 'DELIVERED';

  if (has('DELIVERED')) {
    return 'PARTIALLY_DELIVERED';
  }

  if (all('SHIPPED')) return 'SHIPPED';
  if (has('SHIPPED')) return 'PARTIALLY_SHIPPED';

  if (has('ACCEPTED') || has('PACKING')) {
    return 'PROCESSING';
  }

  if (statuses.every((s) => s === 'PENDING' || s === 'CANCELLED')) {
    return has('PENDING') ? 'PENDING' : 'CANCELLED';
  }

  return 'PENDING';
}

function mapOrderStatusToLegacy(orderStatus) {
  return LEGACY_FROM_ORDER[normalizeOrderStatus(orderStatus)] || 'pending';
}

function normalizePaymentStatus(status) {
  if (!status) return 'PENDING';
  if (typeof status !== 'string') return 'PENDING';
  const upper = status.toUpperCase();
  if (['PENDING', 'PAID', 'FAILED', 'REFUNDED', 'AWAITING-CONFIRMATION', 'AWAITING_PAYMENT', 'UNDER_REVIEW', 'REJECTED'].includes(upper)) {
    return upper;
  }
  return 'PENDING';
}

module.exports = {
  ITEM_STATUSES,
  ORDER_STATUSES,
  normalizeItemStatus,
  normalizeOrderStatus,
  normalizePaymentStatus,
  canTransitionVendorItemStatus,
  computeOverallOrderStatus,
  mapOrderStatusToLegacy
};

const mongoose = require('mongoose');
const {
  normalizeItemStatus,
  computeOverallOrderStatus,
  mapOrderStatusToLegacy,
  normalizePaymentStatus
} = require('../utils/orderWorkflow');

function generateOrderNumber() {
  const date = new Date();
  const year = date.getFullYear().toString().slice(-2);
  const month = String(date.getMonth() + 1).padStart(2, '0');
  // Include day + ms to reduce collision risk vs 4-digit random alone
  const day = String(date.getDate()).padStart(2, '0');
  const ms = String(date.getTime()).slice(-5);
  const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
  return `NVM${year}${month}${day}${ms}${random}`;
}

function normalizePaymentMethod(method) {
  const value = String(method || '').trim().toUpperCase();
  if (value === 'STRIPE') return 'stripe';
  if (value === 'PAYFAST') return 'payfast';
  if (value === 'COD') return 'cash-on-delivery';
  if (value === 'EFT') return 'eft';
  if (value === 'INVOICE') return 'INVOICE';
  return method;
}

const orderItemSchema = new mongoose.Schema({
  product: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product',
    required: true
  },
  productId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product'
  },
  vendor: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Vendor',
    required: true
  },
  vendorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Vendor'
  },
  name: String,
  titleSnapshot: String,
  image: String,
  price: {
    type: Number,
    required: true
  },
  priceSnapshot: Number,
  quantity: {
    type: Number,
    required: true,
    min: 1
  },
  qty: {
    type: Number,
    min: 1
  },
  variant: {
    name: String,
    attributes: [{
      key: String,
      value: String
    }]
  },
  subtotal: {
    type: Number,
    required: true
  },
  lineTotal: {
    type: Number
  },
  // Vendor-specific status
  status: {
    type: String,
    enum: [
      'pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled', 'refunded',
      'PENDING', 'ACCEPTED', 'PACKING', 'SHIPPED', 'DELIVERED', 'CANCELLED', 'REFUNDED'
    ],
    default: 'PENDING'
  },
  tracking: {
    carrier: String,
    trackingNumber: String,
    trackingUrl: String,
    lastUpdatedAt: Date
  },
  vendorNotes: String,
  fulfilmentNotes: String,
  updatedAt: Date
});

const orderSchema = new mongoose.Schema({
  orderNumber: {
    type: String,
    unique: true,
    required: true,
    default: generateOrderNumber
  },
  customer: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  customerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  
  // Order Items
  items: [orderItemSchema],
  
  // Pricing
  subtotal: {
    type: Number,
    required: true
  },
  shippingCost: {
    type: Number,
    default: 0
  },
  tax: {
    type: Number,
    default: 0
  },
  discount: {
    type: Number,
    default: 0
  },
  total: {
    type: Number,
    required: true
  },
  
  // Shipping Address
  shippingAddress: {
    fullName: { type: String, required: true },
    phone: { type: String, required: true },
    street: { type: String, required: true },
    city: { type: String, required: true },
    state: { type: String, required: true },
    country: { type: String, required: true },
    zipCode: { type: String, required: true }
  },
  
  // Billing Address
  billingAddress: {
    fullName: String,
    street: String,
    city: String,
    state: String,
    country: String,
    zipCode: String
  },
  
  // Payment
  paymentMethod: {
    type: String,
    required: true,
    enum: ['stripe', 'payfast', 'cash-on-delivery', 'eft', 'bank-transfer', 'STRIPE', 'PAYFAST', 'COD', 'EFT', 'INVOICE']
  },
  paymentStatus: {
    type: String,
    enum: [
      'pending', 'paid', 'failed', 'refunded', 'awaiting-confirmation',
      'PENDING', 'PAID', 'FAILED', 'REFUNDED', 'AWAITING-CONFIRMATION',
      'AWAITING_PAYMENT', 'UNDER_REVIEW', 'REJECTED'
    ],
    default: 'AWAITING_PAYMENT'
  },
  paymentId: String,
  paidAt: Date,
  
  // Payment Proof (for EFT/Bank Transfer)
  paymentProof: {
    public_id: String,
    url: String,
    uploadedAt: Date
  },
  paymentConfirmedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  paymentConfirmedAt: Date,
  paymentRejectionReason: String,
  
  // Overall Order Status
  status: {
    type: String,
    enum: ['pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled', 'refunded', 'PENDING', 'PROCESSING', 'PARTIALLY_SHIPPED', 'SHIPPED', 'PARTIALLY_DELIVERED', 'DELIVERED', 'CANCELLED', 'REFUNDED'],
    default: 'pending'
  },
  orderStatus: {
    type: String,
    enum: ['PENDING', 'PROCESSING', 'PARTIALLY_SHIPPED', 'SHIPPED', 'PARTIALLY_DELIVERED', 'DELIVERED', 'CANCELLED', 'REFUNDED'],
    default: 'PENDING'
  },
  
  // Fulfillment Method
  fulfillmentMethod: {
    type: String,
    enum: ['delivery', 'collection'],
    required: true,
    default: 'delivery'
  },
  deliveryMethod: {
    type: String,
    enum: ['DELIVERY', 'PICKUP'],
    default: 'DELIVERY'
  },
  collectionPoint: {
    name: String,
    address: String,
    phone: String,
    instructions: String
  },
  deliveryAddress: {
    fullName: String,
    phone: String,
    street: String,
    city: String,
    state: String,
    country: String,
    zipCode: String
  },
  deliveryFee: {
    type: Number,
    default: 0
  },
  totals: {
    subtotal: { type: Number, default: 0 },
    delivery: { type: Number, default: 0 },
    discount: { type: Number, default: 0 },
    total: { type: Number, default: 0 }
  },
  
  // Tracking
  trackingNumber: String,
  carrier: String,
  estimatedDelivery: Date,
  trackingHistory: [{
    status: String,
    location: {
      type: {
        type: String,
        enum: ['Point'],
        default: 'Point'
      },
      coordinates: {
        type: [Number], // [longitude, latitude]
        index: '2dsphere'
      },
      address: String
    },
    timestamp: {
      type: Date,
      default: Date.now
    },
    description: String
  }],
  currentLocation: {
    type: {
      type: String,
      enum: ['Point'],
      default: 'Point'
    },
    coordinates: {
      type: [Number],
      index: '2dsphere'
    },
    address: String,
    updatedAt: Date
  },
  
  // Timestamps
  confirmedAt: Date,
  shippedAt: Date,
  deliveredAt: Date,
  cancelledAt: Date,
  
  // Notes
  customerNotes: String,
  adminNotes: String,
  
  // Cancellation/Refund
  cancellationReason: String,
  refundAmount: Number,
  refundedAt: Date,
  chargebackStatus: {
    type: String,
    enum: ['NONE', 'CHARGEBACK_OPEN', 'CHARGEBACK_RESOLVED'],
    default: 'NONE'
  },
  chargebackNotes: {
    type: String,
    default: ''
  },
  invoiceIds: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Invoice'
  }],
  invoicesGeneratedAt: Date
}, {
  timestamps: true
});

// Indexes
orderSchema.index({ customerId: 1, createdAt: -1 });
orderSchema.index({ 'items.vendorId': 1, createdAt: -1 });
orderSchema.index({ orderStatus: 1, createdAt: -1 });
orderSchema.index({ paymentStatus: 1, createdAt: -1 });
orderSchema.index({ orderStatus: 1, paymentStatus: 1, createdAt: -1 });
orderSchema.index({ customer: 1, createdAt: -1 });
orderSchema.index({ 'items.vendor': 1, createdAt: -1 });
orderSchema.index({ status: 1, createdAt: -1 });

// Ensure order number exists before validation runs (required validator happens before save)
orderSchema.pre('validate', function(next) {
  if (!this.orderNumber) {
    this.orderNumber = generateOrderNumber();
  }

  if (!this.customerId && this.customer) {
    this.customerId = this.customer;
  }
  if (!this.customer && this.customerId) {
    this.customer = this.customerId;
  }

  for (const item of this.items || []) {
    if (!item.productId && item.product) item.productId = item.product;
    if (!item.product && item.productId) item.product = item.productId;
    if (!item.vendorId && item.vendor) item.vendorId = item.vendor;
    if (!item.vendor && item.vendorId) item.vendor = item.vendorId;
    if (!item.titleSnapshot && item.name) item.titleSnapshot = item.name;
    if (!item.name && item.titleSnapshot) item.name = item.titleSnapshot;
    if (item.priceSnapshot === undefined || item.priceSnapshot === null) item.priceSnapshot = item.price;
    if (item.price === undefined || item.price === null) item.price = item.priceSnapshot;
    if (!item.qty) item.qty = item.quantity;
    if (!item.quantity) item.quantity = item.qty;
    if (item.lineTotal === undefined || item.lineTotal === null) item.lineTotal = item.subtotal;
    if (item.subtotal === undefined || item.subtotal === null) item.subtotal = item.lineTotal;
    item.status = normalizeItemStatus(item.status);
    item.updatedAt = new Date();
  }

  if (this.items?.length) {
    if (this.isModified('orderStatus')) {
      this.orderStatus = this.orderStatus;
    } else {
      this.orderStatus = computeOverallOrderStatus(this.items);
    }
    this.status = mapOrderStatusToLegacy(this.orderStatus);
  } else if (!this.orderStatus) {
    this.orderStatus = 'PENDING';
  }

  this.paymentStatus = normalizePaymentStatus(this.paymentStatus);
  this.paymentMethod = normalizePaymentMethod(this.paymentMethod);

  if (!this.deliveryMethod) {
    this.deliveryMethod = this.fulfillmentMethod === 'collection' ? 'PICKUP' : 'DELIVERY';
  }
  if (!this.fulfillmentMethod) {
    this.fulfillmentMethod = this.deliveryMethod === 'PICKUP' ? 'collection' : 'delivery';
  }

  if (!this.deliveryAddress && this.shippingAddress) {
    this.deliveryAddress = this.shippingAddress;
  }
  if (!this.shippingAddress && this.deliveryAddress) {
    this.shippingAddress = this.deliveryAddress;
  }

  if (!this.deliveryFee && this.shippingCost) {
    this.deliveryFee = this.shippingCost;
  }
  if (!this.shippingCost && this.deliveryFee) {
    this.shippingCost = this.deliveryFee;
  }

  this.totals = {
    subtotal: this.subtotal ?? this.totals?.subtotal ?? 0,
    delivery: this.deliveryFee ?? this.shippingCost ?? this.totals?.delivery ?? 0,
    discount: this.discount ?? this.totals?.discount ?? 0,
    total: this.total ?? this.totals?.total ?? 0
  };

  if ((this.subtotal === undefined || this.subtotal === null) && this.totals?.subtotal !== undefined) {
    this.subtotal = this.totals.subtotal;
  }
  if ((this.total === undefined || this.total === null) && this.totals?.total !== undefined) {
    this.total = this.totals.total;
  }

  next();
});

module.exports = mongoose.model('Order', orderSchema);

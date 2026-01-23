const mongoose = require('mongoose');

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

const orderItemSchema = new mongoose.Schema({
  product: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product',
    required: true
  },
  vendor: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Vendor',
    required: true
  },
  name: String,
  image: String,
  price: {
    type: Number,
    required: true
  },
  quantity: {
    type: Number,
    required: true,
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
  // Vendor-specific status
  status: {
    type: String,
    enum: ['pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled', 'refunded'],
    default: 'pending'
  },
  vendorNotes: String
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
    enum: ['stripe', 'payfast', 'cash-on-delivery', 'eft', 'bank-transfer']
  },
  paymentStatus: {
    type: String,
    enum: ['pending', 'paid', 'failed', 'refunded', 'awaiting-confirmation'],
    default: 'pending'
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
    enum: ['pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled', 'refunded'],
    default: 'pending'
  },
  
  // Fulfillment Method
  fulfillmentMethod: {
    type: String,
    enum: ['delivery', 'collection'],
    required: true,
    default: 'delivery'
  },
  collectionPoint: {
    name: String,
    address: String,
    phone: String,
    instructions: String
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
  refundedAt: Date
}, {
  timestamps: true
});

// Indexes
orderSchema.index({ orderNumber: 1 });
orderSchema.index({ customer: 1 });
orderSchema.index({ 'items.vendor': 1 });
orderSchema.index({ status: 1 });
orderSchema.index({ paymentStatus: 1 });
orderSchema.index({ createdAt: -1 });

// Ensure order number exists before validation runs (required validator happens before save)
orderSchema.pre('validate', function(next) {
  if (!this.orderNumber) {
    this.orderNumber = generateOrderNumber();
  }
  next();
});

module.exports = mongoose.model('Order', orderSchema);

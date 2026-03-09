const mongoose = require('mongoose');

const productAnalyticsEventSchema = new mongoose.Schema(
  {
    vendorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Vendor',
      required: true
    },
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
      required: true
    },
    orderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Order'
    },
    eventType: {
      type: String,
      enum: ['VIEW', 'CLICK', 'ADD_TO_CART', 'PURCHASE'],
      required: true
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    sessionId: {
      type: String,
      trim: true
    },
    ipHash: {
      type: String,
      trim: true
    },
    source: {
      type: String,
      enum: ['SEARCH', 'HOMEPAGE', 'VENDOR_PAGE', 'DIRECT', 'OTHER'],
      default: 'OTHER'
    }
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

productAnalyticsEventSchema.index({ vendorId: 1, createdAt: -1 });
productAnalyticsEventSchema.index({ productId: 1, createdAt: -1 });
productAnalyticsEventSchema.index({ eventType: 1, createdAt: -1 });
productAnalyticsEventSchema.index(
  { orderId: 1, productId: 1, eventType: 1 },
  { unique: true, partialFilterExpression: { eventType: 'PURCHASE', orderId: { $exists: true } } }
);

module.exports = mongoose.model('ProductAnalyticsEvent', productAnalyticsEventSchema);

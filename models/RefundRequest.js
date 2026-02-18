const mongoose = require('mongoose');

const refundRequestSchema = new mongoose.Schema({
  orderId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Order',
    required: true
  },
  customerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  items: [{
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
      required: true
    },
    qty: {
      type: Number,
      min: 1,
      required: true
    },
    reason: {
      type: String,
      required: true,
      trim: true,
      maxlength: 1000
    }
  }],
  status: {
    type: String,
    enum: ['REQUESTED', 'APPROVED', 'REJECTED', 'REFUNDED'],
    default: 'REQUESTED'
  },
  reviewedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  reviewNote: {
    type: String,
    default: ''
  }
}, { timestamps: true });

refundRequestSchema.index({ orderId: 1 });
refundRequestSchema.index({ customerId: 1, createdAt: -1 });
refundRequestSchema.index({ status: 1, createdAt: -1 });

module.exports = mongoose.model('RefundRequest', refundRequestSchema);

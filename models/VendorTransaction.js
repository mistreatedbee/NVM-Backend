const mongoose = require('mongoose');

const vendorTransactionSchema = new mongoose.Schema(
  {
    vendorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Vendor',
      required: true
    },
    type: {
      type: String,
      enum: ['SALE', 'COMMISSION', 'PAYOUT', 'REFUND', 'ADJUSTMENT'],
      required: true
    },
    direction: {
      type: String,
      enum: ['CREDIT', 'DEBIT'],
      required: true
    },
    orderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Order'
    },
    invoiceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Invoice'
    },
    amount: {
      type: Number,
      required: true,
      min: 0
    },
    currency: {
      type: String,
      enum: ['ZAR'],
      default: 'ZAR'
    },
    reference: {
      type: String,
      required: true,
      trim: true
    },
    description: {
      type: String,
      required: true,
      trim: true
    },
    status: {
      type: String,
      enum: ['PENDING', 'COMPLETED', 'FAILED'],
      default: 'COMPLETED'
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {}
    }
  },
  {
    timestamps: true
  }
);

vendorTransactionSchema.index({ vendorId: 1, createdAt: -1 });
vendorTransactionSchema.index({ type: 1, createdAt: -1 });
vendorTransactionSchema.index({ orderId: 1, invoiceId: 1, type: 1, direction: 1 });

module.exports = mongoose.model('VendorTransaction', vendorTransactionSchema);

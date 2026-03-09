const mongoose = require('mongoose');

const paymentProofSchema = new mongoose.Schema(
  {
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
    fileUrl: {
      type: String,
      required: true
    },
    fileName: {
      type: String,
      required: true
    },
    mimeType: {
      type: String,
      required: true
    },
    size: {
      type: Number,
      required: true,
      min: 1
    },
    status: {
      type: String,
      enum: ['UNDER_REVIEW', 'APPROVED', 'REJECTED'],
      default: 'UNDER_REVIEW'
    },
    reviewedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    reviewedAt: Date,
    reviewNote: String,
    uploadedAt: {
      type: Date,
      default: Date.now
    }
  },
  { timestamps: true }
);

paymentProofSchema.index({ orderId: 1, createdAt: -1 });
paymentProofSchema.index({ customerId: 1, createdAt: -1 });
paymentProofSchema.index({ status: 1, uploadedAt: -1 });

module.exports = mongoose.model('PaymentProof', paymentProofSchema);

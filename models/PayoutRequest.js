const mongoose = require('mongoose');

const payoutRequestSchema = new mongoose.Schema(
  {
    vendorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Vendor',
      required: true
    },
    amount: {
      type: Number,
      required: true,
      min: 0
    },
    status: {
      type: String,
      enum: ['REQUESTED', 'APPROVED', 'REJECTED', 'PAID'],
      default: 'REQUESTED'
    },
    requestedAt: {
      type: Date,
      default: Date.now
    },
    processedAt: Date,
    processedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    notes: String
  },
  { timestamps: true }
);

payoutRequestSchema.index({ vendorId: 1, requestedAt: -1 });
payoutRequestSchema.index({ status: 1, requestedAt: -1 });

module.exports = mongoose.model('PayoutRequest', payoutRequestSchema);

const mongoose = require('mongoose');

const attachmentSchema = new mongoose.Schema(
  {
    url: { type: String, required: true },
    fileName: { type: String, trim: true, default: '' },
    mimeType: { type: String, trim: true, default: '' },
    size: { type: Number, default: 0 }
  },
  { _id: false }
);

const disputeMessageSchema = new mongoose.Schema(
  {
    sender: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null
    },
    senderRole: {
      type: String,
      enum: ['CUSTOMER', 'VENDOR', 'ADMIN', 'SYSTEM'],
      required: true
    },
    message: {
      type: String,
      trim: true,
      default: ''
    },
    attachments: {
      type: [attachmentSchema],
      default: []
    },
    createdAt: {
      type: Date,
      default: Date.now
    }
  },
  { _id: true }
);

const disputeSchema = new mongoose.Schema({
  order: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Order',
    required: true
  },
  customer: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  vendor: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Vendor',
    required: true
  },
  reason: {
    type: String,
    required: true
  },
  description: {
    type: String,
    required: true
  },
  evidence: {
    type: [attachmentSchema],
    default: []
  },
  messages: {
    type: [disputeMessageSchema],
    default: []
  },
  status: {
    type: String,
    enum: ['open', 'in-review', 'resolved', 'closed', 'OPEN', 'IN_REVIEW', 'RESOLVED', 'CLOSED'],
    default: 'OPEN'
  },
  resolution: String,
  resolvedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  resolvedAt: Date
}, {
  timestamps: true
});

disputeSchema.index({ order: 1 });
disputeSchema.index({ customer: 1, createdAt: -1 });
disputeSchema.index({ vendor: 1, createdAt: -1 });
disputeSchema.index({ status: 1, createdAt: -1 });

module.exports = mongoose.model('Dispute', disputeSchema);


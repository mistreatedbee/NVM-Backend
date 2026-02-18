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
  orderId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Order'
  },
  order: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Order',
    required: true
  },
  openedByUserId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  openedByRole: {
    type: String,
    enum: ['CUSTOMER', 'VENDOR']
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
  reasonCategory: {
    type: String,
    enum: ['NON_DELIVERY', 'WRONG_ITEM', 'DAMAGED', 'REFUND_REQUEST', 'SCAM', 'OTHER'],
    default: 'OTHER'
  },
  description: {
    type: String,
    required: true
  },
  evidenceUrls: {
    type: [String],
    default: []
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
    enum: ['open', 'in-review', 'resolved', 'closed', 'OPEN', 'IN_REVIEW', 'NEED_MORE_INFO', 'RESOLVED', 'CLOSED'],
    default: 'OPEN'
  },
  resolution: String,
  resolutionNote: String,
  outcome: {
    type: String,
    enum: ['REFUND_APPROVED', 'REFUND_DENIED', 'REPLACEMENT', 'PARTIAL_REFUND', 'OTHER', ''],
    default: ''
  },
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
disputeSchema.index({ orderId: 1, createdAt: -1 });
disputeSchema.index({ vendor: 1, status: 1, createdAt: -1 });

disputeSchema.pre('validate', function(next) {
  if (!this.orderId && this.order) this.orderId = this.order;
  if (!this.order && this.orderId) this.order = this.orderId;

  if (!this.openedByUserId && this.customer) this.openedByUserId = this.customer;
  if (!this.openedByRole) this.openedByRole = 'CUSTOMER';
  if (Array.isArray(this.evidenceUrls) && this.evidenceUrls.length === 0 && Array.isArray(this.evidence)) {
    this.evidenceUrls = this.evidence.map((item) => item?.url).filter(Boolean);
  }
  next();
});

module.exports = mongoose.model('Dispute', disputeSchema);


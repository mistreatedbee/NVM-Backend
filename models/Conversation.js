const mongoose = require('mongoose');

const conversationSchema = new mongoose.Schema({
  type: {
    type: String,
    enum: ['order', 'general', 'support'],
    required: true,
    default: 'general'
  },
  participantIds: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  }],
  customerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  vendorUserId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  vendorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Vendor'
  },
  orderId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Order'
  },
  orderStatusSnapshot: {
    type: String,
    default: null
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  isEscalated: {
    type: Boolean,
    default: false
  },
  escalationReason: String,
  escalatedAt: Date,
  supportStatus: {
    type: String,
    enum: ['Open', 'In Progress', 'Resolved'],
    default: 'Open'
  },
  botContext: {
    unresolvedAttempts: {
      type: Number,
      default: 0
    },
    lastIntent: String,
    awaitingClarification: {
      type: Boolean,
      default: false
    }
  },
  lastMessage: String,
  lastMessageAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

conversationSchema.index({ participantIds: 1 });
conversationSchema.index({ orderId: 1 });
conversationSchema.index({ vendorId: 1, customerId: 1, type: 1 });
conversationSchema.index({ isEscalated: 1, supportStatus: 1, updatedAt: -1 });

conversationSchema.index(
  { orderId: 1, vendorId: 1, customerId: 1, type: 1 },
  { unique: true, partialFilterExpression: { type: 'order' } }
);

module.exports = mongoose.model('Conversation', conversationSchema);

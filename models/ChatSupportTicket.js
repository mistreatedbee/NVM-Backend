const mongoose = require('mongoose');

const chatSupportTicketSchema = new mongoose.Schema(
  {
    conversationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Conversation',
      required: true,
      unique: true
    },
    vendorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Vendor',
      required: true
    },
    vendorUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    customerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    orderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Order'
    },
    status: {
      type: String,
      enum: ['Open', 'In Progress', 'Resolved'],
      default: 'Open'
    },
    escalationReason: {
      type: String,
      required: true
    },
    unresolvedAttempts: {
      type: Number,
      default: 0
    },
    assignedAdminId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    resolvedAt: Date,
    resolvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    }
  },
  {
    timestamps: true
  }
);

chatSupportTicketSchema.index({ status: 1, updatedAt: -1 });
chatSupportTicketSchema.index({ vendorUserId: 1, createdAt: -1 });

module.exports = mongoose.model('ChatSupportTicket', chatSupportTicketSchema);

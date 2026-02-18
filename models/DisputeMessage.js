const mongoose = require('mongoose');

const disputeMessageSchema = new mongoose.Schema(
  {
    disputeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Dispute',
      required: true,
      index: true
    },
    senderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    senderRole: {
      type: String,
      enum: ['CUSTOMER', 'VENDOR', 'ADMIN'],
      required: true
    },
    message: {
      type: String,
      required: true,
      trim: true,
      maxlength: 5000
    },
    attachments: {
      type: [String],
      default: []
    }
  },
  {
    timestamps: { createdAt: true, updatedAt: false }
  }
);

disputeMessageSchema.index({ disputeId: 1, createdAt: -1 });

module.exports = mongoose.model('DisputeMessage', disputeMessageSchema);


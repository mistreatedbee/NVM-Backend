const mongoose = require('mongoose');

const supportTicketSchema = new mongoose.Schema(
  {
    ticketNumber: {
      type: String,
      required: true,
      unique: true,
      trim: true
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    role: {
      type: String,
      enum: ['GUEST', 'CUSTOMER', 'VENDOR'],
      default: 'GUEST'
    },
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 120
    },
    email: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      maxlength: 160
    },
    phone: {
      type: String,
      trim: true,
      maxlength: 40
    },
    subject: {
      type: String,
      required: true,
      trim: true,
      maxlength: 200
    },
    message: {
      type: String,
      required: true,
      maxlength: 5000
    },
    category: {
      type: String,
      enum: ['TECHNICAL', 'ACCOUNT', 'ORDERS', 'PAYMENTS', 'VENDOR', 'OTHER'],
      default: 'OTHER'
    },
    status: {
      type: String,
      enum: ['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'],
      default: 'OPEN'
    },
    priority: {
      type: String,
      enum: ['LOW', 'MEDIUM', 'HIGH'],
      default: 'MEDIUM'
    },
    attachments: [
      {
        url: { type: String, trim: true },
        fileName: { type: String, trim: true },
        mimeType: { type: String, trim: true },
        size: { type: Number, min: 0 }
      }
    ]
  },
  {
    timestamps: true
  }
);

supportTicketSchema.index({ status: 1, createdAt: -1 });
supportTicketSchema.index({ userId: 1, createdAt: -1 });
supportTicketSchema.index({ category: 1, createdAt: -1 });
supportTicketSchema.index({ subject: 'text', message: 'text', name: 'text', email: 'text' });

module.exports = mongoose.model('SupportTicket', supportTicketSchema);

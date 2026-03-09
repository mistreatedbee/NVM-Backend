const mongoose = require('mongoose');

const supportMessageSchema = new mongoose.Schema(
  {
    ticketId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'SupportTicket',
      required: true
    },
    senderRole: {
      type: String,
      enum: ['USER', 'ADMIN'],
      required: true
    },
    senderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    message: {
      type: String,
      required: true,
      maxlength: 5000
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
  { timestamps: true }
);

supportMessageSchema.index({ ticketId: 1, createdAt: 1 });

module.exports = mongoose.model('SupportMessage', supportMessageSchema);

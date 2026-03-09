const mongoose = require('mongoose');

const attachmentSchema = new mongoose.Schema({
  public_id: String,
  url: String,
  fileName: String,
  mimeType: String,
  size: Number
}, { _id: false });

const messageSchema = new mongoose.Schema({
  conversationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Conversation',
    required: true,
    index: true
  },
  senderId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  senderRole: {
    type: String,
    enum: ['Customer', 'Vendor', 'Admin', 'Bot', 'System'],
    required: true
  },
  messageContent: {
    type: String,
    trim: true,
    maxlength: 4000,
    default: ''
  },
  messageType: {
    type: String,
    enum: ['text', 'image', 'file', 'system'],
    default: 'text'
  },
  attachment: attachmentSchema,
  readAt: {
    type: Date,
    default: null
  }
}, {
  timestamps: { createdAt: true, updatedAt: false }
});

messageSchema.index({ conversationId: 1, createdAt: -1 });

module.exports = mongoose.model('Message', messageSchema);

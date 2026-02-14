const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    alias: 'user',
    required: true
  },
  role: {
    type: String,
    enum: ['customer', 'vendor', 'admin'],
    required: true
  },
  type: {
    type: String,
    enum: ['ORDER', 'APPROVAL', 'ACCOUNT', 'CHAT_ESCALATION', 'SYSTEM', 'PAYOUT', 'REVIEW', 'SECURITY'],
    required: true
  },
  title: {
    type: String,
    required: true
  },
  message: {
    type: String,
    required: true
  },
  linkUrl: {
    type: String,
    alias: 'link'
  },
  metadata: {
    type: mongoose.Schema.Types.Mixed,
    alias: 'data'
  },
  isRead: {
    type: Boolean,
    alias: 'read',
    default: false
  }
}, {
  timestamps: true
});

notificationSchema.index({ userId: 1, isRead: 1 });
notificationSchema.index({ createdAt: -1 });
notificationSchema.index({ role: 1, type: 1, createdAt: -1 });

module.exports = mongoose.model('Notification', notificationSchema);


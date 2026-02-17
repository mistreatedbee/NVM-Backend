const mongoose = require('mongoose');

function normalizeRole(role) {
  const value = String(role || '').toUpperCase();
  if (value === 'ADMIN') return 'ADMIN';
  if (value === 'VENDOR') return 'VENDOR';
  return 'CUSTOMER';
}

function normalizeType(type) {
  const value = String(type || '').toUpperCase();
  if (value === 'ORDER') return 'ORDER';
  if (value === 'VENDOR_APPROVAL' || value === 'APPROVAL') return 'VENDOR_APPROVAL';
  if (value === 'ACCOUNT_STATUS' || value === 'ACCOUNT' || value === 'SECURITY') return 'ACCOUNT_STATUS';
  return 'SYSTEM';
}

const notificationSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    alias: 'user',
    required: true
  },
  role: {
    type: String,
    enum: ['CUSTOMER', 'VENDOR', 'ADMIN'],
    set: normalizeRole,
    required: true
  },
  type: {
    type: String,
    enum: ['ORDER', 'VENDOR_APPROVAL', 'ACCOUNT_STATUS', 'SYSTEM'],
    set: normalizeType,
    required: true
  },
  subType: {
    type: String,
    default: 'GENERAL'
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
notificationSchema.index({ userId: 1, createdAt: -1 });
notificationSchema.index({ type: 1, createdAt: -1 });
notificationSchema.index({ role: 1, type: 1, createdAt: -1 });

module.exports = mongoose.model('Notification', notificationSchema);


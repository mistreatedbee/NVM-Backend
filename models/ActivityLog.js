const mongoose = require('mongoose');

const activityLogSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  role: {
    type: String,
    enum: ['ADMIN', 'VENDOR', 'CUSTOMER'],
    required: true
  },
  action: {
    type: String,
    enum: ['LOGIN', 'LOGOUT', 'REGISTER', 'PASSWORD_RESET', 'PRODUCT_CREATE', 'ORDER_PLACED', 'REVIEW_CREATED', 'PROFILE_UPDATED', 'CHAT_MESSAGE', 'ADMIN_ACTION'],
    required: true
  },
  entityType: {
    type: String,
    enum: ['USER', 'PRODUCT', 'ORDER', 'REVIEW', 'VENDOR', 'DOCUMENT', 'SYSTEM'],
    default: 'SYSTEM'
  },
  entityId: {
    type: mongoose.Schema.Types.ObjectId,
    default: null
  },
  metadata: mongoose.Schema.Types.Mixed,
  ipAddress: {
    type: String,
    default: ''
  },
  userAgent: {
    type: String,
    default: ''
  }
}, {
  timestamps: { createdAt: true, updatedAt: false }
});

activityLogSchema.index({ userId: 1, createdAt: -1 });
activityLogSchema.index({ action: 1, createdAt: -1 });
activityLogSchema.index({ role: 1, createdAt: -1 });
activityLogSchema.index({ createdAt: -1 });

module.exports = mongoose.model('ActivityLog', activityLogSchema);

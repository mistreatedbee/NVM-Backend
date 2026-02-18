const mongoose = require('mongoose');

const actionTypeEnum = [
  'USER_BAN',
  'USER_UNBAN',
  'USER_SUSPEND',
  'USER_UNSUSPEND',
  'USER_ROLE_CHANGE',
  'ADMIN_EDIT_USER',
  'ADMIN_EDIT_VENDOR',
  'VENDOR_APPROVE',
  'VENDOR_REJECT',
  'VENDOR_SUSPEND',
  'VENDOR_UNSUSPEND',
  'VENDOR_VERIFY',
  'VENDOR_UNVERIFY',
  'VENDOR_COMPLIANCE_REVIEW',
  'PRODUCT_APPROVE',
  'PRODUCT_REJECT',
  'PRODUCT_UNPUBLISH',
  'PRODUCT_REPUBLISH',
  'PRODUCT_FLAG',
  'PRODUCT_REMOVE',
  'REVIEW_APPROVE',
  'REVIEW_REJECT',
  'REVIEW_HIDE',
  'REVIEW_DELETE',
  'DOC_APPROVE',
  'DOC_REJECT',
  'NOTIFICATION_BROADCAST',
  'SYSTEM_ALERT_CREATED',
  'ADMIN_ALERT_CREATED'
];

const targetTypeEnum = ['USER', 'VENDOR', 'PRODUCT', 'REVIEW', 'ORDER', 'DOCUMENT', 'SYSTEM'];

const auditLogSchema = new mongoose.Schema({
  actorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  actorRole: {
    type: String,
    enum: ['Customer', 'Vendor', 'Admin', 'Bot', 'System'],
    default: 'System'
  },
  action: {
    type: String,
    default: null
  },
  entityType: {
    type: String,
    enum: ['Conversation', 'Message', 'SupportTicket', 'Notification', 'Vendor', 'User', 'Order', 'System', 'Document', 'Product', 'Invoice', 'VendorTransaction', 'Review'],
    default: 'System'
  },
  entityId: {
    type: mongoose.Schema.Types.ObjectId,
    default: null
  },

  actorAdminId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  actionType: {
    type: String,
    enum: actionTypeEnum,
    default: null
  },
  targetType: {
    type: String,
    enum: targetTypeEnum,
    default: null
  },
  targetId: {
    type: mongoose.Schema.Types.ObjectId,
    default: null
  },
  targetVendorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Vendor',
    default: null
  },
  targetProductId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product',
    default: null
  },
  reason: {
    type: String,
    maxlength: 1000,
    default: ''
  },
  ipAddress: {
    type: String,
    default: ''
  },
  userAgent: {
    type: String,
    default: ''
  },
  metadata: mongoose.Schema.Types.Mixed
}, {
  timestamps: { createdAt: true, updatedAt: false }
});

auditLogSchema.index({ targetType: 1, targetId: 1, createdAt: -1 });
auditLogSchema.index({ actorAdminId: 1, createdAt: -1 });
auditLogSchema.index({ actionType: 1, createdAt: -1 });
auditLogSchema.index({ createdAt: -1 });

// Legacy indexes retained for backward compatibility.
auditLogSchema.index({ entityType: 1, entityId: 1, createdAt: -1 });
auditLogSchema.index({ action: 1, createdAt: -1 });
auditLogSchema.index({ targetVendorId: 1, createdAt: -1 });
auditLogSchema.index({ targetProductId: 1, createdAt: -1 });

module.exports = mongoose.model('AuditLog', auditLogSchema);

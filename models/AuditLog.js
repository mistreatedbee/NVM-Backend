const mongoose = require('mongoose');

const auditLogSchema = new mongoose.Schema({
  // Legacy/general audit shape
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

  // Vendor-management audit shape
  actorAdminId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  actionType: {
    type: String,
    enum: [
      'VENDOR_APPROVE',
      'VENDOR_REJECT',
      'VENDOR_SUSPEND',
      'VENDOR_UNSUSPEND',
      'DOC_APPROVE',
      'DOC_REJECT',
      'VENDOR_VERIFY',
      'VENDOR_UNVERIFY',
      'ADMIN_EDIT_VENDOR',
      'PRODUCT_APPROVE',
      'PRODUCT_REJECT',
      'PRODUCT_UNPUBLISH',
      'PRODUCT_PUBLISH',
      'PRODUCT_FLAG',
      'REVIEW_APPROVE',
      'REVIEW_REJECT',
      'REVIEW_HIDE',
      'REVIEW_DELETE'
    ],
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
  metadata: mongoose.Schema.Types.Mixed
}, {
  timestamps: { createdAt: true, updatedAt: false }
});

auditLogSchema.index({ entityType: 1, entityId: 1, createdAt: -1 });
auditLogSchema.index({ action: 1, createdAt: -1 });
auditLogSchema.index({ targetVendorId: 1, createdAt: -1 });
auditLogSchema.index({ targetProductId: 1, createdAt: -1 });
auditLogSchema.index({ actorAdminId: 1, createdAt: -1 });
auditLogSchema.index({ actionType: 1, createdAt: -1 });

module.exports = mongoose.model('AuditLog', auditLogSchema);

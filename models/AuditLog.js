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
  'CATEGORY_CREATE',
  'CATEGORY_UPDATE',
  'CATEGORY_FEATURE',
  'CATEGORY_REORDER',
  'CATEGORY_DEACTIVATE',
  'CATEGORY_DELETE',
  'PROHIBITED_RULE_CREATE',
  'PROHIBITED_RULE_UPDATE',
  'PROHIBITED_RULE_DELETE',
  'ORDER_CANCEL',
  'REFUND_APPROVE',
  'REFUND_REJECT',
  'REFUND_MARK_REFUNDED',
  'DISPUTE_STATUS_UPDATE',
  'DISPUTE_MESSAGE_ADD',
  'FRAUD_FLAG_CREATE',
  'FRAUD_FLAG_RESOLVE',
  'REPORT_STATUS_UPDATE',
  'CMS_PAGE_CREATE',
  'CMS_PAGE_UPDATE',
  'CMS_PAGE_DELETE',
  'CMS_PAGE_PUBLISH',
  'CMS_PAGE_UNPUBLISH',
  'BANNER_CREATE',
  'BANNER_UPDATE',
  'BANNER_DELETE',
  'HOMEPAGE_SECTION_CREATE',
  'HOMEPAGE_SECTION_UPDATE',
  'HOMEPAGE_SECTION_DELETE',
  'HOMEPAGE_SECTION_REORDER',
  'ORDER_CHARGEBACK_OPEN',
  'ORDER_CHARGEBACK_RESOLVE',
  'NOTIFICATION_BROADCAST',
  'SYSTEM_ALERT_CREATED',
  'ADMIN_ALERT_CREATED'
];

const targetTypeEnum = ['USER', 'VENDOR', 'PRODUCT', 'REVIEW', 'ORDER', 'DOCUMENT', 'SYSTEM', 'CATEGORY', 'CMS_PAGE', 'BANNER', 'HOMEPAGE_SECTION', 'REPORT', 'DISPUTE', 'REFUND', 'FRAUD_FLAG', 'PROHIBITED_RULE'];

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
    enum: ['Conversation', 'Message', 'SupportTicket', 'Notification', 'Vendor', 'User', 'Order', 'System', 'Document', 'Product', 'Invoice', 'VendorTransaction', 'Review', 'Category', 'Cms_page', 'Banner', 'Homepage_section', 'Report', 'Dispute', 'Refund', 'Fraud_flag', 'Prohibited_rule'],
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

const mongoose = require('mongoose');

const complianceFlagSchema = new mongoose.Schema({
  vendorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Vendor',
    required: true,
    index: true
  },
  type: {
    type: String,
    enum: ['KYC_MISSING', 'DOC_EXPIRED', 'PROHIBITED_ITEM', 'TOO_MANY_REPORTS', 'PAYMENT_RISK', 'OTHER'],
    required: true
  },
  severity: {
    type: String,
    enum: ['LOW', 'MEDIUM', 'HIGH'],
    required: true,
    default: 'LOW'
  },
  status: {
    type: String,
    enum: ['OPEN', 'RESOLVED'],
    default: 'OPEN'
  },
  note: {
    type: String,
    maxlength: 1000,
    default: ''
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  resolvedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  resolvedAt: {
    type: Date,
    default: null
  }
}, {
  timestamps: { createdAt: true, updatedAt: false }
});

complianceFlagSchema.index({ vendorId: 1, createdAt: -1 });
complianceFlagSchema.index({ status: 1, severity: 1, createdAt: -1 });

module.exports = mongoose.model('ComplianceFlag', complianceFlagSchema);

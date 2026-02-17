const mongoose = require('mongoose');

const vendorDocumentSchema = new mongoose.Schema({
  vendorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Vendor',
    required: true
  },
  docType: {
    type: String,
    enum: ['BUSINESS_REG', 'COMPLIANCE', 'ID', 'TAX', 'OTHER'],
    required: true
  },
  fileName: {
    type: String,
    required: true,
    trim: true
  },
  fileUrl: {
    type: String,
    required: true
  },
  storageKey: {
    type: String,
    default: null
  },
  mimeType: {
    type: String,
    required: true
  },
  size: {
    type: Number,
    required: true
  },
  status: {
    type: String,
    enum: ['UPLOADED', 'APPROVED', 'REJECTED'],
    default: 'UPLOADED'
  },
  uploadedAt: {
    type: Date,
    default: Date.now
  },
  reviewedAt: Date,
  reviewedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  reviewNote: {
    type: String,
    maxlength: 1000
  }
}, {
  timestamps: true
});

vendorDocumentSchema.index({ vendorId: 1 });
vendorDocumentSchema.index({ status: 1 });
vendorDocumentSchema.index({ docType: 1 });
vendorDocumentSchema.index({ uploadedAt: -1 });

module.exports = mongoose.model('VendorDocument', vendorDocumentSchema);

const mongoose = require('mongoose');

const vendorDocumentSchema = new mongoose.Schema({
  vendorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Vendor',
    required: true
  },
  docType: {
    type: String,
    enum: ['BUSINESS_REG', 'ID_DOC', 'PROOF_OF_ADDRESS', 'TAX', 'BANK_CONFIRMATION', 'OTHER', 'COMPLIANCE', 'ID'],
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
    enum: ['PENDING', 'UPLOADED', 'APPROVED', 'REJECTED'],
    default: 'PENDING'
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
vendorDocumentSchema.index({ vendorId: 1, status: 1 });
vendorDocumentSchema.index({ docType: 1 });
vendorDocumentSchema.index({ uploadedAt: -1 });
vendorDocumentSchema.index({ status: 1, uploadedAt: -1 });

vendorDocumentSchema.pre('save', function(next) {
  if (this.status === 'UPLOADED') {
    this.status = 'PENDING';
  }
  if (this.docType === 'COMPLIANCE') this.docType = 'PROOF_OF_ADDRESS';
  if (this.docType === 'ID') this.docType = 'ID_DOC';
  next();
});

module.exports = mongoose.model('VendorDocument', vendorDocumentSchema);

const mongoose = require('mongoose');

const reportSchema = new mongoose.Schema({
  reporterId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  targetType: {
    type: String,
    enum: ['USER', 'VENDOR', 'PRODUCT', 'REVIEW'],
    required: true
  },
  targetId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true
  },
  reasonCategory: {
    type: String,
    enum: ['SPAM', 'SCAM', 'PROHIBITED_ITEM', 'HARASSMENT', 'FAKE_PRODUCT', 'INFRINGEMENT', 'OTHER'],
    default: 'OTHER'
  },
  reason: {
    type: String,
    trim: true,
    maxlength: 1000
  },
  description: {
    type: String,
    trim: true,
    maxlength: 5000,
    default: ''
  },
  evidenceUrls: {
    type: [String],
    default: []
  },
  status: {
    type: String,
    enum: ['OPEN', 'IN_REVIEW', 'RESOLVED', 'DISMISSED'],
    default: 'OPEN'
  },
  resolvedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  resolutionNote: {
    type: String,
    trim: true,
    maxlength: 2000,
    default: ''
  }
}, { timestamps: { createdAt: true, updatedAt: true } });

reportSchema.index({ targetType: 1, targetId: 1, status: 1 });
reportSchema.index({ targetType: 1, status: 1, createdAt: -1 });
reportSchema.index({ status: 1, createdAt: -1 });
reportSchema.index({ reporterId: 1, createdAt: -1 });
reportSchema.index({ targetId: 1, createdAt: -1 });
reportSchema.index(
  { reporterId: 1, targetType: 1, targetId: 1, status: 1 },
  {
    unique: true,
    partialFilterExpression: { status: { $in: ['OPEN', 'IN_REVIEW'] } },
    name: 'uniq_open_reporter_target'
  }
);

reportSchema.pre('validate', function(next) {
  if (!this.reason) {
    this.reason = this.reasonCategory || 'OTHER';
  }
  if (!this.reasonCategory) {
    this.reasonCategory = 'OTHER';
  }
  next();
});

module.exports = mongoose.model('Report', reportSchema);

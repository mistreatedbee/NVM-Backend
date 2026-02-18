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
  reason: {
    type: String,
    required: true,
    trim: true,
    maxlength: 1000
  },
  status: {
    type: String,
    enum: ['OPEN', 'IN_REVIEW', 'RESOLVED', 'DISMISSED'],
    default: 'OPEN'
  }
}, { timestamps: { createdAt: true, updatedAt: true } });

reportSchema.index({ targetType: 1, targetId: 1, status: 1 });
reportSchema.index({ status: 1, createdAt: -1 });
reportSchema.index({ reporterId: 1, createdAt: -1 });

module.exports = mongoose.model('Report', reportSchema);

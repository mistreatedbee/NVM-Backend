const mongoose = require('mongoose');

const reviewReportSchema = new mongoose.Schema({
  reviewId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Review',
    required: true
  },
  reporterId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  reason: {
    type: String,
    required: true,
    enum: ['spam', 'abuse', 'fake', 'off-topic', 'copyright', 'other']
  }
}, {
  timestamps: { createdAt: true, updatedAt: false }
});

reviewReportSchema.index({ reviewId: 1, reporterId: 1 }, { unique: true });
reviewReportSchema.index({ reason: 1, createdAt: -1 });

module.exports = mongoose.model('ReviewReport', reviewReportSchema);

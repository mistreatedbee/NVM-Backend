const mongoose = require('mongoose');

const helpfulVoteSchema = new mongoose.Schema({
  reviewId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Review',
    required: true
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  }
}, {
  timestamps: { createdAt: true, updatedAt: false }
});

helpfulVoteSchema.index({ reviewId: 1, userId: 1 }, { unique: true });
helpfulVoteSchema.index({ userId: 1, createdAt: -1 });

module.exports = mongoose.model('HelpfulVote', helpfulVoteSchema);

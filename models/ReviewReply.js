const mongoose = require('mongoose');

const reviewReplySchema = new mongoose.Schema(
  {
    reviewId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Review',
      required: true
    },
    vendorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Vendor',
      required: true
    },
    message: {
      type: String,
      required: true,
      trim: true,
      maxlength: 1200
    }
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

reviewReplySchema.index({ reviewId: 1, vendorId: 1 }, { unique: true });

module.exports = mongoose.model('ReviewReply', reviewReplySchema);

const mongoose = require('mongoose');

const productQuestionSchema = new mongoose.Schema(
  {
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
      required: true
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    question: {
      type: String,
      required: true,
      trim: true,
      maxlength: 1000
    },
    status: {
      type: String,
      enum: ['PUBLISHED', 'HIDDEN'],
      default: 'PUBLISHED'
    }
  },
  { timestamps: true }
);

productQuestionSchema.index({ productId: 1, status: 1, createdAt: -1 });

module.exports = mongoose.model('ProductQuestion', productQuestionSchema);

const mongoose = require('mongoose');

const faqSchema = new mongoose.Schema(
  {
    question: {
      type: String,
      required: true,
      trim: true,
      maxlength: 300
    },
    answer: {
      type: String,
      required: true,
      maxlength: 10000
    },
    category: {
      type: String,
      enum: ['GENERAL', 'ORDERS', 'PAYMENTS', 'VENDORS', 'PRODUCTS', 'ACCOUNT', 'SECURITY', 'OTHER'],
      default: 'GENERAL'
    },
    audience: {
      type: String,
      enum: ['ALL', 'VENDOR', 'CUSTOMER'],
      default: 'ALL'
    },
    status: {
      type: String,
      enum: ['DRAFT', 'PUBLISHED', 'ARCHIVED'],
      default: 'DRAFT'
    },
    featured: {
      type: Boolean,
      default: false
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    publishedAt: Date
  },
  { timestamps: true }
);

faqSchema.index({ status: 1, category: 1 });
faqSchema.index({ audience: 1, status: 1 });
faqSchema.index({ question: 'text', answer: 'text' });

module.exports = mongoose.model('FAQ', faqSchema);

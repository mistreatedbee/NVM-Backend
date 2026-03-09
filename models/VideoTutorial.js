const mongoose = require('mongoose');

const videoTutorialSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 220
    },
    slug: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true
    },
    description: {
      type: String,
      trim: true,
      maxlength: 2000
    },
    videoType: {
      type: String,
      enum: ['YOUTUBE', 'VIMEO', 'LINK', 'UPLOAD'],
      default: 'LINK'
    },
    videoUrl: {
      type: String,
      required: true,
      trim: true
    },
    thumbnailUrl: {
      type: String,
      trim: true
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

videoTutorialSchema.index({ status: 1, category: 1 });
videoTutorialSchema.index({ title: 'text', description: 'text' });

module.exports = mongoose.model('VideoTutorial', videoTutorialSchema);

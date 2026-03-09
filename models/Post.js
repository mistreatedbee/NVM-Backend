const mongoose = require('mongoose');

const postSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, 'Post title is required'],
      trim: true,
      maxlength: [220, 'Title cannot exceed 220 characters']
    },
    slug: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true
    },
    excerpt: {
      type: String,
      trim: true,
      maxlength: [700, 'Excerpt cannot exceed 700 characters']
    },
    content: {
      type: String,
      required: [true, 'Post content is required']
    },
    type: {
      type: String,
      enum: ['ANNOUNCEMENT', 'BLOG'],
      required: true
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
    coverImageUrl: {
      type: String,
      trim: true
    },
    tags: [{ type: String, trim: true }],
    audience: {
      type: String,
      enum: ['ALL', 'VENDOR', 'CUSTOMER'],
      default: 'ALL'
    },
    meta: {
      metaTitle: { type: String, trim: true, maxlength: [220, 'metaTitle cannot exceed 220 characters'] },
      metaDescription: { type: String, trim: true, maxlength: [320, 'metaDescription cannot exceed 320 characters'] },
      ogImageUrl: { type: String, trim: true }
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    publishedAt: Date,
    viewCount: {
      type: Number,
      default: 0
    },
    lastViewedAt: Date
  },
  { timestamps: true }
);

postSchema.index({ type: 1, status: 1, publishedAt: -1 });
postSchema.index({ status: 1, publishedAt: -1 });
postSchema.index({ tags: 1 });
postSchema.index({ title: 'text', content: 'text', excerpt: 'text' });
postSchema.index({ audience: 1, status: 1 });

module.exports = mongoose.model('Post', postSchema);

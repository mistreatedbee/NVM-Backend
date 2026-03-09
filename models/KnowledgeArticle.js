const mongoose = require('mongoose');

const CATEGORY_ENUM = [
  'GETTING_STARTED',
  'PRODUCTS',
  'ORDERS',
  'PAYMENTS',
  'MARKETING',
  'POLICIES',
  'BEST_PRACTICES',
  'OTHER'
];

const AUDIENCE_ENUM = ['VENDOR', 'CUSTOMER', 'ALL'];
const STATUS_ENUM = ['DRAFT', 'PUBLISHED', 'ARCHIVED'];

const knowledgeArticleSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, 'Article title is required'],
      trim: true,
      maxlength: [200, 'Title cannot exceed 200 characters']
    },
    slug: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true
    },
    summary: {
      type: String,
      trim: true,
      maxlength: [600, 'Summary cannot exceed 600 characters']
    },
    content: {
      type: String,
      required: [true, 'Article content is required']
    },
    category: {
      type: String,
      enum: CATEGORY_ENUM,
      default: 'OTHER'
    },
    tags: [{ type: String, trim: true }],
    audience: {
      type: String,
      enum: AUDIENCE_ENUM,
      default: 'VENDOR'
    },
    status: {
      type: String,
      enum: STATUS_ENUM,
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
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    publishedAt: Date
  },
  { timestamps: true }
);

knowledgeArticleSchema.index({ status: 1, publishedAt: -1 });
knowledgeArticleSchema.index({ category: 1, status: 1 });
knowledgeArticleSchema.index({ tags: 1 });
knowledgeArticleSchema.index({ title: 'text', content: 'text', summary: 'text' });

module.exports = mongoose.model('KnowledgeArticle', knowledgeArticleSchema);

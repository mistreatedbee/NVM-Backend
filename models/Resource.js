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
const TYPE_ENUM = ['PDF', 'VIDEO', 'LINK', 'FILE'];

const resourceSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, 'Resource title is required'],
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
    description: {
      type: String,
      trim: true,
      maxlength: [1000, 'Description cannot exceed 1000 characters']
    },
    type: {
      type: String,
      enum: TYPE_ENUM,
      required: true
    },
    category: {
      type: String,
      enum: CATEGORY_ENUM,
      default: 'OTHER'
    },
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
    fileUrl: {
      type: String,
      trim: true
    },
    fileName: {
      type: String,
      trim: true
    },
    fileSize: Number,
    mimeType: {
      type: String,
      trim: true
    },
    storageKey: {
      type: String,
      trim: true
    },
    externalUrl: {
      type: String,
      trim: true
    },
    thumbnailUrl: {
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

resourceSchema.index({ status: 1, publishedAt: -1 });
resourceSchema.index({ category: 1, status: 1 });
resourceSchema.index({ title: 'text', description: 'text' });

module.exports = mongoose.model('Resource', resourceSchema);

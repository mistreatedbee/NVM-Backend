const mongoose = require('mongoose');

const cmsPageSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
    trim: true,
    maxlength: 200
  },
  slug: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true
  },
  content: {
    type: String,
    default: ''
  },
  status: {
    type: String,
    enum: ['DRAFT', 'PUBLISHED'],
    default: 'DRAFT'
  },
  audience: {
    type: String,
    enum: ['ALL', 'VENDOR', 'CUSTOMER'],
    default: 'ALL'
  },
  publishedAt: {
    type: Date,
    default: null
  }
}, { timestamps: true });

cmsPageSchema.index({ slug: 1 }, { unique: true });
cmsPageSchema.index({ status: 1, updatedAt: -1 });

module.exports = mongoose.model('CMSPage', cmsPageSchema);

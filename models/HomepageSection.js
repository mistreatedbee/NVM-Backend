const mongoose = require('mongoose');

const homepageSectionSchema = new mongoose.Schema({
  key: {
    type: String,
    enum: ['FEATURED_PRODUCTS', 'TRENDING', 'NEW_ARRIVALS', 'FEATURED_VENDORS', 'CUSTOM'],
    required: true
  },
  title: {
    type: String,
    required: true,
    trim: true,
    maxlength: 200
  },
  isActive: {
    type: Boolean,
    default: true
  },
  config: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  sortOrder: {
    type: Number,
    default: 0
  }
}, { timestamps: true });

homepageSectionSchema.index({ key: 1, sortOrder: 1 });
homepageSectionSchema.index({ isActive: 1, sortOrder: 1 });

module.exports = mongoose.model('HomepageSection', homepageSectionSchema);

const mongoose = require('mongoose');

const bannerSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
    trim: true,
    maxlength: 200
  },
  imageUrl: {
    type: String,
    required: true
  },
  linkUrl: {
    type: String,
    default: ''
  },
  placement: {
    type: String,
    enum: ['HOMEPAGE_TOP', 'HOMEPAGE_MID', 'CATEGORY', 'VENDOR_DASHBOARD', 'OTHER'],
    default: 'OTHER'
  },
  isActive: {
    type: Boolean,
    default: true
  },
  startAt: {
    type: Date,
    default: null
  },
  endAt: {
    type: Date,
    default: null
  },
  sortOrder: {
    type: Number,
    default: 0
  }
}, { timestamps: true });

bannerSchema.index({ placement: 1, isActive: 1, sortOrder: 1 });
bannerSchema.index({ isActive: 1, startAt: 1, endAt: 1 });

module.exports = mongoose.model('Banner', bannerSchema);

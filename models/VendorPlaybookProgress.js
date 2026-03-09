const mongoose = require('mongoose');

const vendorPlaybookProgressSchema = new mongoose.Schema(
  {
    vendorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Vendor',
      required: true
    },
    lessonId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'PlaybookLesson',
      required: true
    },
    completed: {
      type: Boolean,
      default: false
    },
    completedAt: Date,
    checklistState: {
      type: Map,
      of: Boolean,
      default: {}
    },
    lastViewedAt: {
      type: Date,
      default: Date.now
    }
  },
  { timestamps: true }
);

vendorPlaybookProgressSchema.index({ vendorId: 1, lessonId: 1 }, { unique: true });

module.exports = mongoose.model('VendorPlaybookProgress', vendorPlaybookProgressSchema);

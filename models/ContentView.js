const mongoose = require('mongoose');

const contentViewSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    role: {
      type: String,
      enum: ['VENDOR', 'CUSTOMER', 'ADMIN', 'GUEST'],
      default: 'GUEST'
    },
    contentType: {
      type: String,
      enum: ['ARTICLE', 'RESOURCE'],
      required: true
    },
    contentId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true
    },
    sessionId: {
      type: String,
      trim: true
    },
    ipHash: {
      type: String,
      trim: true
    }
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

contentViewSchema.index({ contentType: 1, contentId: 1, createdAt: -1 });
contentViewSchema.index({ userId: 1, createdAt: -1 });

module.exports = mongoose.model('ContentView', contentViewSchema);

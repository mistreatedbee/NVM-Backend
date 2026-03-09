const mongoose = require('mongoose');

const engagementEventSchema = new mongoose.Schema(
  {
    contentType: {
      type: String,
      enum: ['POST'],
      default: 'POST',
      required: true
    },
    contentId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      ref: 'Post'
    },
    eventType: {
      type: String,
      enum: ['VIEW', 'CLICK', 'SHARE'],
      default: 'VIEW',
      required: true
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    role: {
      type: String,
      enum: ['ADMIN', 'VENDOR', 'CUSTOMER', 'GUEST'],
      default: 'GUEST'
    },
    sessionId: {
      type: String,
      trim: true
    },
    ipHash: {
      type: String,
      trim: true
    },
    userAgent: {
      type: String,
      trim: true
    },
    referrer: {
      type: String,
      trim: true
    }
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

engagementEventSchema.index({ contentId: 1, createdAt: -1 });
engagementEventSchema.index({ eventType: 1, createdAt: -1 });
engagementEventSchema.index({ userId: 1, createdAt: -1 });

module.exports = mongoose.model('EngagementEvent', engagementEventSchema);

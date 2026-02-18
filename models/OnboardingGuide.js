const mongoose = require('mongoose');

const guideStepSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 200 },
    content: { type: String, required: true, maxlength: 10000 },
    checklistKey: { type: String, trim: true, maxlength: 120 }
  },
  { _id: false }
);

const onboardingGuideSchema = new mongoose.Schema(
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
      maxlength: 1000
    },
    steps: {
      type: [guideStepSchema],
      default: []
    },
    audience: {
      type: String,
      enum: ['VENDOR', 'ALL'],
      default: 'VENDOR'
    },
    status: {
      type: String,
      enum: ['DRAFT', 'PUBLISHED', 'ARCHIVED'],
      default: 'DRAFT'
    },
    order: {
      type: Number,
      default: 0
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

onboardingGuideSchema.index({ slug: 1 }, { unique: true });
onboardingGuideSchema.index({ status: 1, order: 1 });
onboardingGuideSchema.index({ title: 'text', description: 'text' });

module.exports = mongoose.model('OnboardingGuide', onboardingGuideSchema);

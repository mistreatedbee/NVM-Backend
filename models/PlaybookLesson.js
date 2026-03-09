const mongoose = require('mongoose');

const checklistItemSchema = new mongoose.Schema(
  {
    text: {
      type: String,
      required: true,
      trim: true,
      maxlength: [300, 'Checklist item cannot exceed 300 characters']
    },
    key: {
      type: String,
      required: true,
      trim: true,
      maxlength: [100, 'Checklist key cannot exceed 100 characters']
    }
  },
  { _id: false }
);

const playbookLessonSchema = new mongoose.Schema(
  {
    moduleId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'PlaybookModule',
      required: true
    },
    title: {
      type: String,
      required: [true, 'Lesson title is required'],
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
    content: {
      type: String,
      required: [true, 'Lesson content is required']
    },
    checklistItems: {
      type: [checklistItemSchema],
      default: []
    },
    estimatedTimeMinutes: {
      type: Number,
      default: 10,
      min: 1
    },
    order: {
      type: Number,
      default: 0
    },
    status: {
      type: String,
      enum: ['DRAFT', 'PUBLISHED'],
      default: 'DRAFT'
    }
  },
  { timestamps: true }
);

playbookLessonSchema.index({ moduleId: 1, order: 1, status: 1 });

module.exports = mongoose.model('PlaybookLesson', playbookLessonSchema);

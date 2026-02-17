const mongoose = require('mongoose');

const playbookModuleSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, 'Module title is required'],
      trim: true,
      maxlength: [180, 'Title cannot exceed 180 characters']
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
      maxlength: [1200, 'Description cannot exceed 1200 characters']
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

playbookModuleSchema.index({ order: 1, status: 1 });

module.exports = mongoose.model('PlaybookModule', playbookModuleSchema);

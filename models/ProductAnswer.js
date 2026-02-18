const mongoose = require('mongoose');

const productAnswerSchema = new mongoose.Schema(
  {
    questionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ProductQuestion',
      required: true,
      unique: true
    },
    vendorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Vendor'
    },
    adminId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    answer: {
      type: String,
      required: true,
      trim: true,
      maxlength: 1500
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model('ProductAnswer', productAnswerSchema);

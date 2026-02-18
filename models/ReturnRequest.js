const mongoose = require('mongoose');

const returnItemSchema = new mongoose.Schema(
  {
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
      required: true
    },
    qty: {
      type: Number,
      required: true,
      min: 1
    },
    reason: {
      type: String,
      required: true,
      trim: true,
      maxlength: 500
    }
  },
  { _id: false }
);

const returnRequestSchema = new mongoose.Schema(
  {
    orderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Order',
      required: true
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    items: {
      type: [returnItemSchema],
      default: []
    },
    status: {
      type: String,
      enum: ['REQUESTED', 'APPROVED', 'REJECTED', 'REFUNDED'],
      default: 'REQUESTED'
    },
    adminNote: String
  },
  { timestamps: true }
);

returnRequestSchema.index({ orderId: 1, userId: 1, createdAt: -1 });
returnRequestSchema.index({ status: 1, createdAt: -1 });

module.exports = mongoose.model('ReturnRequest', returnRequestSchema);

const mongoose = require('mongoose');

const fraudFlagSchema = new mongoose.Schema({
  orderId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Order',
    required: true
  },
  level: {
    type: String,
    enum: ['LOW', 'MEDIUM', 'HIGH'],
    required: true
  },
  reason: {
    type: String,
    required: true,
    trim: true,
    maxlength: 1000
  },
  status: {
    type: String,
    enum: ['OPEN', 'RESOLVED'],
    default: 'OPEN'
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  resolvedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  resolvedAt: {
    type: Date,
    default: null
  },
  note: {
    type: String,
    default: ''
  }
}, { timestamps: { createdAt: true, updatedAt: true } });

fraudFlagSchema.index({ orderId: 1, status: 1 });
fraudFlagSchema.index({ status: 1, createdAt: -1 });

module.exports = mongoose.model('FraudFlag', fraudFlagSchema);

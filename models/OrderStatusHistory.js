const mongoose = require('mongoose');

const orderStatusHistorySchema = new mongoose.Schema({
  orderId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Order',
    required: true,
    index: true
  },
  actorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  actorRole: {
    type: String,
    enum: ['CUSTOMER', 'VENDOR', 'ADMIN', 'SYSTEM'],
    required: true
  },
  level: {
    type: String,
    enum: ['ORDER', 'ITEM'],
    required: true
  },
  itemProductId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product',
    default: null
  },
  itemVendorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Vendor',
    default: null
  },
  fromStatus: {
    type: String,
    default: null
  },
  toStatus: {
    type: String,
    required: true
  },
  note: {
    type: String,
    trim: true,
    default: ''
  }
}, {
  timestamps: { createdAt: true, updatedAt: false }
});

orderStatusHistorySchema.index({ orderId: 1, createdAt: -1 });
orderStatusHistorySchema.index({ itemVendorId: 1, createdAt: -1 });

module.exports = mongoose.model('OrderStatusHistory', orderStatusHistorySchema);

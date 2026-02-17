const mongoose = require('mongoose');

const productHistorySchema = new mongoose.Schema({
  productId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product',
    required: true
  },
  actorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  actorRole: {
    type: String,
    enum: ['VENDOR', 'ADMIN'],
    required: true
  },
  action: {
    type: String,
    enum: ['CREATE', 'UPDATE', 'SUBMIT', 'APPROVE', 'REJECT', 'PUBLISH', 'UNPUBLISH', 'ARCHIVE'],
    required: true
  },
  changes: mongoose.Schema.Types.Mixed,
  previousStatus: String,
  newStatus: String,
  note: String
}, {
  timestamps: { createdAt: true, updatedAt: false }
});

productHistorySchema.index({ productId: 1, createdAt: -1 });
productHistorySchema.index({ actorId: 1, createdAt: -1 });
productHistorySchema.index({ createdAt: -1 });

module.exports = mongoose.model('ProductHistory', productHistorySchema);

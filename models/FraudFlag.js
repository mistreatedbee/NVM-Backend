const mongoose = require('mongoose');

const fraudFlagSchema = new mongoose.Schema({
  entityType: {
    type: String,
    enum: ['ORDER', 'USER', 'VENDOR', 'PRODUCT'],
    default: 'ORDER'
  },
  entityId: {
    type: mongoose.Schema.Types.ObjectId,
    default: null
  },
  ruleId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'FraudRule',
    default: null
  },
  orderId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Order',
    default: null
  },
  level: {
    type: String,
    enum: ['LOW', 'MEDIUM', 'HIGH'],
    default: 'MEDIUM'
  },
  severity: {
    type: String,
    enum: ['LOW', 'MEDIUM', 'HIGH'],
    default: 'MEDIUM'
  },
  reason: {
    type: String,
    required: true,
    trim: true,
    maxlength: 1000
  },
  status: {
    type: String,
    enum: ['OPEN', 'RESOLVED', 'DISMISSED'],
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
  },
  resolutionNote: {
    type: String,
    default: ''
  }
}, { timestamps: { createdAt: true, updatedAt: true } });

fraudFlagSchema.index({ orderId: 1, status: 1 });
fraudFlagSchema.index({ status: 1, createdAt: -1 });
fraudFlagSchema.index({ entityType: 1, status: 1, createdAt: -1 });
fraudFlagSchema.index({ entityId: 1, createdAt: -1 });

fraudFlagSchema.pre('validate', function(next) {
  if (!this.entityId && this.orderId) {
    this.entityType = 'ORDER';
    this.entityId = this.orderId;
  }
  if (!this.orderId && this.entityType === 'ORDER' && this.entityId) {
    this.orderId = this.entityId;
  }
  if (!this.severity && this.level) this.severity = this.level;
  if (!this.level && this.severity) this.level = this.severity;
  next();
});

module.exports = mongoose.model('FraudFlag', fraudFlagSchema);

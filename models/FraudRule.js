const mongoose = require('mongoose');

const fraudRuleSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 120
    },
    description: {
      type: String,
      default: '',
      maxlength: 2000
    },
    isActive: {
      type: Boolean,
      default: true
    },
    conditions: {
      type: mongoose.Schema.Types.Mixed,
      default: {}
    },
    action: {
      type: String,
      enum: ['FLAG', 'HOLD', 'NOTIFY_ADMIN'],
      default: 'FLAG'
    },
    severity: {
      type: String,
      enum: ['LOW', 'MEDIUM', 'HIGH'],
      default: 'MEDIUM'
    }
  },
  {
    timestamps: true
  }
);

fraudRuleSchema.index({ isActive: 1, createdAt: -1 });
fraudRuleSchema.index({ name: 1 }, { unique: true });

module.exports = mongoose.model('FraudRule', fraudRuleSchema);


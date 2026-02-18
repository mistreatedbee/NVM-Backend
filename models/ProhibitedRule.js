const mongoose = require('mongoose');

const prohibitedRuleSchema = new mongoose.Schema({
  keyword: {
    type: String,
    trim: true,
    default: ''
  },
  phrase: {
    type: String,
    trim: true,
    default: ''
  },
  categoryId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Category',
    default: null
  },
  attribute: {
    key: { type: String, trim: true, default: '' },
    value: { type: String, trim: true, default: '' }
  },
  severity: {
    type: String,
    enum: ['LOW', 'MEDIUM', 'HIGH'],
    default: 'MEDIUM'
  },
  action: {
    type: String,
    enum: ['FLAG', 'AUTO_REJECT'],
    default: 'FLAG'
  },
  isActive: {
    type: Boolean,
    default: true
  }
}, { timestamps: true });

prohibitedRuleSchema.index({ keyword: 1, isActive: 1 });
prohibitedRuleSchema.index({ categoryId: 1, isActive: 1 });
prohibitedRuleSchema.index({ isActive: 1, severity: 1 });

module.exports = mongoose.model('ProhibitedRule', prohibitedRuleSchema);

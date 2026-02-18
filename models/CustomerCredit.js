const mongoose = require('mongoose');

const customerCreditSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    amount: {
      type: Number,
      required: true,
      min: 0
    },
    reference: {
      type: String,
      required: true
    },
    description: {
      type: String,
      required: true
    },
    source: {
      type: String,
      default: 'REFERRAL'
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {}
    }
  },
  { timestamps: true }
);

customerCreditSchema.index({ userId: 1, createdAt: -1 });

module.exports = mongoose.model('CustomerCredit', customerCreditSchema);

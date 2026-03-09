const mongoose = require('mongoose');

const emailLogSchema = new mongoose.Schema({
  to: {
    type: String,
    required: true
  },
  provider: {
    type: String,
    required: true
  },
  templateName: String,
  subject: String,
  status: {
    type: String,
    enum: ['sent', 'failed'],
    required: true
  },
  response: mongoose.Schema.Types.Mixed,
  error: String,
  metadata: mongoose.Schema.Types.Mixed
}, {
  timestamps: true
});

emailLogSchema.index({ createdAt: -1 });
emailLogSchema.index({ to: 1, createdAt: -1 });

module.exports = mongoose.model('EmailLog', emailLogSchema);

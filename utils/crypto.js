const crypto = require('crypto');

// Generate random token
exports.generateToken = () => {
  return crypto.randomBytes(32).toString('hex');
};

// Hash token for storage
exports.hashToken = (token) => {
  return crypto.createHash('sha256').update(token).digest('hex');
};

// Generate verification code (6 digits)
exports.generateVerificationCode = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};


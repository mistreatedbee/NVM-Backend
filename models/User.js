const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

const userSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Please provide a name'],
    trim: true,
    maxlength: [50, 'Name cannot be more than 50 characters']
  },
  email: {
    type: String,
    required: [true, 'Please provide an email'],
    unique: true,
    lowercase: true,
    match: [/^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/, 'Please provide a valid email']
  },
  password: {
    type: String,
    required: [true, 'Please provide a password'],
    minlength: [6, 'Password must be at least 6 characters'],
    select: false
  },
  phone: {
    type: String
  },
  avatar: {
    public_id: String,
    url: String
  },
  role: {
    type: String,
    enum: ['customer', 'vendor', 'admin'],
    default: 'customer'
  },
  accountStatus: {
    type: String,
    enum: ['ACTIVE', 'SUSPENDED', 'BANNED'],
    default: 'ACTIVE'
  },
  suspensionReason: {
    type: String,
    default: ''
  },
  banReason: {
    type: String,
    default: ''
  },
  isVerified: {
    type: Boolean,
    default: false
  },
  isBanned: {
    type: Boolean,
    default: false
  },
  isActive: {
    type: Boolean,
    default: true
  },
  lastLogin: {
    type: Date
  },
  verificationToken: String,
  verificationTokenExpire: Date,
  resetPasswordToken: String,
  resetPasswordExpire: Date,
  twoFactorEnabled: {
    type: Boolean,
    default: false
  },
  twoFactorSecretEncrypted: {
    type: String,
    default: ''
  },
  addresses: [{
    fullName: String,
    phone: String,
    street: String,
    city: String,
    state: String,
    country: String,
    zipCode: String,
    isDefault: Boolean
  }]
}, {
  timestamps: true
});

// Indexes for dashboard and admin filtering queries.
userSchema.index({ role: 1, createdAt: -1 });
userSchema.index({ role: 1, isActive: 1, createdAt: -1 });
userSchema.index({ role: 1, accountStatus: 1, createdAt: -1 });

// Encrypt password
userSchema.pre('save', async function(next) {
  if (!this.isModified('accountStatus')) {
    if (this.isBanned) {
      this.accountStatus = 'BANNED';
    } else if (!this.isActive) {
      this.accountStatus = 'SUSPENDED';
    } else {
      this.accountStatus = 'ACTIVE';
    }
  }

  if (this.accountStatus === 'ACTIVE') {
    this.isActive = true;
    this.isBanned = false;
  } else if (this.accountStatus === 'SUSPENDED') {
    this.isActive = false;
    this.isBanned = false;
  } else if (this.accountStatus === 'BANNED') {
    this.isActive = false;
    this.isBanned = true;
  }

  if (!this.isModified('password')) {
    return next();
  }
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
});

// Match password
userSchema.methods.matchPassword = async function(enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

// Generate verification token
userSchema.methods.getVerificationToken = function() {
  const verificationToken = crypto.randomBytes(20).toString('hex');
  this.verificationToken = crypto.createHash('sha256').update(verificationToken).digest('hex');
  this.verificationTokenExpire = Date.now() + 24 * 60 * 60 * 1000; // 24 hours
  return verificationToken;
};

// Generate reset password token
userSchema.methods.getResetPasswordToken = function() {
  const resetToken = crypto.randomBytes(20).toString('hex');
  this.resetPasswordToken = crypto.createHash('sha256').update(resetToken).digest('hex');
  this.resetPasswordExpire = Date.now() + 10 * 60 * 1000; // 10 minutes
  return resetToken;
};

module.exports = mongoose.model('User', userSchema);


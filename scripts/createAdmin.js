require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/User');

const MIN_PASSWORD_LENGTH = 16;

function getEnv(name, fallback = '') {
  const value = process.env[name];
  if (typeof value !== 'string') return fallback;
  return value.trim() || fallback;
}

function assertStrongPassword(password) {
  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new Error(`ADMIN_PASSWORD must be at least ${MIN_PASSWORD_LENGTH} characters`);
  }

  const hasUpper = /[A-Z]/.test(password);
  const hasLower = /[a-z]/.test(password);
  const hasNumber = /\d/.test(password);
  const hasSymbol = /[^A-Za-z0-9]/.test(password);

  if (!hasUpper || !hasLower || !hasNumber || !hasSymbol) {
    throw new Error('ADMIN_PASSWORD must include uppercase, lowercase, number, and symbol characters');
  }
}

const createAdmin = async () => {
  try {
    const mongoUri = getEnv('MONGO_URI', getEnv('MONGODB_URI'));
    const adminEmail = getEnv('ADMIN_EMAIL', 'admin@nvm.com').toLowerCase();
    const adminName = getEnv('ADMIN_NAME', 'NVM Admin');
    const adminPassword = getEnv('ADMIN_PASSWORD');

    if (!mongoUri) {
      throw new Error('Missing MongoDB connection string. Set MONGO_URI or MONGODB_URI.');
    }

    if (!adminPassword) {
      throw new Error('Missing ADMIN_PASSWORD. Provide a strong password via environment variables.');
    }

    assertStrongPassword(adminPassword);

    await mongoose.connect(mongoUri);
    console.log('Connected to MongoDB');

    const existingAdmin = await User.findOne({ email: adminEmail });

    if (existingAdmin) {
      existingAdmin.name = adminName;
      existingAdmin.password = adminPassword;
      existingAdmin.role = 'admin';
      existingAdmin.isVerified = true;
      existingAdmin.isActive = true;
      existingAdmin.isBanned = false;
      await existingAdmin.save();

      console.log('Admin password rotated successfully');
      console.log(`Email: ${adminEmail}`);
      process.exit(0);
    }

    const admin = await User.create({
      name: adminName,
      email: adminEmail,
      password: adminPassword,
      role: 'admin',
      isVerified: true,
      isActive: true,
      isBanned: false
    });

    console.log('Admin user created successfully');
    console.log(`Email: ${admin.email}`);
    console.log(`Login URL: ${getEnv('FRONTEND_URL', 'http://localhost:5173')}/login`);

    process.exit(0);
  } catch (error) {
    console.error('Error creating or rotating admin:', error.message);
    process.exit(1);
  }
};

createAdmin();

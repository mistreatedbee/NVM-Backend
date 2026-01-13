require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/User');

const createAdmin = async () => {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ Connected to MongoDB');

    // Check if admin already exists
    const existingAdmin = await User.findOne({ email: 'admin@nvm.com' });
    
    if (existingAdmin) {
      console.log('⚠️  Admin user already exists!');
      console.log('📧 Email: admin@nvm.com');
      console.log('🔑 Password: admin123');
      process.exit(0);
    }

    // Create admin user
    const admin = await User.create({
      name: 'NVM Admin',
      email: 'admin@nvm.com',
      password: 'admin123',
      role: 'admin',
      isVerified: true
    });

    console.log('✅ Admin user created successfully!');
    console.log('');
    console.log('========================================');
    console.log('  ADMIN CREDENTIALS');
    console.log('========================================');
    console.log('📧 Email:    admin@nvm.com');
    console.log('🔑 Password: admin123');
    console.log('========================================');
    console.log('');
    console.log('🚀 You can now login at: http://localhost:5173/login');
    console.log('');

    process.exit(0);
  } catch (error) {
    console.error('❌ Error creating admin:', error.message);
    process.exit(1);
  }
};

createAdmin();


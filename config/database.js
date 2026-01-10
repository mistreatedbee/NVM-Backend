import mongoose from 'mongoose';

/**
 * MongoDB Connection with Error Handling and Retry Logic
 */
export const connectDB = async () => {
  const maxRetries = 5;
  let retries = 0;

  while (retries < maxRetries) {
    try {
      let mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/mzansi-prolife';
      
      // Ensure database name is set for MongoDB Atlas connections
      if (mongoUri.includes('mongodb+srv://')) {
        // Check if database name is already in the URI
        const hasDbName = mongoUri.match(/mongodb\+srv:\/\/[^/]+\/([^?]+)/);
        
        if (!hasDbName || hasDbName[1] === '') {
          // No database name, add it
          if (mongoUri.includes('?')) {
            mongoUri = mongoUri.replace('?', '/mzansi-prolife?');
          } else {
            mongoUri = mongoUri + '/mzansi-prolife';
          }
        }
      }
      
      const conn = await mongoose.connect(mongoUri, {
        serverSelectionTimeoutMS: 10000,
        socketTimeoutMS: 45000,
      });

      console.log(`✅ MongoDB Connected: ${conn.connection.host}`);
      console.log(`📊 Database: ${conn.connection.name}`);

      // Connection event handlers
      mongoose.connection.on('error', (err) => {
        console.error('❌ MongoDB connection error:', err);
      });

      mongoose.connection.on('disconnected', () => {
        console.warn('⚠️ MongoDB disconnected. Attempting to reconnect...');
      });

      mongoose.connection.on('reconnected', () => {
        console.log('✅ MongoDB reconnected');
      });

      return conn;
    } catch (error) {
      retries++;
      console.error(`❌ MongoDB connection attempt ${retries}/${maxRetries} failed:`, error.message);
      
      if (retries >= maxRetries) {
        console.error('❌ Failed to connect to MongoDB after maximum retries');
        process.exit(1);
      }
      
      // Wait before retrying (exponential backoff)
      await new Promise(resolve => setTimeout(resolve, Math.pow(2, retries) * 1000));
    }
  }
};

/**
 * Graceful shutdown
 */
export const disconnectDB = async () => {
  try {
    await mongoose.connection.close();
    console.log('✅ MongoDB connection closed');
  } catch (error) {
    console.error('❌ Error closing MongoDB connection:', error);
  }
};


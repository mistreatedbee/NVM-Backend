const dotenv = require('dotenv');
const mongoose = require('mongoose');
const http = require('http');
const https = require('https');
const { Server } = require('socket.io');
const app = require('./app');
const { ensureDefaultCategories } = require('./utils/seedDefaultCategories');
const { initSocket } = require('./socket');
const registerChatHandler = require('./socket/chatHandler');
const { startVendorFeatureJobs } = require('./controllers/vendorFeatureController');
const paaq = require('./paaq');
const { trackMongooseConnection } = require('./paaqMongoose');

dotenv.config();

const PORT = process.env.PORT || 5000;
const configuredCorsOrigins = String(process.env.CORS_ORIGINS || '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);
const socketCorsOrigins = [
  'http://localhost:5173',
  'http://localhost:3000',
  process.env.FRONTEND_URL,
  ...configuredCorsOrigins
].filter(Boolean);

trackMongooseConnection();

mongoose.connect(process.env.MONGO_URI, {
  maxPoolSize: 10,
  serverSelectionTimeoutMS: 10000,
  socketTimeoutMS: 45000,
  family: 4,
})
  .then(async () => {
    console.log('MongoDB Connected');
    await paaq.init();
    await ensureDefaultCategories();

    const httpServer = http.createServer(app);

    const io = new Server(httpServer, {
      cors: {
        origin: socketCorsOrigins,
        credentials: true
      }
    });

    initSocket(io);
    registerChatHandler(io);
    startVendorFeatureJobs();

    httpServer.listen(PORT, () => {
      console.log(`VM Marketplace Server running on port ${PORT}`);
      console.log(`API available at http://localhost:${PORT}/api`);

      // Keep Render free tier alive — ping every 14 minutes to prevent cold starts
      if (process.env.NODE_ENV === 'production' && process.env.RENDER_EXTERNAL_URL) {
        const pingUrl = `${process.env.RENDER_EXTERNAL_URL}/api/health`;
        setInterval(() => {
          https.get(pingUrl, (res) => {
            console.log(`[keep-alive] ping ${res.statusCode}`);
          }).on('error', () => {});
        }, 14 * 60 * 1000);
      }
    });
  })
  .catch((err) => {
    console.error('MongoDB Connection Error:', err.message);
    process.exit(1);
  });

process.on('SIGINT', async () => {
  await mongoose.connection.close();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  await mongoose.connection.close();
  process.exit(0);
});

module.exports = app;

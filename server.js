const dotenv = require('dotenv');
const mongoose = require('mongoose');
const http = require('http');
const { Server } = require('socket.io');
const app = require('./app');
const { ensureDefaultCategories } = require('./utils/seedDefaultCategories');
const { initSocket } = require('./socket');
const registerChatHandler = require('./socket/chatHandler');

dotenv.config();

const PORT = process.env.PORT || 5000;

mongoose.connect(process.env.MONGO_URI)
  .then(async () => {
    console.log('MongoDB Connected');
    await ensureDefaultCategories();

    const httpServer = http.createServer(app);

    const io = new Server(httpServer, {
      cors: {
        origin: ['http://localhost:5173', 'http://localhost:3000', process.env.FRONTEND_URL].filter(Boolean),
        credentials: true
      }
    });

    initSocket(io);
    registerChatHandler(io);

    httpServer.listen(PORT, () => {
      console.log(`VM Marketplace Server running on port ${PORT}`);
      console.log(`API available at http://localhost:${PORT}/api`);
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

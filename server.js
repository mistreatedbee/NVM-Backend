const dotenv = require('dotenv');
const mongoose = require('mongoose');
const app = require('./app');
const { ensureDefaultCategories } = require('./utils/seedDefaultCategories');

dotenv.config();

const PORT = process.env.PORT || 5000;

mongoose.connect(process.env.MONGO_URI)
  .then(async () => {
    console.log('MongoDB Connected');
    await ensureDefaultCategories();

    app.listen(PORT, () => {
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

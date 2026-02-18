const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');

dotenv.config();

const app = express();

const allowedOrigins = [
  'http://localhost:5173',
  'http://localhost:3000',
  'https://nvm-frontend.vercel.app',
  process.env.FRONTEND_URL
].filter(Boolean);

app.use(cors({
  origin: function(origin, callback) {
    if (!origin) return callback(null, true);

    if (origin.includes('vercel.app')) {
      return callback(null, true);
    }

    if (origin.includes('localhost')) {
      return callback(null, true);
    }

    if (allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-session-id']
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

const errorHandler = require('./middleware/errorHandler');

const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');
const vendorRoutes = require('./routes/vendors');
const productRoutes = require('./routes/products');
const orderRoutes = require('./routes/orders');
const paymentRoutes = require('./routes/payments');
const categoryRoutes = require('./routes/categories');
const reviewRoutes = require('./routes/reviews');
const chatRoutes = require('./routes/chats');
const adminChatRoutes = require('./routes/adminChats');
const notificationRoutes = require('./routes/notifications');
const searchRoutes = require('./routes/search');
const subscriptionRoutes = require('./routes/subscriptions');
const bulkUploadRoutes = require('./routes/bulkUpload');
const orderManagementRoutes = require('./routes/orderManagement');
const invoiceRoutes = require('./routes/invoices');
const adminInvoiceRoutes = require('./routes/adminInvoices');
const vendorFinanceRoutes = require('./routes/vendorFinance');
const analyticsRoutes = require('./routes/analytics');
const emailRoutes = require('./routes/emails');
const debugRoutes = require('./routes/debug');
const vendorOrdersRoutes = require('./routes/vendorOrders');
const adminOrdersRoutes = require('./routes/adminOrders');
const adminVendorManagementRoutes = require('./routes/adminVendorManagement');
const vendorDocumentsRoutes = require('./routes/vendorDocuments');
const vendorProductsRoutes = require('./routes/vendorProducts');
const vendorFeaturesRoutes = require('./routes/vendorFeatures');
const adminProductsRoutes = require('./routes/adminProducts');
const adminReviewsRoutes = require('./routes/adminReviews');
const adminNotificationsRoutes = require('./routes/adminNotifications');
const knowledgeRoutes = require('./routes/knowledge');
const adminKnowledgeRoutes = require('./routes/adminKnowledge');
const postsRoutes = require('./routes/posts');
const adminPostsRoutes = require('./routes/adminPosts');
const vendorToolkitRoutes = require('./routes/vendorToolkit');
const adminPlaybookRoutes = require('./routes/adminPlaybook');
const trackingRoutes = require('./routes/tracking');
const adminDashboardRoutes = require('./routes/adminDashboard');
const vendorDashboardRoutes = require('./routes/vendorDashboard');
const wishlistRoutes = require('./routes/wishlist');
const wishlistsRoutes = require('./routes/wishlists');
const cartRoutes = require('./routes/cart');
const recentlyViewedRoutes = require('./routes/recentlyViewed');
const recommendationsRoutes = require('./routes/recommendations');
const alertsRoutes = require('./routes/alerts');
const addressesRoutes = require('./routes/addresses');
const checkoutRoutes = require('./routes/checkout');
const productQaRoutes = require('./routes/productQa');
const adminControlRoutes = require('./routes/adminControl');
const helpRoutes = require('./routes/help');
const supportRoutes = require('./routes/support');
const adminHelpRoutes = require('./routes/adminHelp');
const adminSupportRoutes = require('./routes/adminSupport');
const adminReturnsRoutes = require('./routes/adminReturns');
const adminPaymentProofRoutes = require('./routes/adminPaymentProofs');
const disputeRoutes = require('./routes/disputes');

app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/vendors', vendorRoutes);
app.use('/api/products', productRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/reviews', reviewRoutes);
app.use('/api/chats', chatRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/admin/chats', adminChatRoutes);
app.use('/api/admin', adminVendorManagementRoutes);
app.use('/api/admin', adminProductsRoutes);
app.use('/api/admin', adminOrdersRoutes);
app.use('/api/admin', adminInvoiceRoutes);
app.use('/api/admin', adminReviewsRoutes);
app.use('/api/admin', adminNotificationsRoutes);
app.use('/api/admin', adminKnowledgeRoutes);
app.use('/api/admin', adminPostsRoutes);
app.use('/api/admin', adminPlaybookRoutes);
app.use('/api/admin', adminDashboardRoutes);
app.use('/api/admin', adminControlRoutes);
app.use('/api/admin', adminHelpRoutes);
app.use('/api/admin', adminSupportRoutes);
app.use('/api/admin', adminReturnsRoutes);
app.use('/api/admin', adminPaymentProofRoutes);
app.use('/api/vendor', vendorDocumentsRoutes);
app.use('/api/vendor', vendorProductsRoutes);
app.use('/api/vendor', vendorFeaturesRoutes);
app.use('/api/vendor', vendorOrdersRoutes);
app.use('/api/vendor', vendorFinanceRoutes);
app.use('/api/vendor', vendorToolkitRoutes);
app.use('/api/vendor', vendorDashboardRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/search', searchRoutes);
app.use('/api/subscriptions', subscriptionRoutes);
app.use('/api/bulk-upload', bulkUploadRoutes);
app.use('/api/order-management', orderManagementRoutes);
app.use('/api/invoices', invoiceRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/emails', emailRoutes);
app.use('/api/knowledge', knowledgeRoutes);
app.use('/api/help', helpRoutes);
app.use('/api/support', supportRoutes);
app.use('/api/posts', postsRoutes);
app.use('/api/track', trackingRoutes);
app.use('/api/wishlist', wishlistRoutes);
app.use('/api/wishlists', wishlistsRoutes);
app.use('/api/cart', cartRoutes);
app.use('/api/recently-viewed', recentlyViewedRoutes);
app.use('/api/recommendations', recommendationsRoutes);
app.use('/api/alerts', alertsRoutes);
app.use('/api/addresses', addressesRoutes);
app.use('/api/checkout', checkoutRoutes);
app.use('/api/disputes', disputeRoutes);
app.use('/api', productQaRoutes);
app.use('/debug', debugRoutes);

app.get('/api/health', (req, res) => {
  res.json({
    status: 'OK',
    message: 'VM Marketplace API is running',
    timestamp: new Date().toISOString()
  });
});

app.use(errorHandler);

app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: 'Route not found'
  });
});

module.exports = app;

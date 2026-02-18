const express = require('express');
const multer = require('multer');
const { authenticate, isVendor, isAdmin } = require('../middleware/auth');
const { requireActiveVendorAccount } = require('../middleware/requireActiveVendorAccount');
const controller = require('../controllers/vendorFeatureController');

const router = express.Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 }
});

router.get('/public/stores/:storeSlug', controller.getPublicStoreBySlug);

router.use(authenticate, isVendor);

router.get('/store', controller.getVendorStore);
router.put('/store', controller.updateVendorStore);
router.post('/store/upload-logo', upload.single('logo'), controller.uploadStoreLogo);
router.post('/store/upload-cover', upload.single('cover'), controller.uploadStoreCover);

router.post('/products', controller.createVendorProduct);
router.put('/products/:id', controller.updateVendorProduct);
router.post('/products/:id/submit', controller.submitVendorProduct);
router.patch('/products/:id/unpublish', controller.unpublishVendorProduct);
router.patch('/products/:id/republish', controller.republishVendorProduct);
router.patch('/products/:id/schedule', controller.scheduleVendorProduct);
router.post('/products/bulk-upload', upload.single('file'), controller.bulkUploadVendorProducts);
router.get('/products/:id/barcode', controller.getVendorProductBarcode);

router.get('/inventory/alerts', controller.listStockAlertSubscriptions);
router.post('/inventory/alerts', controller.createStockAlertSubscription);
router.post('/inventory/reservations', controller.createStockReservation);
router.patch('/inventory/reservations/:reservationId/consume', controller.consumeStockReservation);

router.patch('/orders/:orderId/items/:productId/cancel', requireActiveVendorAccount, controller.cancelVendorOrderItem);
router.get('/orders/:orderId/packing-slip.pdf', requireActiveVendorAccount, controller.getVendorPackingSlipPdf);
router.get('/orders/:orderId/shipping-label.pdf', requireActiveVendorAccount, controller.getVendorShippingLabelPdf);

router.get('/analytics/summary', controller.getVendorAnalyticsSummary);
router.get('/analytics/traffic', controller.getVendorAnalyticsTraffic);

router.get('/marketing', controller.getVendorMarketing);
router.post('/marketing/coupons', controller.createVendorCoupon);
router.put('/marketing/coupons/:id', controller.updateVendorCoupon);
router.post('/marketing/bundles', controller.createProductBundle);
router.post('/marketing/flash-sales', controller.createFlashSale);
router.post('/marketing/promoted-listings', controller.createPromotedListing);
router.post('/marketing/coupons/validate', controller.validateVendorCouponForCheckout);

router.get('/wallet/summary', controller.getVendorWalletSummary);
router.get('/wallet/transactions', controller.getVendorWalletTransactions);
router.post('/wallet/withdraw', controller.requestVendorWithdraw);
router.get('/wallet/payout-requests', controller.getVendorPayoutRequests);

router.get('/reviews', controller.getVendorReviews);
router.get('/reviews/summary', controller.getVendorReviewSummary);
router.post('/reviews/:reviewId/reply', controller.replyToVendorReview);
router.delete('/reviews/:reviewId/reply', controller.deleteVendorReviewReply);
router.post('/reviews/:reviewId/report', controller.reportVendorReview);

router.patch('/admin/payouts/:id/approve', authenticate, isAdmin, controller.adminApprovePayout);
router.patch('/admin/payouts/:id/mark-paid', authenticate, isAdmin, controller.adminMarkPayoutPaid);

module.exports = router;

const express = require('express');
const { authenticate, isAdmin } = require('../middleware/auth');
const controller = require('../controllers/adminSuiteController');

const router = express.Router();

router.use(authenticate, isAdmin);

router.get('/categories', controller.getAdminCategories);
router.post('/categories', controller.createAdminCategory);
router.put('/categories/:id', controller.updateAdminCategory);
router.patch('/categories/:id/feature', controller.featureAdminCategory);
router.patch('/categories/reorder', controller.reorderAdminCategories);
router.patch('/categories/:id/deactivate', controller.deactivateAdminCategory);
router.delete('/categories/:id', controller.deleteAdminCategory);

router.get('/vendors', controller.getAdminVendors);
router.get('/vendors/:vendorId', controller.getAdminVendorById);
router.patch('/vendors/:vendorId/approve', controller.approveAdminVendor);
router.patch('/vendors/:vendorId/reject', controller.rejectAdminVendor);
router.patch('/vendors/:vendorId/suspend', controller.suspendAdminVendor);
router.patch('/vendors/:vendorId/unsuspend', controller.unsuspendAdminVendor);
router.patch('/vendors/:vendorId/verify', controller.verifyAdminVendor);
router.patch('/vendors/:vendorId/unverify', controller.unverifyAdminVendor);
router.get('/vendors/:vendorId/documents', controller.getAdminVendorDocuments);
router.patch('/vendors/:vendorId/documents/:docId/approve', controller.approveAdminVendorDocument);
router.patch('/vendors/:vendorId/documents/:docId/reject', controller.rejectAdminVendorDocument);

router.get('/products', controller.getAdminProducts);
router.get('/products/:productId', controller.getAdminProductById);
router.patch('/products/:productId/approve', controller.approveAdminProduct);
router.patch('/products/:productId/reject', controller.rejectAdminProduct);
router.patch('/products/:productId/flag', controller.flagAdminProduct);
router.patch('/products/:productId/unpublish', controller.unpublishAdminProduct);
router.patch('/products/:productId/republish', controller.republishAdminProduct);
router.get('/products/:productId/history', controller.getAdminProductHistory);

router.get('/prohibited-rules', controller.getProhibitedRules);
router.post('/prohibited-rules', controller.createProhibitedRule);
router.put('/prohibited-rules/:id', controller.updateProhibitedRule);
router.patch('/prohibited-rules/:id', controller.updateProhibitedRule);
router.delete('/prohibited-rules/:id', controller.deleteProhibitedRule);

router.get('/orders', controller.getAdminOrders);
router.get('/orders/:orderId', controller.getAdminOrderById);
router.patch('/orders/:orderId/cancel', controller.cancelAdminOrder);
router.patch('/orders/:orderId/chargeback', controller.markOrderChargeback);

router.get('/refunds', controller.getAdminRefunds);
router.patch('/refunds/:id/approve', controller.approveAdminRefund);
router.patch('/refunds/:id/reject', controller.rejectAdminRefund);
router.patch('/refunds/:id/mark-refunded', controller.markAdminRefunded);

router.get('/disputes', controller.getAdminDisputes);
router.get('/disputes/:id', controller.getAdminDisputeById);
router.post('/disputes/:id/message', controller.addAdminDisputeMessage);
router.patch('/disputes/:id/status', controller.updateAdminDisputeStatus);

router.post('/orders/:orderId/fraud-flag', controller.createAdminFraudFlag);
router.patch('/fraud/:id/resolve', controller.resolveAdminFraudFlag);

router.get('/users', controller.getAdminUsers);
router.get('/users/:userId', controller.getAdminUserById);
router.patch('/users/:userId/role', controller.updateAdminUserRole);
router.patch('/users/:userId/suspend', controller.suspendAdminUser);
router.patch('/users/:userId/unsuspend', controller.unsuspendAdminUser);
router.patch('/users/:userId/ban', controller.banAdminUser);
router.patch('/users/:userId/unban', controller.unbanAdminUser);
router.patch('/users/:userId/edit', controller.editAdminUser);

router.get('/reports', controller.getAdminReports);
router.patch('/reports/:reportId/status', controller.updateAdminReportStatus);

router.get('/activity', controller.getAdminActivity);
router.get('/audit-logs', controller.getAdminAuditLogs);

router.get('/cms-pages', controller.getCMSPages);
router.post('/cms-pages', controller.createCMSPage);
router.put('/cms-pages/:id', controller.updateCMSPage);
router.delete('/cms-pages/:id', controller.deleteCMSPage);
router.patch('/cms-pages/:id/publish', controller.publishCMSPage);
router.patch('/cms-pages/:id/unpublish', controller.unpublishCMSPage);

router.get('/banners', controller.getBanners);
router.post('/banners', controller.createBanner);
router.put('/banners/:id', controller.updateBanner);
router.delete('/banners/:id', controller.deleteBanner);

router.get('/homepage-sections', controller.getHomepageSections);
router.post('/homepage-sections', controller.createHomepageSection);
router.put('/homepage-sections/:id', controller.updateHomepageSection);
router.delete('/homepage-sections/:id', controller.deleteHomepageSection);
router.patch('/homepage-sections/reorder', controller.reorderHomepageSections);

router.get('/analytics/overview', controller.getAdminAnalyticsOverview);

module.exports = router;

const express = require('express');
const { body, param, query } = require('express-validator');
const { authenticate, isAdmin } = require('../middleware/auth');
const { validate } = require('../middleware/validator');
const {
  getAdminActivity,
  getAdminUsersList,
  getAdminUserActivity,
  getVendorsCompliance,
  createComplianceFlag,
  resolveComplianceFlag,
  getAdminAuditLogs
} = require('../controllers/adminControlController');

const router = express.Router();

router.use(authenticate, isAdmin);

router.get(
  '/activity',
  query('page').optional().isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: 100 }),
  validate,
  getAdminActivity
);

router.get('/users', validate, getAdminUsersList);
router.get('/users/:userId/activity', param('userId').isMongoId().withMessage('Invalid userId'), validate, getAdminUserActivity);

router.get(
  '/vendors/compliance',
  query('vendorStatus').optional().isIn(['PENDING', 'ACTIVE', 'SUSPENDED', 'REJECTED']).withMessage('Invalid vendorStatus'),
  query('flagStatus').optional().isIn(['OPEN', 'RESOLVED']).withMessage('Invalid flagStatus'),
  query('severity').optional().isIn(['LOW', 'MEDIUM', 'HIGH']).withMessage('Invalid severity'),
  validate,
  getVendorsCompliance
);
router.post(
  '/vendors/:vendorId/compliance/flag',
  param('vendorId').isMongoId().withMessage('Invalid vendorId'),
  body('type').isIn(['KYC_MISSING', 'DOC_EXPIRED', 'PROHIBITED_ITEM', 'TOO_MANY_REPORTS', 'PAYMENT_RISK', 'OTHER']).withMessage('Invalid type'),
  body('severity').isIn(['LOW', 'MEDIUM', 'HIGH']).withMessage('Invalid severity'),
  body('note').optional().isString().isLength({ max: 1000 }),
  validate,
  createComplianceFlag
);

router.patch(
  '/compliance/:flagId/resolve',
  param('flagId').isMongoId().withMessage('Invalid flagId'),
  body('note').optional().isString().isLength({ max: 1000 }),
  validate,
  resolveComplianceFlag
);

router.get(
  '/audit-logs',
  query('targetType').optional().isIn(['USER', 'VENDOR', 'PRODUCT', 'REVIEW', 'ORDER', 'DOCUMENT', 'SYSTEM']).withMessage('Invalid targetType'),
  query('targetId').optional().isMongoId().withMessage('Invalid targetId'),
  query('vendorId').optional().isMongoId().withMessage('Invalid vendorId'),
  query('actorAdminId').optional().isMongoId().withMessage('Invalid actorAdminId'),
  validate,
  getAdminAuditLogs
);

module.exports = router;

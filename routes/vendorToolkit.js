const express = require('express');
const { body, param, query } = require('express-validator');
const { authenticate, isVendor } = require('../middleware/auth');
const { validate } = require('../middleware/validator');
const {
  getVendorInsightsSummary,
  getVendorProductInsights,
  getVendorProductInsightDetail,
  getVendorPlaybookModules,
  getVendorPlaybookModuleBySlug,
  getVendorPlaybookLessonBySlug,
  updateVendorPlaybookProgress
} = require('../controllers/vendorToolkitController');

const router = express.Router();

router.use(authenticate, isVendor);

router.get(
  '/insights/summary',
  query('range').optional().isIn(['7d', '30d', '90d', 'custom']).withMessage('Invalid range'),
  query('from').optional().isISO8601().withMessage('from must be a valid date'),
  query('to').optional().isISO8601().withMessage('to must be a valid date'),
  validate,
  getVendorInsightsSummary
);

router.get(
  '/insights/products',
  query('range').optional().isIn(['7d', '30d', '90d', 'custom']).withMessage('Invalid range'),
  query('from').optional().isISO8601().withMessage('from must be a valid date'),
  query('to').optional().isISO8601().withMessage('to must be a valid date'),
  query('sort').optional().isIn(['mostViewed', 'bestSelling', 'highestRevenue', 'bestConversion', 'lowestConversion']).withMessage('Invalid sort'),
  validate,
  getVendorProductInsights
);

router.get(
  '/insights/products/:productId',
  param('productId').isMongoId().withMessage('Invalid productId'),
  query('range').optional().isIn(['7d', '30d', '90d', 'custom']).withMessage('Invalid range'),
  query('from').optional().isISO8601().withMessage('from must be a valid date'),
  query('to').optional().isISO8601().withMessage('to must be a valid date'),
  validate,
  getVendorProductInsightDetail
);

router.get('/playbook/modules', getVendorPlaybookModules);
router.get(
  '/playbook/modules/:slug',
  param('slug').trim().matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).withMessage('Invalid slug'),
  validate,
  getVendorPlaybookModuleBySlug
);
router.get(
  '/playbook/lessons/:slug',
  param('slug').trim().matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).withMessage('Invalid slug'),
  validate,
  getVendorPlaybookLessonBySlug
);
router.post(
  '/playbook/progress',
  body('lessonId').isMongoId().withMessage('lessonId is required'),
  body('completed').optional().isBoolean().withMessage('completed must be true/false'),
  body('checklistUpdates').optional().isObject().withMessage('checklistUpdates must be an object'),
  validate,
  updateVendorPlaybookProgress
);

module.exports = router;

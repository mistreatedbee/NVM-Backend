const express = require('express');
const { query, param, body } = require('express-validator');
const { optionalAuthenticate } = require('../middleware/auth');
const { validate, paginationValidation } = require('../middleware/validator');
const {
  getFaqs,
  getGuides,
  getGuideBySlug,
  getVideos,
  getVideoBySlug,
  getGuideProgress,
  updateGuideProgress
} = require('../controllers/helpSupportController');

const router = express.Router();

const categoryValidation = query('category')
  .optional()
  .isIn(['GENERAL', 'ORDERS', 'PAYMENTS', 'VENDORS', 'PRODUCTS', 'ACCOUNT', 'SECURITY', 'OTHER'])
  .withMessage('Invalid category');

router.get(
  '/faqs',
  optionalAuthenticate,
  paginationValidation,
  categoryValidation,
  query('audience').optional().isIn(['ALL', 'VENDOR', 'CUSTOMER']).withMessage('Invalid audience'),
  query('q').optional().isString().trim().isLength({ max: 120 }).withMessage('q cannot exceed 120 characters'),
  validate,
  getFaqs
);

router.get(
  '/guides',
  optionalAuthenticate,
  paginationValidation,
  query('audience').optional().isIn(['ALL', 'VENDOR']).withMessage('Invalid audience'),
  query('q').optional().isString().trim().isLength({ max: 120 }).withMessage('q cannot exceed 120 characters'),
  validate,
  getGuides
);

router.get(
  '/guides/:slug',
  optionalAuthenticate,
  param('slug').trim().matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).withMessage('Invalid slug'),
  validate,
  getGuideBySlug
);

router.get(
  '/videos',
  optionalAuthenticate,
  paginationValidation,
  categoryValidation,
  query('audience').optional().isIn(['ALL', 'VENDOR', 'CUSTOMER']).withMessage('Invalid audience'),
  query('q').optional().isString().trim().isLength({ max: 120 }).withMessage('q cannot exceed 120 characters'),
  validate,
  getVideos
);

router.get(
  '/videos/:slug',
  optionalAuthenticate,
  param('slug').trim().matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).withMessage('Invalid slug'),
  validate,
  getVideoBySlug
);

router.get(
  '/guides/:slug/progress',
  optionalAuthenticate,
  param('slug').trim().matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).withMessage('Invalid slug'),
  validate,
  (req, res, next) => {
    if (!req.user || req.user.role !== 'vendor') {
      return res.status(403).json({ success: false, message: 'Vendor access required' });
    }
    return getGuideProgress(req, res, next);
  }
);

router.put(
  '/guides/:slug/progress',
  optionalAuthenticate,
  param('slug').trim().matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).withMessage('Invalid slug'),
  body('completedSteps').optional().isArray().withMessage('completedSteps must be an array'),
  validate,
  (req, res, next) => {
    if (!req.user || req.user.role !== 'vendor') {
      return res.status(403).json({ success: false, message: 'Vendor access required' });
    }
    return updateGuideProgress(req, res, next);
  }
);

module.exports = router;

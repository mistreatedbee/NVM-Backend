const express = require('express');
const rateLimit = require('express-rate-limit');
const { body, param, query } = require('express-validator');
const { optionalAuthenticate } = require('../middleware/auth');
const { validate, paginationValidation } = require('../middleware/validator');
const {
  getKnowledgeArticles,
  getKnowledgeArticleBySlug,
  getKnowledgeResources,
  getKnowledgeResourceBySlug,
  trackContentView
} = require('../controllers/knowledgeController');

const router = express.Router();

const viewTrackingLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many tracking requests. Please try again shortly.'
  }
});

const categoryValidation = query('category')
  .optional()
  .isIn(['GETTING_STARTED', 'PRODUCTS', 'ORDERS', 'PAYMENTS', 'MARKETING', 'POLICIES', 'BEST_PRACTICES', 'OTHER'])
  .withMessage('Invalid category');

router.get(
  '/articles',
  optionalAuthenticate,
  paginationValidation,
  categoryValidation,
  query('featured').optional().isBoolean().withMessage('featured must be true/false'),
  query('q').optional().isString().trim().isLength({ max: 120 }).withMessage('q cannot exceed 120 characters'),
  validate,
  getKnowledgeArticles
);

router.get(
  '/articles/:slug',
  optionalAuthenticate,
  param('slug').trim().matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).withMessage('Invalid slug'),
  validate,
  getKnowledgeArticleBySlug
);

router.get(
  '/resources',
  optionalAuthenticate,
  paginationValidation,
  categoryValidation,
  query('type').optional().isIn(['PDF', 'VIDEO', 'LINK', 'FILE']).withMessage('Invalid resource type'),
  query('featured').optional().isBoolean().withMessage('featured must be true/false'),
  query('q').optional().isString().trim().isLength({ max: 120 }).withMessage('q cannot exceed 120 characters'),
  validate,
  getKnowledgeResources
);

router.get(
  '/resources/:slug',
  optionalAuthenticate,
  param('slug').trim().matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).withMessage('Invalid slug'),
  validate,
  getKnowledgeResourceBySlug
);

router.post(
  '/track-view',
  optionalAuthenticate,
  viewTrackingLimiter,
  body('contentType').isIn(['ARTICLE', 'RESOURCE']).withMessage('contentType must be ARTICLE or RESOURCE'),
  body('contentId').isMongoId().withMessage('contentId must be a valid ID'),
  body('sessionId').optional().isString().isLength({ max: 150 }).withMessage('sessionId cannot exceed 150 characters'),
  validate,
  trackContentView
);

module.exports = router;

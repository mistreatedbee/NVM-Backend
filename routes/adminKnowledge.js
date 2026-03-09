const express = require('express');
const { body, param, query } = require('express-validator');
const { authenticate, isAdmin } = require('../middleware/auth');
const { validate, paginationValidation } = require('../middleware/validator');
const uploadKnowledgeResource = require('../middleware/uploadKnowledgeResource');
const {
  createKnowledgeArticle,
  updateKnowledgeArticle,
  publishKnowledgeArticle,
  unpublishKnowledgeArticle,
  deleteKnowledgeArticle,
  listAdminKnowledgeArticles,
  createKnowledgeResource,
  updateKnowledgeResource,
  publishKnowledgeResource,
  unpublishKnowledgeResource,
  deleteKnowledgeResource,
  listAdminKnowledgeResources,
  uploadKnowledgeResourceFile,
  getKnowledgeAnalytics
} = require('../controllers/knowledgeController');

const router = express.Router();

router.use(authenticate, isAdmin);

const categoryValidation = query('category')
  .optional()
  .isIn(['GETTING_STARTED', 'PRODUCTS', 'ORDERS', 'PAYMENTS', 'MARKETING', 'POLICIES', 'BEST_PRACTICES', 'OTHER'])
  .withMessage('Invalid category');

const articleCreateUpdateValidation = [
  body('title').optional().trim().isLength({ min: 3, max: 200 }).withMessage('title must be between 3 and 200 characters'),
  body('slug').optional().trim().matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).withMessage('slug must be URL-safe'),
  body('summary').optional().isString().isLength({ max: 600 }).withMessage('summary cannot exceed 600 characters'),
  body('content').optional().isString().isLength({ min: 1 }).withMessage('content is required'),
  body('category').optional().isIn(['GETTING_STARTED', 'PRODUCTS', 'ORDERS', 'PAYMENTS', 'MARKETING', 'POLICIES', 'BEST_PRACTICES', 'OTHER']).withMessage('Invalid category'),
  body('audience').optional().isIn(['VENDOR', 'CUSTOMER', 'ALL']).withMessage('Invalid audience'),
  body('status').optional().isIn(['DRAFT', 'PUBLISHED', 'ARCHIVED']).withMessage('Invalid status'),
  body('featured').optional().isBoolean().withMessage('featured must be true/false'),
  body('coverImageUrl').optional().isURL().withMessage('coverImageUrl must be a valid URL')
];

const resourceCreateUpdateValidation = [
  body('title').optional().trim().isLength({ min: 3, max: 200 }).withMessage('title must be between 3 and 200 characters'),
  body('slug').optional().trim().matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).withMessage('slug must be URL-safe'),
  body('description').optional().isString().isLength({ max: 1000 }).withMessage('description cannot exceed 1000 characters'),
  body('type').optional().isIn(['PDF', 'VIDEO', 'LINK', 'FILE']).withMessage('Invalid type'),
  body('category').optional().isIn(['GETTING_STARTED', 'PRODUCTS', 'ORDERS', 'PAYMENTS', 'MARKETING', 'POLICIES', 'BEST_PRACTICES', 'OTHER']).withMessage('Invalid category'),
  body('audience').optional().isIn(['VENDOR', 'CUSTOMER', 'ALL']).withMessage('Invalid audience'),
  body('status').optional().isIn(['DRAFT', 'PUBLISHED', 'ARCHIVED']).withMessage('Invalid status'),
  body('featured').optional().isBoolean().withMessage('featured must be true/false'),
  body('fileUrl').optional().isURL().withMessage('fileUrl must be a valid URL'),
  body('externalUrl').optional().isURL().withMessage('externalUrl must be a valid URL'),
  body('thumbnailUrl').optional().isURL().withMessage('thumbnailUrl must be a valid URL')
];

router.get('/knowledge/articles', paginationValidation, categoryValidation, validate, listAdminKnowledgeArticles);
router.post(
  '/knowledge/articles',
  body('title').trim().notEmpty().withMessage('title is required'),
  body('content').trim().notEmpty().withMessage('content is required'),
  ...articleCreateUpdateValidation,
  validate,
  createKnowledgeArticle
);
router.put(
  '/knowledge/articles/:id',
  param('id').isMongoId().withMessage('Invalid article id'),
  ...articleCreateUpdateValidation,
  validate,
  updateKnowledgeArticle
);
router.patch(
  '/knowledge/articles/:id/publish',
  param('id').isMongoId().withMessage('Invalid article id'),
  validate,
  publishKnowledgeArticle
);
router.patch(
  '/knowledge/articles/:id/unpublish',
  param('id').isMongoId().withMessage('Invalid article id'),
  body('status').optional().isIn(['DRAFT', 'ARCHIVED']).withMessage('status must be DRAFT or ARCHIVED'),
  validate,
  unpublishKnowledgeArticle
);
router.delete(
  '/knowledge/articles/:id',
  param('id').isMongoId().withMessage('Invalid article id'),
  validate,
  deleteKnowledgeArticle
);

router.get('/knowledge/resources', paginationValidation, categoryValidation, validate, listAdminKnowledgeResources);
router.post(
  '/knowledge/resources',
  body('title').trim().notEmpty().withMessage('title is required'),
  body('type').isIn(['PDF', 'VIDEO', 'LINK', 'FILE']).withMessage('type is required'),
  ...resourceCreateUpdateValidation,
  validate,
  createKnowledgeResource
);
router.put(
  '/knowledge/resources/:id',
  param('id').isMongoId().withMessage('Invalid resource id'),
  ...resourceCreateUpdateValidation,
  validate,
  updateKnowledgeResource
);
router.patch(
  '/knowledge/resources/:id/publish',
  param('id').isMongoId().withMessage('Invalid resource id'),
  validate,
  publishKnowledgeResource
);
router.patch(
  '/knowledge/resources/:id/unpublish',
  param('id').isMongoId().withMessage('Invalid resource id'),
  body('status').optional().isIn(['DRAFT', 'ARCHIVED']).withMessage('status must be DRAFT or ARCHIVED'),
  validate,
  unpublishKnowledgeResource
);
router.delete(
  '/knowledge/resources/:id',
  param('id').isMongoId().withMessage('Invalid resource id'),
  validate,
  deleteKnowledgeResource
);

router.post('/knowledge/resources/upload', uploadKnowledgeResource.single('file'), uploadKnowledgeResourceFile);
router.get(
  '/knowledge/analytics',
  query('contentType').optional().isIn(['ARTICLE', 'RESOURCE']).withMessage('Invalid contentType'),
  query('contentId').optional().isMongoId().withMessage('Invalid contentId'),
  query('dateFrom').optional().isISO8601().withMessage('dateFrom must be ISO8601 date'),
  query('dateTo').optional().isISO8601().withMessage('dateTo must be ISO8601 date'),
  validate,
  getKnowledgeAnalytics
);

module.exports = router;

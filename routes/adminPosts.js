const express = require('express');
const { body, param, query } = require('express-validator');
const { authenticate, isAdmin } = require('../middleware/auth');
const { validate, paginationValidation } = require('../middleware/validator');
const {
  listAdminPosts,
  createAdminPost,
  updateAdminPost,
  publishAdminPost,
  unpublishAdminPost,
  deleteAdminPost,
  getAdminPostsAnalytics,
  getSinglePostAnalytics
} = require('../controllers/postController');

const router = express.Router();

router.use(authenticate, isAdmin);

const commonValidation = [
  body('title').optional().trim().isLength({ min: 3, max: 220 }).withMessage('title must be between 3 and 220 characters'),
  body('slug').optional().trim().matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).withMessage('slug must be URL-safe'),
  body('excerpt').optional().isString().isLength({ max: 700 }).withMessage('excerpt cannot exceed 700 chars'),
  body('content').optional().isString().isLength({ min: 1 }).withMessage('content is required'),
  body('type').optional().isIn(['ANNOUNCEMENT', 'BLOG']).withMessage('Invalid type'),
  body('status').optional().isIn(['DRAFT', 'PUBLISHED', 'ARCHIVED']).withMessage('Invalid status'),
  body('featured').optional().isBoolean().withMessage('featured must be true/false'),
  body('coverImageUrl').optional().isURL().withMessage('coverImageUrl must be a valid URL'),
  body('audience').optional().isIn(['ALL', 'VENDOR', 'CUSTOMER']).withMessage('Invalid audience'),
  body('meta').optional().isObject().withMessage('meta must be an object'),
  body('meta.metaTitle').optional().isString().isLength({ max: 220 }).withMessage('metaTitle too long'),
  body('meta.metaDescription').optional().isString().isLength({ max: 320 }).withMessage('metaDescription too long'),
  body('meta.ogImageUrl').optional().isURL().withMessage('ogImageUrl must be valid URL')
];

router.get(
  '/posts',
  paginationValidation,
  query('type').optional().isIn(['ANNOUNCEMENT', 'BLOG']).withMessage('Invalid type'),
  query('status').optional().isIn(['DRAFT', 'PUBLISHED', 'ARCHIVED']).withMessage('Invalid status'),
  query('audience').optional().isIn(['ALL', 'VENDOR', 'CUSTOMER']).withMessage('Invalid audience'),
  query('featured').optional().isBoolean().withMessage('featured must be true/false'),
  validate,
  listAdminPosts
);

router.post(
  '/posts',
  body('title').trim().notEmpty().withMessage('title is required'),
  body('content').trim().notEmpty().withMessage('content is required'),
  body('type').isIn(['ANNOUNCEMENT', 'BLOG']).withMessage('type is required'),
  ...commonValidation,
  validate,
  createAdminPost
);

router.put(
  '/posts/:id',
  param('id').isMongoId().withMessage('Invalid post id'),
  ...commonValidation,
  validate,
  updateAdminPost
);

router.patch('/posts/:id/publish', param('id').isMongoId().withMessage('Invalid post id'), validate, publishAdminPost);
router.patch(
  '/posts/:id/unpublish',
  param('id').isMongoId().withMessage('Invalid post id'),
  body('status').optional().isIn(['DRAFT', 'ARCHIVED']).withMessage('status must be DRAFT or ARCHIVED'),
  validate,
  unpublishAdminPost
);
router.delete('/posts/:id', param('id').isMongoId().withMessage('Invalid post id'), validate, deleteAdminPost);

router.get(
  '/posts/analytics',
  query('type').optional().isIn(['ANNOUNCEMENT', 'BLOG']).withMessage('Invalid type'),
  query('dateFrom').optional().isISO8601().withMessage('dateFrom must be an ISO date'),
  query('dateTo').optional().isISO8601().withMessage('dateTo must be an ISO date'),
  validate,
  getAdminPostsAnalytics
);
router.get(
  '/posts/:id/analytics',
  param('id').isMongoId().withMessage('Invalid post id'),
  query('dateFrom').optional().isISO8601().withMessage('dateFrom must be an ISO date'),
  query('dateTo').optional().isISO8601().withMessage('dateTo must be an ISO date'),
  validate,
  getSinglePostAnalytics
);

module.exports = router;

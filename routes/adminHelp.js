const express = require('express');
const { body, param, query } = require('express-validator');
const { authenticate, isAdmin } = require('../middleware/auth');
const { validate, paginationValidation } = require('../middleware/validator');
const {
  listAdminFaqs,
  createFaq,
  updateFaq,
  publishFaq,
  unpublishFaq,
  deleteFaq,
  listAdminGuides,
  createGuide,
  updateGuide,
  publishGuide,
  unpublishGuide,
  deleteGuide,
  listAdminVideos,
  createVideo,
  updateVideo,
  publishVideo,
  unpublishVideo,
  deleteVideo
} = require('../controllers/helpSupportController');

const router = express.Router();
router.use(authenticate, isAdmin);

router.get('/help/faqs', paginationValidation, query('q').optional().isString().trim(), validate, listAdminFaqs);
router.post(
  '/help/faqs',
  body('question').trim().isLength({ min: 3, max: 300 }).withMessage('question is required'),
  body('answer').trim().isLength({ min: 3 }).withMessage('answer is required'),
  body('category').optional().isIn(['GENERAL', 'ORDERS', 'PAYMENTS', 'VENDORS', 'PRODUCTS', 'ACCOUNT', 'SECURITY', 'OTHER']).withMessage('Invalid category'),
  body('audience').optional().isIn(['ALL', 'VENDOR', 'CUSTOMER']).withMessage('Invalid audience'),
  body('status').optional().isIn(['DRAFT', 'PUBLISHED', 'ARCHIVED']).withMessage('Invalid status'),
  body('featured').optional().isBoolean().withMessage('featured must be boolean'),
  validate,
  createFaq
);
router.put('/help/faqs/:id', param('id').isMongoId().withMessage('Invalid id'), validate, updateFaq);
router.patch('/help/faqs/:id/publish', param('id').isMongoId().withMessage('Invalid id'), validate, publishFaq);
router.patch(
  '/help/faqs/:id/unpublish',
  param('id').isMongoId().withMessage('Invalid id'),
  body('status').optional().isIn(['DRAFT', 'ARCHIVED']).withMessage('status must be DRAFT or ARCHIVED'),
  validate,
  unpublishFaq
);
router.delete('/help/faqs/:id', param('id').isMongoId().withMessage('Invalid id'), validate, deleteFaq);

router.get('/help/guides', paginationValidation, query('q').optional().isString().trim(), validate, listAdminGuides);
router.post(
  '/help/guides',
  body('title').trim().isLength({ min: 3, max: 220 }).withMessage('title is required'),
  body('description').optional().isString().isLength({ max: 1000 }).withMessage('description too long'),
  body('steps').optional().isArray().withMessage('steps must be array'),
  body('audience').optional().isIn(['VENDOR', 'ALL']).withMessage('Invalid audience'),
  body('status').optional().isIn(['DRAFT', 'PUBLISHED', 'ARCHIVED']).withMessage('Invalid status'),
  validate,
  createGuide
);
router.put('/help/guides/:id', param('id').isMongoId().withMessage('Invalid id'), validate, updateGuide);
router.patch('/help/guides/:id/publish', param('id').isMongoId().withMessage('Invalid id'), validate, publishGuide);
router.patch(
  '/help/guides/:id/unpublish',
  param('id').isMongoId().withMessage('Invalid id'),
  body('status').optional().isIn(['DRAFT', 'ARCHIVED']).withMessage('status must be DRAFT or ARCHIVED'),
  validate,
  unpublishGuide
);
router.delete('/help/guides/:id', param('id').isMongoId().withMessage('Invalid id'), validate, deleteGuide);

router.get('/help/videos', paginationValidation, query('q').optional().isString().trim(), validate, listAdminVideos);
router.post(
  '/help/videos',
  body('title').trim().isLength({ min: 3, max: 220 }).withMessage('title is required'),
  body('videoUrl').trim().isURL().withMessage('videoUrl must be valid URL'),
  body('videoType').optional().isIn(['YOUTUBE', 'VIMEO', 'LINK', 'UPLOAD']).withMessage('Invalid videoType'),
  body('category').optional().isIn(['GENERAL', 'ORDERS', 'PAYMENTS', 'VENDORS', 'PRODUCTS', 'ACCOUNT', 'SECURITY', 'OTHER']).withMessage('Invalid category'),
  body('audience').optional().isIn(['ALL', 'VENDOR', 'CUSTOMER']).withMessage('Invalid audience'),
  body('status').optional().isIn(['DRAFT', 'PUBLISHED', 'ARCHIVED']).withMessage('Invalid status'),
  validate,
  createVideo
);
router.put('/help/videos/:id', param('id').isMongoId().withMessage('Invalid id'), validate, updateVideo);
router.patch('/help/videos/:id/publish', param('id').isMongoId().withMessage('Invalid id'), validate, publishVideo);
router.patch(
  '/help/videos/:id/unpublish',
  param('id').isMongoId().withMessage('Invalid id'),
  body('status').optional().isIn(['DRAFT', 'ARCHIVED']).withMessage('status must be DRAFT or ARCHIVED'),
  validate,
  unpublishVideo
);
router.delete('/help/videos/:id', param('id').isMongoId().withMessage('Invalid id'), validate, deleteVideo);

module.exports = router;

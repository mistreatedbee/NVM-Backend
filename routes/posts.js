const express = require('express');
const rateLimit = require('express-rate-limit');
const { body, param, query } = require('express-validator');
const { optionalAuthenticate } = require('../middleware/auth');
const { validate, paginationValidation } = require('../middleware/validator');
const { getPublicPosts, getPublicPostBySlug, trackPostEvent } = require('../controllers/postController');

const router = express.Router();

const trackLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 45,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many tracking requests. Please try again shortly.'
  }
});

router.get(
  '/',
  optionalAuthenticate,
  paginationValidation,
  query('type').optional().isIn(['ANNOUNCEMENT', 'BLOG']).withMessage('Invalid type'),
  query('featured').optional().isBoolean().withMessage('featured must be true/false'),
  query('audience').optional().isIn(['ALL', 'VENDOR', 'CUSTOMER']).withMessage('Invalid audience'),
  query('q').optional().isString().trim().isLength({ max: 120 }).withMessage('q cannot exceed 120 chars'),
  validate,
  getPublicPosts
);

router.get(
  '/:slug',
  optionalAuthenticate,
  param('slug').trim().matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).withMessage('Invalid slug'),
  validate,
  getPublicPostBySlug
);

router.post(
  '/track',
  optionalAuthenticate,
  trackLimiter,
  body('slug').optional().isString().trim().matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).withMessage('Invalid slug'),
  body('contentId').optional().isMongoId().withMessage('Invalid contentId'),
  body('eventType').optional().isIn(['VIEW', 'CLICK', 'SHARE']).withMessage('Invalid eventType'),
  body('sessionId').optional().isString().isLength({ max: 150 }).withMessage('sessionId cannot exceed 150 chars'),
  body().custom((value) => {
    if (!value.slug && !value.contentId) throw new Error('Either slug or contentId is required');
    return true;
  }),
  validate,
  trackPostEvent
);

module.exports = router;

const express = require('express');
const rateLimit = require('express-rate-limit');
const { body, param, query } = require('express-validator');
const { authenticate, optionalAuthenticate } = require('../middleware/auth');
const { validate, paginationValidation } = require('../middleware/validator');
const uploadSupportAttachment = require('../middleware/uploadSupportAttachment');
const {
  uploadSupportAttachment: uploadSupportAttachmentController,
  createSupportTicket,
  getMySupportTickets,
  getMySupportTicketByNumber,
  createMyTicketMessage
} = require('../controllers/helpSupportController');

const router = express.Router();

const createTicketLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    const ip = req.headers['x-forwarded-for'] || req.ip || 'ip';
    const email = String(req.body?.email || '').trim().toLowerCase();
    return `${ip}|${email || 'no-email'}`;
  },
  message: {
    success: false,
    message: 'Too many support submissions. Please try again later.'
  }
});

const messageLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many follow-up messages. Please wait a moment.'
  }
});

router.post('/attachments/upload', optionalAuthenticate, uploadSupportAttachment.single('file'), uploadSupportAttachmentController);

router.post(
  '/tickets',
  optionalAuthenticate,
  createTicketLimiter,
  body('name').trim().isLength({ min: 2, max: 120 }).withMessage('name must be between 2 and 120 characters'),
  body('email').trim().isEmail().withMessage('Valid email is required'),
  body('phone').optional().trim().isLength({ max: 40 }).withMessage('phone cannot exceed 40 characters'),
  body('subject').trim().isLength({ min: 3, max: 200 }).withMessage('subject must be between 3 and 200 characters'),
  body('message').trim().isLength({ min: 10, max: 5000 }).withMessage('message must be between 10 and 5000 characters'),
  body('category').optional().isIn(['TECHNICAL', 'ACCOUNT', 'ORDERS', 'PAYMENTS', 'VENDOR', 'OTHER']).withMessage('Invalid category'),
  body('attachments').optional().isArray({ max: 5 }).withMessage('attachments must be an array with max 5 items'),
  validate,
  createSupportTicket
);

router.get('/tickets/my', authenticate, paginationValidation, validate, getMySupportTickets);

router.get(
  '/tickets/my/:ticketNumber',
  authenticate,
  param('ticketNumber').trim().matches(/^SUP-\d{4}-\d{6,}$/).withMessage('Invalid ticket number format'),
  validate,
  getMySupportTicketByNumber
);

router.post(
  '/tickets/my/:ticketNumber/message',
  authenticate,
  messageLimiter,
  param('ticketNumber').trim().matches(/^SUP-\d{4}-\d{6,}$/).withMessage('Invalid ticket number format'),
  body('message').trim().isLength({ min: 1, max: 5000 }).withMessage('message is required'),
  body('attachments').optional().isArray({ max: 5 }).withMessage('attachments must be an array with max 5 items'),
  validate,
  createMyTicketMessage
);

module.exports = router;

const express = require('express');
const { body, param, query } = require('express-validator');
const { authenticate, isAdmin } = require('../middleware/auth');
const { validate, paginationValidation } = require('../middleware/validator');
const {
  listAdminSupportTickets,
  getAdminSupportTicketByNumber,
  updateAdminSupportStatus,
  updateAdminSupportPriority,
  replyAdminSupportTicket
} = require('../controllers/helpSupportController');

const router = express.Router();
router.use(authenticate, isAdmin);

router.get(
  '/support/tickets',
  paginationValidation,
  query('status').optional().isIn(['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED']).withMessage('Invalid status'),
  query('category').optional().isIn(['TECHNICAL', 'ACCOUNT', 'ORDERS', 'PAYMENTS', 'VENDOR', 'OTHER']).withMessage('Invalid category'),
  query('priority').optional().isIn(['LOW', 'MEDIUM', 'HIGH']).withMessage('Invalid priority'),
  query('q').optional().isString().trim().isLength({ max: 150 }).withMessage('q too long'),
  validate,
  listAdminSupportTickets
);

router.get(
  '/support/tickets/:ticketNumber',
  param('ticketNumber').trim().matches(/^SUP-\d{4}-\d{6,}$/).withMessage('Invalid ticket number'),
  validate,
  getAdminSupportTicketByNumber
);

router.patch(
  '/support/tickets/:ticketNumber/status',
  param('ticketNumber').trim().matches(/^SUP-\d{4}-\d{6,}$/).withMessage('Invalid ticket number'),
  body('status').isIn(['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED']).withMessage('Invalid status'),
  validate,
  updateAdminSupportStatus
);

router.patch(
  '/support/tickets/:ticketNumber/priority',
  param('ticketNumber').trim().matches(/^SUP-\d{4}-\d{6,}$/).withMessage('Invalid ticket number'),
  body('priority').isIn(['LOW', 'MEDIUM', 'HIGH']).withMessage('Invalid priority'),
  validate,
  updateAdminSupportPriority
);

router.post(
  '/support/tickets/:ticketNumber/reply',
  param('ticketNumber').trim().matches(/^SUP-\d{4}-\d{6,}$/).withMessage('Invalid ticket number'),
  body('message').trim().isLength({ min: 1, max: 5000 }).withMessage('message is required'),
  body('attachments').optional().isArray({ max: 5 }).withMessage('attachments must be array'),
  validate,
  replyAdminSupportTicket
);

module.exports = router;

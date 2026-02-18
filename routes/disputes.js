const express = require('express');
const { authenticate, isAdmin } = require('../middleware/auth');
const uploadSupportAttachment = require('../middleware/uploadSupportAttachment');
const {
  uploadDisputeAttachment,
  createDispute,
  getMyDisputes,
  getDisputeById,
  getDisputeMessages,
  postDisputeMessage,
  getAdminDisputes,
  adminUpdateDispute
} = require('../controllers/disputeController');

const router = express.Router();

router.post('/', authenticate, createDispute);
router.get('/my', authenticate, getMyDisputes);
router.post('/attachments/upload', authenticate, uploadSupportAttachment.single('file'), uploadDisputeAttachment);
router.get('/admin', authenticate, isAdmin, getAdminDisputes);
router.patch('/admin/:id', authenticate, isAdmin, adminUpdateDispute);
router.get('/:id', authenticate, getDisputeById);
router.get('/:id/messages', authenticate, getDisputeMessages);
router.post('/:id/messages', authenticate, postDisputeMessage);

module.exports = router;

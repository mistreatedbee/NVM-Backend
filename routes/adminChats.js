const express = require('express');
const router = express.Router();
const { getAdminEscalatedChats, updateAdminChatStatus, postMessage } = require('../controllers/chatController');
const { authenticate, isAdmin } = require('../middleware/auth');

router.get('/', authenticate, isAdmin, getAdminEscalatedChats);
router.patch('/:id/status', authenticate, isAdmin, updateAdminChatStatus);
router.post('/:id/messages', authenticate, isAdmin, (req, res, next) => {
  req.body = {
    ...req.body,
    conversationId: req.params.id
  };
  return postMessage(req, res, next);
});

module.exports = router;

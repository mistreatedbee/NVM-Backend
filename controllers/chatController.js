const Chat = require('../models/Chat');

// @desc    Get user chats
// @route   GET /api/chats
// @access  Private
exports.getUserChats = async (req, res, next) => {
  try {
    const chats = await Chat.find({
      participants: req.user.id
    })
      .populate('participants', 'name avatar')
      .populate('vendorId', 'storeName logo')
      .sort({ lastMessageAt: -1 });

    res.status(200).json({ success: true, data: chats });
  } catch (error) {
    next(error);
  }
};

// @desc    Get chat by ID
// @route   GET /api/chats/:id
// @access  Private
exports.getChatById = async (req, res, next) => {
  try {
    const chat = await Chat.findById(req.params.id)
      .populate('participants', 'name avatar')
      .populate('vendorId', 'storeName logo');

    if (!chat) {
      return res.status(404).json({ success: false, message: 'Chat not found' });
    }

    // Check if user is participant
    if (!chat.participants.some(p => p._id.toString() === req.user.id)) {
      return res.status(403).json({ success: false, message: 'Not authorized' });
    }

    res.status(200).json({ success: true, data: chat });
  } catch (error) {
    next(error);
  }
};

// @desc    Create or get chat
// @route   POST /api/chats
// @access  Private
exports.createChat = async (req, res, next) => {
  try {
    const { participantId, vendorId } = req.body;

    // Check if chat exists
    let chat = await Chat.findOne({
      participants: { $all: [req.user.id, participantId] },
      vendorId
    });

    if (!chat) {
      chat = await Chat.create({
        participants: [req.user.id, participantId],
        vendorId
      });
    }

    res.status(200).json({ success: true, data: chat });
  } catch (error) {
    next(error);
  }
};


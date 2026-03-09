const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Conversation = require('../models/Conversation');
const Message = require('../models/Message');
const Dispute = require('../models/Dispute');
const Vendor = require('../models/Vendor');

function getTokenFromHandshake(socket) {
  const authHeader = socket.handshake.auth?.token || socket.handshake.headers?.authorization;
  if (!authHeader) return null;

  if (authHeader.startsWith('Bearer ')) {
    return authHeader.slice(7);
  }

  return authHeader;
}

async function resolveSocketUser(socket) {
  const token = getTokenFromHandshake(socket);
  if (!token) {
    throw new Error('Authentication token missing');
  }

  const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key-change-in-production');
  const user = await User.findById(decoded.id).select('_id role name');
  if (!user) {
    throw new Error('User not found');
  }

  return user;
}

async function canAccessConversation(conversation, user) {
  if (user.role === 'admin') return true;
  return conversation.participantIds.some(id => id.toString() === user._id.toString());
}

async function canAccessDispute(dispute, user) {
  if (!dispute || !user) return false;
  if (user.role === 'admin') return true;
  if (user.role === 'customer') return String(dispute.customer) === String(user._id);
  if (user.role === 'vendor') {
    const vendor = await Vendor.findOne({ user: user._id }).select('_id');
    if (!vendor) return false;
    return String(dispute.vendor) === String(vendor._id);
  }
  return false;
}

module.exports = (io) => {
  io.use(async (socket, next) => {
    try {
      const user = await resolveSocketUser(socket);
      socket.user = user;
      socket.join(`user:${user._id.toString()}`);
      socket.join(`role:${String(user.role || '').toLowerCase()}`);
      return next();
    } catch (error) {
      return next(new Error('Unauthorized socket connection'));
    }
  });

  io.on('connection', (socket) => {
    socket.on('chat:join-conversation', async ({ conversationId }) => {
      try {
        const conversation = await Conversation.findById(conversationId);
        if (!conversation) {
          return socket.emit('chat:error', { message: 'Conversation not found' });
        }

        const allowed = await canAccessConversation(conversation, socket.user);
        if (!allowed) {
          return socket.emit('chat:error', { message: 'Not authorized' });
        }

        socket.join(`conversation:${conversationId}`);
        socket.emit('chat:joined', { conversationId });
      } catch (error) {
        socket.emit('chat:error', { message: error.message || 'Join failed' });
      }
    });

    socket.on('chat:leave-conversation', ({ conversationId }) => {
      socket.leave(`conversation:${conversationId}`);
    });

    socket.on('chat:typing', async ({ conversationId, typing }) => {
      try {
        const conversation = await Conversation.findById(conversationId);
        if (!conversation) return;

        const allowed = await canAccessConversation(conversation, socket.user);
        if (!allowed) return;

        socket.to(`conversation:${conversationId}`).emit('chat:typing', {
          conversationId,
          userId: socket.user._id,
          typing: Boolean(typing)
        });
      } catch (error) {
        socket.emit('chat:error', { message: 'Typing signal failed' });
      }
    });

    socket.on('chat:mark-read', async ({ conversationId }) => {
      try {
        const conversation = await Conversation.findById(conversationId);
        if (!conversation) return;

        const allowed = await canAccessConversation(conversation, socket.user);
        if (!allowed) return;

        const now = new Date();

        await Message.updateMany(
          {
            conversationId,
            senderId: { $ne: socket.user._id },
            readAt: null
          },
          {
            $set: { readAt: now }
          }
        );

        io.to(`conversation:${conversationId}`).emit('chat:conversation-read', {
          conversationId,
          readAt: now,
          readerId: socket.user._id
        });
      } catch (error) {
        socket.emit('chat:error', { message: 'Read update failed' });
      }
    });

    socket.on('dispute:join-thread', async ({ disputeId }) => {
      try {
        const dispute = await Dispute.findById(disputeId).select('_id customer vendor');
        if (!dispute) {
          return socket.emit('dispute:error', { message: 'Dispute not found' });
        }

        const allowed = await canAccessDispute(dispute, socket.user);
        if (!allowed) {
          return socket.emit('dispute:error', { message: 'Not authorized' });
        }

        socket.join(`dispute:${disputeId}`);
        socket.emit('dispute:joined', { disputeId });
      } catch (error) {
        socket.emit('dispute:error', { message: error.message || 'Join failed' });
      }
    });

    socket.on('dispute:leave-thread', ({ disputeId }) => {
      socket.leave(`dispute:${disputeId}`);
    });
  });
};

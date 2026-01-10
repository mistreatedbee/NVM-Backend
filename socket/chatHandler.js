const Chat = require('../models/Chat');

module.exports = (io) => {
  io.on('connection', (socket) => {
    console.log('New client connected:', socket.id);

    // Join a chat room
    socket.on('join-chat', async ({ userId, vendorId }) => {
      const roomId = [userId, vendorId].sort().join('-');
      socket.join(roomId);
      console.log(`User ${userId} joined chat with vendor ${vendorId}`);
    });

    // Send message
    socket.on('send-message', async ({ chatId, senderId, message }) => {
      try {
        const chat = await Chat.findById(chatId);
        
        if (!chat) {
          return socket.emit('error', { message: 'Chat not found' });
        }

        chat.messages.push({
          sender: senderId,
          message,
          timestamp: new Date()
        });

        chat.lastMessage = message;
        chat.lastMessageAt = new Date();
        
        await chat.save();

        // Emit to all participants
        chat.participants.forEach(participantId => {
          io.to(participantId.toString()).emit('new-message', {
            chatId,
            senderId,
            message,
            timestamp: new Date()
          });
        });
      } catch (error) {
        socket.emit('error', { message: error.message });
      }
    });

    // Mark messages as read
    socket.on('mark-read', async ({ chatId, userId }) => {
      try {
        await Chat.updateMany(
          { _id: chatId, 'messages.sender': { $ne: userId } },
          { $set: { 'messages.$[].read': true } }
        );
        
        socket.emit('marked-read', { chatId });
      } catch (error) {
        socket.emit('error', { message: error.message });
      }
    });

    socket.on('disconnect', () => {
      console.log('Client disconnected:', socket.id);
    });
  });
};


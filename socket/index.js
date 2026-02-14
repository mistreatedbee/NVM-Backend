let ioInstance = null;

function initSocket(io) {
  ioInstance = io;
  return ioInstance;
}

function getIO() {
  if (!ioInstance) {
    throw new Error('Socket.IO not initialized');
  }
  return ioInstance;
}

module.exports = {
  initSocket,
  getIO
};

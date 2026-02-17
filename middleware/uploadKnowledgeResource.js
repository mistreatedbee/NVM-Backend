const multer = require('multer');

const storage = multer.memoryStorage();

const allowedMimeTypes = new Set([
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/msword',
  'image/jpeg',
  'image/png',
  'image/webp',
  'video/mp4'
]);

const fileFilter = (req, file, cb) => {
  if (allowedMimeTypes.has(file.mimetype)) {
    return cb(null, true);
  }
  return cb(new Error('Only PDF, DOC, DOCX, JPG, PNG, WEBP, or MP4 files are allowed'), false);
};

module.exports = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 25 * 1024 * 1024
  }
});

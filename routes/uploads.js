const express = require('express');
const multer = require('multer');
const { authenticate } = require('../middleware/auth');
const { uploadLimiter } = require('../middleware/security');
const { uploadAsset } = require('../controllers/uploadController');

const router = express.Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }
});

router.post('/', authenticate, uploadLimiter, upload.single('file'), uploadAsset);

module.exports = router;

const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const {
  bulkUploadProducts,
  downloadTemplate,
  getUploadHistory
} = require('../controllers/bulkUploadController');
const { authenticate, isVendor } = require('../middleware/auth');

// Configure multer for file upload
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/');
  },
  filename: (req, file, cb) => {
    cb(null, `${Date.now()}-${file.originalname}`);
  }
});

const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (ext !== '.csv') {
      return cb(new Error('Only CSV files are allowed'));
    }
    cb(null, true);
  },
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB
  }
});

router.post('/products', authenticate, isVendor, upload.single('file'), bulkUploadProducts);
router.get('/template', authenticate, isVendor, downloadTemplate);
router.get('/history', authenticate, isVendor, getUploadHistory);

module.exports = router;


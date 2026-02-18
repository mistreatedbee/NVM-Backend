const express = require('express');
const { getPublicCMSPageBySlug, getPublicHomepageContent } = require('../controllers/adminSuiteController');

const router = express.Router();

router.get('/cms/:slug', getPublicCMSPageBySlug);
router.get('/homepage', getPublicHomepageContent);

module.exports = router;

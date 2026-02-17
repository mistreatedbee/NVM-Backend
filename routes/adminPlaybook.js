const express = require('express');
const { body, param } = require('express-validator');
const { authenticate, isAdmin } = require('../middleware/auth');
const { validate } = require('../middleware/validator');
const {
  listModulesAdmin,
  listLessonsAdmin,
  createPlaybookModule,
  updatePlaybookModule,
  publishPlaybookModule,
  createPlaybookLesson,
  updatePlaybookLesson,
  publishPlaybookLesson
} = require('../controllers/playbookAdminController');

const router = express.Router();

router.use(authenticate, isAdmin);

router.get('/playbook/modules', listModulesAdmin);
router.get('/playbook/lessons', listLessonsAdmin);

router.post(
  '/playbook/modules',
  body('title').trim().notEmpty().withMessage('title is required'),
  validate,
  createPlaybookModule
);

router.put(
  '/playbook/modules/:id',
  param('id').isMongoId().withMessage('Invalid module id'),
  validate,
  updatePlaybookModule
);

router.patch(
  '/playbook/modules/:id/publish',
  param('id').isMongoId().withMessage('Invalid module id'),
  validate,
  publishPlaybookModule
);

router.post(
  '/playbook/lessons',
  body('moduleId').isMongoId().withMessage('moduleId is required'),
  body('title').trim().notEmpty().withMessage('title is required'),
  body('content').trim().notEmpty().withMessage('content is required'),
  validate,
  createPlaybookLesson
);

router.put(
  '/playbook/lessons/:id',
  param('id').isMongoId().withMessage('Invalid lesson id'),
  validate,
  updatePlaybookLesson
);

router.patch(
  '/playbook/lessons/:id/publish',
  param('id').isMongoId().withMessage('Invalid lesson id'),
  validate,
  publishPlaybookLesson
);

module.exports = router;

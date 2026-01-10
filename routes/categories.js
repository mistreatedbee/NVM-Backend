const express = require('express');
const router = express.Router();
const {
  createCategory,
  getAllCategories,
  getCategoryBySlug,
  updateCategory,
  deleteCategory
} = require('../controllers/categoryController');
const { authenticate, isAdmin } = require('../middleware/auth');
const { validateId, validate } = require('../middleware/validator');

router.post('/', authenticate, isAdmin, createCategory);
router.get('/', getAllCategories);
router.get('/:slug', getCategoryBySlug);
router.put('/:id', authenticate, isAdmin, validateId, validate, updateCategory);
router.delete('/:id', authenticate, isAdmin, validateId, validate, deleteCategory);

module.exports = router;

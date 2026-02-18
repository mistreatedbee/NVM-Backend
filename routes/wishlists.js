const express = require('express');
const { authenticate } = require('../middleware/auth');
const {
  getLists,
  createList,
  addProduct,
  removeProduct,
  deleteList,
  moveProduct
} = require('../controllers/wishlistListsController');

const router = express.Router();
router.use(authenticate);

router.get('/', getLists);
router.post('/', createList);
router.post('/:listId/add', addProduct);
router.post('/:listId/remove', removeProduct);
router.delete('/:listId', deleteList);
router.post('/move', moveProduct);

module.exports = router;

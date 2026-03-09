const express = require('express');
const { authenticate } = require('../middleware/auth');
const {
  getAddressBook,
  addAddress,
  updateAddress,
  deleteAddress
} = require('../controllers/addressBookController');

const router = express.Router();
router.use(authenticate);

router.get('/', getAddressBook);
router.post('/', addAddress);
router.put('/:addressId', updateAddress);
router.delete('/:addressId', deleteAddress);

module.exports = router;

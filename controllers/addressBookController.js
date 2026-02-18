const AddressBook = require('../models/AddressBook');

async function getOrCreate(userId) {
  let doc = await AddressBook.findOne({ userId });
  if (!doc) doc = await AddressBook.create({ userId, addresses: [] });
  return doc;
}

exports.getAddressBook = async (req, res, next) => {
  try {
    const doc = await getOrCreate(req.user.id);
    return res.status(200).json({ success: true, data: doc });
  } catch (error) {
    return next(error);
  }
};

exports.addAddress = async (req, res, next) => {
  try {
    const doc = await getOrCreate(req.user.id);
    const payload = req.body || {};
    if (!payload.name || !payload.phone || !payload.addressLine1 || !payload.city || !payload.province || !payload.postalCode) {
      return res.status(400).json({ success: false, message: 'Required address fields are missing' });
    }

    if (payload.isDefault) {
      doc.addresses = doc.addresses.map((address) => ({ ...address.toObject(), isDefault: false }));
    }
    doc.addresses.push(payload);
    if (doc.addresses.length === 1) doc.addresses[0].isDefault = true;
    await doc.save();
    return res.status(201).json({ success: true, data: doc });
  } catch (error) {
    return next(error);
  }
};

exports.updateAddress = async (req, res, next) => {
  try {
    const doc = await getOrCreate(req.user.id);
    const address = doc.addresses.id(req.params.addressId);
    if (!address) return res.status(404).json({ success: false, message: 'Address not found' });

    Object.assign(address, req.body || {});
    if (req.body?.isDefault) {
      doc.addresses.forEach((a) => {
        if (String(a._id) !== String(address._id)) a.isDefault = false;
      });
      address.isDefault = true;
    }
    await doc.save();
    return res.status(200).json({ success: true, data: doc });
  } catch (error) {
    return next(error);
  }
};

exports.deleteAddress = async (req, res, next) => {
  try {
    const doc = await getOrCreate(req.user.id);
    const address = doc.addresses.id(req.params.addressId);
    if (!address) return res.status(404).json({ success: false, message: 'Address not found' });
    const wasDefault = address.isDefault;
    address.deleteOne();

    if (wasDefault && doc.addresses.length) {
      doc.addresses[0].isDefault = true;
    }
    await doc.save();
    return res.status(200).json({ success: true, data: doc });
  } catch (error) {
    return next(error);
  }
};

const cloudinary = require('../utils/cloudinary');

const folderByType = {
  product: 'nvm/products',
  vendor: 'nvm/vendors',
  banner: 'nvm/banners',
  doc: 'nvm/docs'
};

function isAllowedRoleForType(role, type) {
  if (role === 'admin') return true;
  if (role === 'vendor') return ['product', 'vendor', 'doc'].includes(type);
  if (role === 'customer') return ['doc'].includes(type);
  return false;
}

exports.uploadAsset = async (req, res, next) => {
  try {
    const type = String(req.body.type || '').toLowerCase();
    if (!folderByType[type]) {
      return res.status(400).json({ success: false, message: 'type must be one of product|vendor|banner|doc' });
    }
    if (!isAllowedRoleForType(String(req.user.role), type)) {
      return res.status(403).json({ success: false, message: 'Role not permitted to upload this type' });
    }
    if (!req.file?.buffer) {
      return res.status(400).json({ success: false, message: 'file is required' });
    }

    const isDoc = type === 'doc';
    const upload = await cloudinary.uploadAsset({
      buffer: req.file.buffer,
      folder: folderByType[type],
      resourceType: isDoc ? 'auto' : 'image'
    });

    return res.status(201).json({
      success: true,
      data: {
        type,
        folder: folderByType[type],
        publicId: upload.publicId,
        urls: {
          original: upload.originalUrl,
          medium: upload.mediumUrl || upload.originalUrl,
          thumbnail: upload.thumbnailUrl || upload.originalUrl
        },
        format: upload.format,
        bytes: upload.bytes
      }
    });
  } catch (error) {
    return next(error);
  }
};

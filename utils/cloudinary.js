const cloudinary = require('cloudinary').v2;

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

// Upload image
exports.uploadImage = async (file, folder = 'nvm') => {
  try {
    const result = await cloudinary.uploader.upload(file.path, {
      folder: folder,
      resource_type: 'auto',
      transformation: [
        { width: 1200, height: 1200, crop: 'limit' },
        { quality: 'auto' },
        { fetch_format: 'auto' }
      ]
    });

    return {
      public_id: result.public_id,
      url: result.secure_url
    };
  } catch (error) {
    console.error('Cloudinary upload error:', error);
    throw new Error('Image upload failed');
  }
};

// Upload multiple images
exports.uploadMultipleImages = async (files, folder = 'nvm') => {
  try {
    const uploadPromises = files.map(file => this.uploadImage(file, folder));
    return await Promise.all(uploadPromises);
  } catch (error) {
    console.error('Cloudinary multiple upload error:', error);
    throw new Error('Images upload failed');
  }
};

// Delete image
exports.deleteImage = async (publicId) => {
  try {
    await cloudinary.uploader.destroy(publicId);
  } catch (error) {
    console.error('Cloudinary delete error:', error);
    throw new Error('Image deletion failed');
  }
};

// Delete multiple images
exports.deleteMultipleImages = async (publicIds) => {
  try {
    const deletePromises = publicIds.map(id => this.deleteImage(id));
    await Promise.all(deletePromises);
  } catch (error) {
    console.error('Cloudinary multiple delete error:', error);
    throw new Error('Images deletion failed');
  }
};

module.exports = cloudinary;

const cloudinary = require('cloudinary').v2;

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

function ensureConfigured() {
  if (!process.env.CLOUDINARY_CLOUD_NAME || !process.env.CLOUDINARY_API_KEY || !process.env.CLOUDINARY_API_SECRET) {
    throw new Error('Cloudinary is not configured. Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET.');
  }
}

function uploadFromBuffer(buffer, options = {}) {
  ensureConfigured();

  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(options, (error, result) => {
      if (error) return reject(error);
      return resolve(result);
    });
    uploadStream.end(buffer);
  });
}

function buildTransformedUrl(publicId, transformation = []) {
  return cloudinary.url(publicId, {
    secure: true,
    fetch_format: 'auto',
    quality: 'auto',
    transformation
  });
}

async function uploadAsset({ buffer, folder, resourceType = 'image', publicId, transformation }) {
  const result = await uploadFromBuffer(buffer, {
    folder,
    resource_type: resourceType,
    public_id: publicId,
    overwrite: true,
    transformation
  });

  if (resourceType !== 'image') {
    return {
      publicId: result.public_id,
      originalUrl: result.secure_url,
      format: result.format,
      bytes: result.bytes,
      resourceType
    };
  }

  return {
    publicId: result.public_id,
    originalUrl: buildTransformedUrl(result.public_id, [{ width: 1600, crop: 'limit' }]),
    mediumUrl: buildTransformedUrl(result.public_id, [{ width: 800, crop: 'limit' }]),
    thumbnailUrl: buildTransformedUrl(result.public_id, [{ width: 300, height: 300, crop: 'fill', gravity: 'auto' }]),
    format: result.format,
    bytes: result.bytes,
    resourceType
  };
}

cloudinary.uploadFromBuffer = uploadFromBuffer;
cloudinary.uploadAsset = uploadAsset;
cloudinary.buildTransformedUrl = buildTransformedUrl;

module.exports = cloudinary;

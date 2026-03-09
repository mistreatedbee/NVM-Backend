const fs = require('fs/promises');
const cloudinary = require('./cloudinary');

const folderByType = {
  product: 'nvm/products',
  vendor: 'nvm/vendors',
  banner: 'nvm/banners',
  doc: 'nvm/docs'
};

async function getFileBuffer(file) {
  if (!file) return null;
  if (file.buffer) return file.buffer;
  if (file.path) {
    try {
      return await fs.readFile(file.path);
    } finally {
      await fs.unlink(file.path).catch(() => {});
    }
  }
  return null;
}

async function uploadByType({ file, type, folder, resourceType }) {
  const buffer = await getFileBuffer(file);
  if (!buffer) return null;

  const normalizedType = String(type || '').toLowerCase();
  const targetFolder = folder || folderByType[normalizedType] || 'nvm/misc';
  const resolvedResourceType = resourceType || (normalizedType === 'doc' ? 'auto' : 'image');

  return cloudinary.uploadAsset({
    buffer,
    folder: targetFolder,
    resourceType: resolvedResourceType
  });
}

module.exports = {
  uploadByType,
  getFileBuffer
};

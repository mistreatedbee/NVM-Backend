const crypto = require('crypto');
const mongoose = require('mongoose');
const KnowledgeArticle = require('../models/KnowledgeArticle');
const Resource = require('../models/Resource');
const ContentView = require('../models/ContentView');
const cloudinary = require('../utils/cloudinary');

const CATEGORY_VALUES = [
  'GETTING_STARTED',
  'PRODUCTS',
  'ORDERS',
  'PAYMENTS',
  'MARKETING',
  'POLICIES',
  'BEST_PRACTICES',
  'OTHER'
];

const ARTICLE_AUDIENCE_READ = ['VENDOR', 'ALL'];
const STATUS_VALUES = ['DRAFT', 'PUBLISHED', 'ARCHIVED'];
const RESOURCE_TYPES = ['PDF', 'VIDEO', 'LINK', 'FILE'];

function parsePagination(query) {
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(query.limit, 10) || 12));
  return { page, limit, skip: (page - 1) * limit };
}

function toBoolean(value, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value === 'boolean') return value;
  return String(value).toLowerCase() === 'true';
}

function sanitizeText(input) {
  if (typeof input !== 'string') return input;
  return input.trim();
}

function sanitizeRichText(input) {
  if (typeof input !== 'string') return input;
  return input
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '')
    .replace(/javascript:/gi, '')
    .trim();
}

function slugify(input) {
  const fallback = `item-${Date.now()}`;
  if (!input) return fallback;
  const slug = String(input)
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120);
  return slug || fallback;
}

async function ensureUniqueSlug(model, base, excludeId) {
  let slug = slugify(base);
  let counter = 0;
  while (true) {
    const candidate = counter === 0 ? slug : `${slug}-${counter}`;
    const existing = await model.findOne({ slug: candidate }).select('_id');
    if (!existing || String(existing._id) === String(excludeId || '')) {
      return candidate;
    }
    counter += 1;
  }
}

function parseTags(tagsInput) {
  if (Array.isArray(tagsInput)) {
    return tagsInput.map((tag) => String(tag).trim()).filter(Boolean);
  }
  if (typeof tagsInput === 'string') {
    return tagsInput.split(',').map((tag) => tag.trim()).filter(Boolean);
  }
  return [];
}

function roleToTrackingRole(user) {
  if (!user) return 'GUEST';
  if (user.role === 'admin') return 'ADMIN';
  if (user.role === 'vendor') return 'VENDOR';
  return 'CUSTOMER';
}

function getIpHash(req) {
  const ip = req.headers['x-forwarded-for'] || req.ip || '';
  const userAgent = req.headers['user-agent'] || '';
  const raw = `${ip}|${userAgent}`;
  return crypto.createHash('sha256').update(raw).digest('hex');
}

async function uploadBufferToCloudinary(file) {
  if (!file?.buffer) throw new Error('No upload buffer provided');
  const folder = process.env.KNOWLEDGE_RESOURCE_UPLOAD_FOLDER || 'nvm/knowledge/resources';

  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder,
        resource_type: 'auto',
        use_filename: true,
        unique_filename: true
      },
      (error, result) => {
        if (error) return reject(error);
        resolve(result);
      }
    );
    uploadStream.end(file.buffer);
  });
}

function buildVendorPublishedFilter(extra = {}) {
  return {
    ...extra,
    status: 'PUBLISHED',
    audience: { $in: ARTICLE_AUDIENCE_READ }
  };
}

exports.getKnowledgeArticles = async (req, res, next) => {
  try {
    const { page, limit, skip } = parsePagination(req.query);
    const { category, q, featured } = req.query;
    const tags = parseTags(req.query.tags);
    const query = buildVendorPublishedFilter();

    if (category && CATEGORY_VALUES.includes(category)) query.category = category;
    if (tags.length > 0) query.tags = { $in: tags };
    if (featured !== undefined) query.featured = toBoolean(featured);
    if (q && String(q).trim()) query.$text = { $search: String(q).trim() };

    const sort = q ? { score: { $meta: 'textScore' }, publishedAt: -1, createdAt: -1 } : { featured: -1, publishedAt: -1, createdAt: -1 };

    const [articles, total] = await Promise.all([
      KnowledgeArticle.find(query)
        .select(q ? { score: { $meta: 'textScore' } } : {})
        .sort(sort)
        .skip(skip)
        .limit(limit),
      KnowledgeArticle.countDocuments(query)
    ]);

    return res.status(200).json({
      success: true,
      count: articles.length,
      total,
      pages: Math.ceil(total / limit),
      currentPage: page,
      data: articles
    });
  } catch (error) {
    return next(error);
  }
};

exports.getKnowledgeArticleBySlug = async (req, res, next) => {
  try {
    const isAdmin = req.user?.role === 'admin';
    const query = { slug: String(req.params.slug || '').toLowerCase().trim() };
    if (!isAdmin) Object.assign(query, buildVendorPublishedFilter());

    const article = await KnowledgeArticle.findOne(query).populate('createdBy updatedBy', 'name email role');
    if (!article) return res.status(404).json({ success: false, message: 'Article not found' });

    return res.status(200).json({ success: true, data: article });
  } catch (error) {
    return next(error);
  }
};

exports.getKnowledgeResources = async (req, res, next) => {
  try {
    const { page, limit, skip } = parsePagination(req.query);
    const { category, type, q, featured } = req.query;
    const query = buildVendorPublishedFilter();

    if (category && CATEGORY_VALUES.includes(category)) query.category = category;
    if (type && RESOURCE_TYPES.includes(type)) query.type = type;
    if (featured !== undefined) query.featured = toBoolean(featured);
    if (q && String(q).trim()) query.$text = { $search: String(q).trim() };

    const sort = q ? { score: { $meta: 'textScore' }, publishedAt: -1, createdAt: -1 } : { featured: -1, publishedAt: -1, createdAt: -1 };

    const [resources, total] = await Promise.all([
      Resource.find(query)
        .select(q ? { score: { $meta: 'textScore' } } : {})
        .sort(sort)
        .skip(skip)
        .limit(limit),
      Resource.countDocuments(query)
    ]);

    return res.status(200).json({
      success: true,
      count: resources.length,
      total,
      pages: Math.ceil(total / limit),
      currentPage: page,
      data: resources
    });
  } catch (error) {
    return next(error);
  }
};

exports.getKnowledgeResourceBySlug = async (req, res, next) => {
  try {
    const isAdmin = req.user?.role === 'admin';
    const query = { slug: String(req.params.slug || '').toLowerCase().trim() };
    if (!isAdmin) Object.assign(query, buildVendorPublishedFilter());

    const resource = await Resource.findOne(query).populate('createdBy updatedBy', 'name email role');
    if (!resource) return res.status(404).json({ success: false, message: 'Resource not found' });

    return res.status(200).json({ success: true, data: resource });
  } catch (error) {
    return next(error);
  }
};

exports.trackContentView = async (req, res, next) => {
  try {
    const { contentType, contentId } = req.body || {};
    const sessionId = sanitizeText(req.body?.sessionId);

    if (!['ARTICLE', 'RESOURCE'].includes(contentType)) {
      return res.status(400).json({ success: false, message: 'Invalid contentType' });
    }
    if (!mongoose.Types.ObjectId.isValid(contentId)) {
      return res.status(400).json({ success: false, message: 'Invalid contentId' });
    }

    const contentModel = contentType === 'ARTICLE' ? KnowledgeArticle : Resource;
    const content = await contentModel.findById(contentId).select('_id status audience');
    if (!content) return res.status(404).json({ success: false, message: 'Content not found' });

    if (content.status !== 'PUBLISHED' && req.user?.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Cannot track unpublished content' });
    }

    const view = await ContentView.create({
      userId: req.user?._id || undefined,
      role: roleToTrackingRole(req.user),
      contentType,
      contentId: content._id,
      sessionId: sessionId || undefined,
      ipHash: getIpHash(req)
    });

    return res.status(201).json({ success: true, data: { id: view._id } });
  } catch (error) {
    return next(error);
  }
};

exports.createKnowledgeArticle = async (req, res, next) => {
  try {
    const payload = req.body || {};
    const title = sanitizeText(payload.title);
    const content = sanitizeRichText(payload.content);
    if (!title || !content) {
      return res.status(400).json({ success: false, message: 'title and content are required' });
    }

    const status = STATUS_VALUES.includes(payload.status) ? payload.status : 'DRAFT';
    const slug = await ensureUniqueSlug(KnowledgeArticle, payload.slug || title);

    const article = await KnowledgeArticle.create({
      title,
      slug,
      summary: sanitizeText(payload.summary),
      content,
      category: CATEGORY_VALUES.includes(payload.category) ? payload.category : 'OTHER',
      tags: parseTags(payload.tags),
      audience: ['VENDOR', 'CUSTOMER', 'ALL'].includes(payload.audience) ? payload.audience : 'VENDOR',
      status,
      featured: toBoolean(payload.featured),
      coverImageUrl: sanitizeText(payload.coverImageUrl),
      createdBy: req.user.id,
      updatedBy: req.user.id,
      publishedAt: status === 'PUBLISHED' ? new Date() : undefined
    });

    return res.status(201).json({ success: true, data: article });
  } catch (error) {
    return next(error);
  }
};

exports.updateKnowledgeArticle = async (req, res, next) => {
  try {
    const article = await KnowledgeArticle.findById(req.params.id);
    if (!article) return res.status(404).json({ success: false, message: 'Article not found' });

    const payload = req.body || {};
    if (payload.title !== undefined) article.title = sanitizeText(payload.title);
    if (payload.summary !== undefined) article.summary = sanitizeText(payload.summary);
    if (payload.content !== undefined) article.content = sanitizeRichText(payload.content);
    if (payload.category && CATEGORY_VALUES.includes(payload.category)) article.category = payload.category;
    if (payload.tags !== undefined) article.tags = parseTags(payload.tags);
    if (payload.audience && ['VENDOR', 'CUSTOMER', 'ALL'].includes(payload.audience)) article.audience = payload.audience;
    if (payload.status && STATUS_VALUES.includes(payload.status)) article.status = payload.status;
    if (payload.featured !== undefined) article.featured = toBoolean(payload.featured);
    if (payload.coverImageUrl !== undefined) article.coverImageUrl = sanitizeText(payload.coverImageUrl);
    if (payload.slug !== undefined || payload.title !== undefined) {
      article.slug = await ensureUniqueSlug(KnowledgeArticle, payload.slug || payload.title || article.title, article._id);
    }

    if (article.status === 'PUBLISHED' && !article.publishedAt) article.publishedAt = new Date();
    if (article.status !== 'PUBLISHED') article.publishedAt = undefined;
    article.updatedBy = req.user.id;

    await article.save();
    return res.status(200).json({ success: true, data: article });
  } catch (error) {
    return next(error);
  }
};

exports.publishKnowledgeArticle = async (req, res, next) => {
  try {
    const article = await KnowledgeArticle.findById(req.params.id);
    if (!article) return res.status(404).json({ success: false, message: 'Article not found' });

    article.status = 'PUBLISHED';
    article.publishedAt = new Date();
    article.updatedBy = req.user.id;
    await article.save();

    return res.status(200).json({ success: true, data: article });
  } catch (error) {
    return next(error);
  }
};

exports.unpublishKnowledgeArticle = async (req, res, next) => {
  try {
    const article = await KnowledgeArticle.findById(req.params.id);
    if (!article) return res.status(404).json({ success: false, message: 'Article not found' });

    const nextStatus = req.body?.status === 'ARCHIVED' ? 'ARCHIVED' : 'DRAFT';
    article.status = nextStatus;
    article.publishedAt = undefined;
    article.updatedBy = req.user.id;
    await article.save();

    return res.status(200).json({ success: true, data: article });
  } catch (error) {
    return next(error);
  }
};

exports.deleteKnowledgeArticle = async (req, res, next) => {
  try {
    const article = await KnowledgeArticle.findById(req.params.id);
    if (!article) return res.status(404).json({ success: false, message: 'Article not found' });

    article.status = 'ARCHIVED';
    article.publishedAt = undefined;
    article.updatedBy = req.user.id;
    await article.save();

    return res.status(200).json({ success: true, message: 'Article archived', data: article });
  } catch (error) {
    return next(error);
  }
};

exports.listAdminKnowledgeArticles = async (req, res, next) => {
  try {
    const { page, limit, skip } = parsePagination(req.query);
    const query = {};
    if (req.query.category && CATEGORY_VALUES.includes(req.query.category)) query.category = req.query.category;
    if (req.query.status && STATUS_VALUES.includes(req.query.status)) query.status = req.query.status;
    if (req.query.q && String(req.query.q).trim()) query.$text = { $search: String(req.query.q).trim() };

    const sort = req.query.q ? { score: { $meta: 'textScore' }, updatedAt: -1 } : { updatedAt: -1 };
    const [items, total] = await Promise.all([
      KnowledgeArticle.find(query).select(req.query.q ? { score: { $meta: 'textScore' } } : {}).sort(sort).skip(skip).limit(limit),
      KnowledgeArticle.countDocuments(query)
    ]);

    return res.status(200).json({
      success: true,
      count: items.length,
      total,
      pages: Math.ceil(total / limit),
      currentPage: page,
      data: items
    });
  } catch (error) {
    return next(error);
  }
};

exports.createKnowledgeResource = async (req, res, next) => {
  try {
    const payload = req.body || {};
    const title = sanitizeText(payload.title);
    const type = payload.type;
    if (!title || !type || !RESOURCE_TYPES.includes(type)) {
      return res.status(400).json({ success: false, message: 'Valid title and type are required' });
    }

    const status = STATUS_VALUES.includes(payload.status) ? payload.status : 'DRAFT';
    const slug = await ensureUniqueSlug(Resource, payload.slug || title);

    const resource = await Resource.create({
      title,
      slug,
      description: sanitizeText(payload.description),
      type,
      category: CATEGORY_VALUES.includes(payload.category) ? payload.category : 'OTHER',
      audience: ['VENDOR', 'CUSTOMER', 'ALL'].includes(payload.audience) ? payload.audience : 'VENDOR',
      status,
      featured: toBoolean(payload.featured),
      fileUrl: sanitizeText(payload.fileUrl),
      fileName: sanitizeText(payload.fileName),
      fileSize: payload.fileSize || undefined,
      mimeType: sanitizeText(payload.mimeType),
      storageKey: sanitizeText(payload.storageKey),
      externalUrl: sanitizeText(payload.externalUrl),
      thumbnailUrl: sanitizeText(payload.thumbnailUrl),
      createdBy: req.user.id,
      updatedBy: req.user.id,
      publishedAt: status === 'PUBLISHED' ? new Date() : undefined
    });

    return res.status(201).json({ success: true, data: resource });
  } catch (error) {
    return next(error);
  }
};

exports.updateKnowledgeResource = async (req, res, next) => {
  try {
    const resource = await Resource.findById(req.params.id);
    if (!resource) return res.status(404).json({ success: false, message: 'Resource not found' });

    const payload = req.body || {};
    if (payload.title !== undefined) resource.title = sanitizeText(payload.title);
    if (payload.description !== undefined) resource.description = sanitizeText(payload.description);
    if (payload.type && RESOURCE_TYPES.includes(payload.type)) resource.type = payload.type;
    if (payload.category && CATEGORY_VALUES.includes(payload.category)) resource.category = payload.category;
    if (payload.audience && ['VENDOR', 'CUSTOMER', 'ALL'].includes(payload.audience)) resource.audience = payload.audience;
    if (payload.status && STATUS_VALUES.includes(payload.status)) resource.status = payload.status;
    if (payload.featured !== undefined) resource.featured = toBoolean(payload.featured);
    if (payload.fileUrl !== undefined) resource.fileUrl = sanitizeText(payload.fileUrl);
    if (payload.fileName !== undefined) resource.fileName = sanitizeText(payload.fileName);
    if (payload.fileSize !== undefined) resource.fileSize = payload.fileSize;
    if (payload.mimeType !== undefined) resource.mimeType = sanitizeText(payload.mimeType);
    if (payload.storageKey !== undefined) resource.storageKey = sanitizeText(payload.storageKey);
    if (payload.externalUrl !== undefined) resource.externalUrl = sanitizeText(payload.externalUrl);
    if (payload.thumbnailUrl !== undefined) resource.thumbnailUrl = sanitizeText(payload.thumbnailUrl);
    if (payload.slug !== undefined || payload.title !== undefined) {
      resource.slug = await ensureUniqueSlug(Resource, payload.slug || payload.title || resource.title, resource._id);
    }

    if (resource.status === 'PUBLISHED' && !resource.publishedAt) resource.publishedAt = new Date();
    if (resource.status !== 'PUBLISHED') resource.publishedAt = undefined;
    resource.updatedBy = req.user.id;

    await resource.save();
    return res.status(200).json({ success: true, data: resource });
  } catch (error) {
    return next(error);
  }
};

exports.publishKnowledgeResource = async (req, res, next) => {
  try {
    const resource = await Resource.findById(req.params.id);
    if (!resource) return res.status(404).json({ success: false, message: 'Resource not found' });

    resource.status = 'PUBLISHED';
    resource.publishedAt = new Date();
    resource.updatedBy = req.user.id;
    await resource.save();

    return res.status(200).json({ success: true, data: resource });
  } catch (error) {
    return next(error);
  }
};

exports.unpublishKnowledgeResource = async (req, res, next) => {
  try {
    const resource = await Resource.findById(req.params.id);
    if (!resource) return res.status(404).json({ success: false, message: 'Resource not found' });

    const nextStatus = req.body?.status === 'ARCHIVED' ? 'ARCHIVED' : 'DRAFT';
    resource.status = nextStatus;
    resource.publishedAt = undefined;
    resource.updatedBy = req.user.id;
    await resource.save();

    return res.status(200).json({ success: true, data: resource });
  } catch (error) {
    return next(error);
  }
};

exports.deleteKnowledgeResource = async (req, res, next) => {
  try {
    const resource = await Resource.findById(req.params.id);
    if (!resource) return res.status(404).json({ success: false, message: 'Resource not found' });

    resource.status = 'ARCHIVED';
    resource.publishedAt = undefined;
    resource.updatedBy = req.user.id;
    await resource.save();

    return res.status(200).json({ success: true, message: 'Resource archived', data: resource });
  } catch (error) {
    return next(error);
  }
};

exports.listAdminKnowledgeResources = async (req, res, next) => {
  try {
    const { page, limit, skip } = parsePagination(req.query);
    const query = {};
    if (req.query.category && CATEGORY_VALUES.includes(req.query.category)) query.category = req.query.category;
    if (req.query.status && STATUS_VALUES.includes(req.query.status)) query.status = req.query.status;
    if (req.query.type && RESOURCE_TYPES.includes(req.query.type)) query.type = req.query.type;
    if (req.query.q && String(req.query.q).trim()) query.$text = { $search: String(req.query.q).trim() };

    const sort = req.query.q ? { score: { $meta: 'textScore' }, updatedAt: -1 } : { updatedAt: -1 };
    const [items, total] = await Promise.all([
      Resource.find(query).select(req.query.q ? { score: { $meta: 'textScore' } } : {}).sort(sort).skip(skip).limit(limit),
      Resource.countDocuments(query)
    ]);

    return res.status(200).json({
      success: true,
      count: items.length,
      total,
      pages: Math.ceil(total / limit),
      currentPage: page,
      data: items
    });
  } catch (error) {
    return next(error);
  }
};

exports.uploadKnowledgeResourceFile = async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, message: 'File is required' });

    const result = await uploadBufferToCloudinary(req.file);
    return res.status(201).json({
      success: true,
      data: {
        fileUrl: result.secure_url,
        storageKey: result.public_id,
        fileName: req.file.originalname,
        fileSize: req.file.size,
        mimeType: req.file.mimetype
      }
    });
  } catch (error) {
    return next(error);
  }
};

exports.getKnowledgeAnalytics = async (req, res, next) => {
  try {
    const { contentType, contentId, dateFrom, dateTo } = req.query;
    const match = {};

    if (contentType && ['ARTICLE', 'RESOURCE'].includes(contentType)) match.contentType = contentType;
    if (contentId) {
      if (!mongoose.Types.ObjectId.isValid(contentId)) {
        return res.status(400).json({ success: false, message: 'Invalid contentId' });
      }
      match.contentId = new mongoose.Types.ObjectId(contentId);
    }

    const dateMatch = {};
    if (dateFrom) dateMatch.$gte = new Date(dateFrom);
    if (dateTo) dateMatch.$lte = new Date(dateTo);
    if (Object.keys(dateMatch).length > 0) match.createdAt = dateMatch;

    const [viewsPerDay, topRaw, totalViews] = await Promise.all([
      ContentView.aggregate([
        { $match: match },
        {
          $group: {
            _id: {
              day: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
              contentType: '$contentType'
            },
            views: { $sum: 1 }
          }
        },
        { $sort: { '_id.day': 1 } }
      ]),
      ContentView.aggregate([
        { $match: match },
        { $group: { _id: { contentType: '$contentType', contentId: '$contentId' }, views: { $sum: 1 } } },
        { $sort: { views: -1 } },
        { $limit: 20 }
      ]),
      ContentView.countDocuments(match)
    ]);

    const articleIds = topRaw.filter((row) => row._id.contentType === 'ARTICLE').map((row) => row._id.contentId);
    const resourceIds = topRaw.filter((row) => row._id.contentType === 'RESOURCE').map((row) => row._id.contentId);

    const [articles, resources] = await Promise.all([
      articleIds.length ? KnowledgeArticle.find({ _id: { $in: articleIds } }).select('_id title slug') : [],
      resourceIds.length ? Resource.find({ _id: { $in: resourceIds } }).select('_id title slug') : []
    ]);

    const articleMap = new Map(articles.map((item) => [String(item._id), item]));
    const resourceMap = new Map(resources.map((item) => [String(item._id), item]));

    const topContent = topRaw.map((row) => {
      const id = String(row._id.contentId);
      const entity = row._id.contentType === 'ARTICLE' ? articleMap.get(id) : resourceMap.get(id);
      return {
        contentType: row._id.contentType,
        contentId: id,
        title: entity?.title || 'Deleted content',
        slug: entity?.slug || null,
        views: row.views
      };
    });

    return res.status(200).json({
      success: true,
      data: {
        totalViews,
        viewsPerDay: viewsPerDay.map((row) => ({
          date: row._id.day,
          contentType: row._id.contentType,
          views: row.views
        })),
        topContent
      }
    });
  } catch (error) {
    return next(error);
  }
};

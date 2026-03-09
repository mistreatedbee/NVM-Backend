const crypto = require('crypto');
const mongoose = require('mongoose');
const Post = require('../models/Post');
const EngagementEvent = require('../models/EngagementEvent');

const POST_TYPES = ['ANNOUNCEMENT', 'BLOG'];
const POST_STATUS = ['DRAFT', 'PUBLISHED', 'ARCHIVED'];
const POST_AUDIENCE = ['ALL', 'VENDOR', 'CUSTOMER'];
const EVENT_TYPES = ['VIEW', 'CLICK', 'SHARE'];

function parsePagination(query) {
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(query.limit, 10) || 10));
  return { page, limit, skip: (page - 1) * limit };
}

function slugify(input) {
  const fallback = `post-${Date.now()}`;
  if (!input) return fallback;
  const slug = String(input)
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120);
  return slug || fallback;
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

function parseTags(tagsInput) {
  if (Array.isArray(tagsInput)) {
    return tagsInput.map((tag) => String(tag).trim()).filter(Boolean);
  }
  if (typeof tagsInput === 'string') {
    return tagsInput.split(',').map((tag) => tag.trim()).filter(Boolean);
  }
  return [];
}

function toBoolean(value, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value === 'boolean') return value;
  return String(value).toLowerCase() === 'true';
}

function roleToAudience(user) {
  if (!user) return 'ALL';
  if (user.role === 'vendor') return 'VENDOR';
  if (user.role === 'admin') return 'ALL';
  return 'CUSTOMER';
}

function roleToTrackingRole(user) {
  if (!user) return 'GUEST';
  if (user.role === 'admin') return 'ADMIN';
  if (user.role === 'vendor') return 'VENDOR';
  return 'CUSTOMER';
}

function getAllowedAudiencesForUser(user) {
  const roleAudience = roleToAudience(user);
  if (roleAudience === 'VENDOR') return ['ALL', 'VENDOR'];
  if (roleAudience === 'CUSTOMER') return ['ALL', 'CUSTOMER'];
  return ['ALL'];
}

async function ensureUniqueSlug(base, excludeId) {
  let slug = slugify(base);
  let counter = 0;
  while (true) {
    const candidate = counter === 0 ? slug : `${slug}-${counter}`;
    const existing = await Post.findOne({ slug: candidate }).select('_id');
    if (!existing || String(existing._id) === String(excludeId || '')) return candidate;
    counter += 1;
  }
}

function getIpHash(req) {
  const ip = req.headers['x-forwarded-for'] || req.ip || '';
  const userAgent = req.headers['user-agent'] || '';
  return crypto.createHash('sha256').update(`${ip}|${userAgent}`).digest('hex');
}

function buildPublishedQuery(req) {
  const allowedAudiences = getAllowedAudiencesForUser(req.user);
  const query = { status: 'PUBLISHED', audience: { $in: allowedAudiences } };
  const { type, featured, q } = req.query;
  const tags = parseTags(req.query.tags);

  if (type && POST_TYPES.includes(type)) query.type = type;
  if (featured !== undefined) query.featured = toBoolean(featured);
  if (req.query.audience && POST_AUDIENCE.includes(req.query.audience)) {
    query.audience = allowedAudiences.includes(req.query.audience) ? req.query.audience : { $in: allowedAudiences };
  }
  if (tags.length > 0) query.tags = { $in: tags };
  if (q && String(q).trim()) query.$text = { $search: String(q).trim() };

  return query;
}

exports.getPublicPosts = async (req, res, next) => {
  try {
    const { page, limit, skip } = parsePagination(req.query);
    const query = buildPublishedQuery(req);
    const q = String(req.query.q || '').trim();

    const sort = req.query.q
      ? { score: { $meta: 'textScore' }, featured: -1, publishedAt: -1 }
      : { featured: -1, publishedAt: -1, createdAt: -1 };

    let posts = [];
    let total = 0;

    try {
      [posts, total] = await Promise.all([
        Post.find(query)
          .select(req.query.q ? { score: { $meta: 'textScore' } } : {})
          .sort(sort)
          .skip(skip)
          .limit(limit),
        Post.countDocuments(query)
      ]);
    } catch (error) {
      if (!q) throw error;
      // Fallback when text index is unavailable or query cannot use text search.
      const regexQuery = { ...query };
      delete regexQuery.$text;
      regexQuery.$or = [
        { title: { $regex: q, $options: 'i' } },
        { excerpt: { $regex: q, $options: 'i' } },
        { content: { $regex: q, $options: 'i' } }
      ];
      [posts, total] = await Promise.all([
        Post.find(regexQuery).sort({ featured: -1, publishedAt: -1, createdAt: -1 }).skip(skip).limit(limit),
        Post.countDocuments(regexQuery)
      ]);
    }

    return res.status(200).json({
      success: true,
      count: posts.length,
      total,
      pages: Math.ceil(total / limit),
      currentPage: page,
      data: posts
    });
  } catch (error) {
    return next(error);
  }
};

exports.getPublicPostBySlug = async (req, res, next) => {
  try {
    const query = {
      slug: String(req.params.slug || '').toLowerCase().trim(),
      status: 'PUBLISHED',
      audience: { $in: getAllowedAudiencesForUser(req.user) }
    };

    const post = await Post.findOne(query).populate('createdBy updatedBy', 'name email role');
    if (!post) return res.status(404).json({ success: false, message: 'Post not found' });

    return res.status(200).json({ success: true, data: post });
  } catch (error) {
    return next(error);
  }
};

exports.trackPostEvent = async (req, res, next) => {
  try {
    const eventType = EVENT_TYPES.includes(req.body?.eventType) ? req.body.eventType : 'VIEW';
    let post = null;

    if (req.body?.contentId && mongoose.Types.ObjectId.isValid(req.body.contentId)) {
      post = await Post.findById(req.body.contentId).select('_id status audience');
    } else if (req.body?.slug) {
      post = await Post.findOne({ slug: String(req.body.slug).toLowerCase().trim() }).select('_id status audience');
    }

    if (!post) return res.status(404).json({ success: false, message: 'Post not found' });
    if (post.status !== 'PUBLISHED') return res.status(403).json({ success: false, message: 'Cannot track unpublished posts' });

    const allowedAudiences = getAllowedAudiencesForUser(req.user);
    if (!allowedAudiences.includes(post.audience)) {
      return res.status(403).json({ success: false, message: 'Not allowed to track this audience-restricted post' });
    }

    const sessionId = sanitizeText(req.body?.sessionId);
    const ipHash = getIpHash(req);
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);

    let duplicateQuery = {
      contentType: 'POST',
      contentId: post._id,
      eventType,
      createdAt: { $gte: tenMinutesAgo }
    };
    if (sessionId) duplicateQuery.sessionId = sessionId;
    else duplicateQuery.ipHash = ipHash;

    const duplicate = await EngagementEvent.findOne(duplicateQuery).select('_id');
    if (duplicate) {
      return res.status(200).json({ success: true, data: { deduped: true } });
    }

    await EngagementEvent.create({
      contentType: 'POST',
      contentId: post._id,
      eventType,
      userId: req.user?._id,
      role: roleToTrackingRole(req.user),
      sessionId: sessionId || undefined,
      ipHash,
      userAgent: sanitizeText(req.headers['user-agent']),
      referrer: sanitizeText(req.headers.referer || req.headers.referrer || '')
    });

    if (eventType === 'VIEW') {
      await Post.updateOne({ _id: post._id }, { $inc: { viewCount: 1 }, $set: { lastViewedAt: new Date() } });
    }

    return res.status(201).json({ success: true, data: { tracked: true } });
  } catch (error) {
    return next(error);
  }
};

exports.listAdminPosts = async (req, res, next) => {
  try {
    const { page, limit, skip } = parsePagination(req.query);
    const query = {};

    if (req.query.type && POST_TYPES.includes(req.query.type)) query.type = req.query.type;
    if (req.query.status && POST_STATUS.includes(req.query.status)) query.status = req.query.status;
    if (req.query.audience && POST_AUDIENCE.includes(req.query.audience)) query.audience = req.query.audience;
    if (req.query.featured !== undefined) query.featured = toBoolean(req.query.featured);
    if (req.query.q && String(req.query.q).trim()) query.$text = { $search: String(req.query.q).trim() };

    const sort = req.query.q ? { score: { $meta: 'textScore' }, updatedAt: -1 } : { updatedAt: -1 };

    const [posts, total] = await Promise.all([
      Post.find(query).select(req.query.q ? { score: { $meta: 'textScore' } } : {}).sort(sort).skip(skip).limit(limit),
      Post.countDocuments(query)
    ]);

    return res.status(200).json({
      success: true,
      count: posts.length,
      total,
      pages: Math.ceil(total / limit),
      currentPage: page,
      data: posts
    });
  } catch (error) {
    return next(error);
  }
};

exports.createAdminPost = async (req, res, next) => {
  try {
    const payload = req.body || {};
    const title = sanitizeText(payload.title);
    const content = sanitizeRichText(payload.content);
    const type = payload.type;
    if (!title || !content || !POST_TYPES.includes(type)) {
      return res.status(400).json({ success: false, message: 'title, content, and valid type are required' });
    }

    const status = POST_STATUS.includes(payload.status) ? payload.status : 'DRAFT';
    const slug = await ensureUniqueSlug(payload.slug || title);

    const post = await Post.create({
      title,
      slug,
      excerpt: sanitizeText(payload.excerpt),
      content,
      type,
      status,
      featured: toBoolean(payload.featured),
      coverImageUrl: sanitizeText(payload.coverImageUrl),
      tags: parseTags(payload.tags),
      audience: POST_AUDIENCE.includes(payload.audience) ? payload.audience : 'ALL',
      meta: {
        metaTitle: sanitizeText(payload.meta?.metaTitle),
        metaDescription: sanitizeText(payload.meta?.metaDescription),
        ogImageUrl: sanitizeText(payload.meta?.ogImageUrl)
      },
      createdBy: req.user.id,
      updatedBy: req.user.id,
      publishedAt: status === 'PUBLISHED' ? new Date() : undefined
    });

    return res.status(201).json({ success: true, data: post });
  } catch (error) {
    return next(error);
  }
};

exports.updateAdminPost = async (req, res, next) => {
  try {
    const post = await Post.findById(req.params.id);
    if (!post) return res.status(404).json({ success: false, message: 'Post not found' });

    const payload = req.body || {};
    if (payload.title !== undefined) post.title = sanitizeText(payload.title);
    if (payload.excerpt !== undefined) post.excerpt = sanitizeText(payload.excerpt);
    if (payload.content !== undefined) post.content = sanitizeRichText(payload.content);
    if (payload.type && POST_TYPES.includes(payload.type)) post.type = payload.type;
    if (payload.status && POST_STATUS.includes(payload.status)) post.status = payload.status;
    if (payload.featured !== undefined) post.featured = toBoolean(payload.featured);
    if (payload.coverImageUrl !== undefined) post.coverImageUrl = sanitizeText(payload.coverImageUrl);
    if (payload.tags !== undefined) post.tags = parseTags(payload.tags);
    if (payload.audience && POST_AUDIENCE.includes(payload.audience)) post.audience = payload.audience;
    if (payload.meta) {
      post.meta = {
        metaTitle: sanitizeText(payload.meta.metaTitle),
        metaDescription: sanitizeText(payload.meta.metaDescription),
        ogImageUrl: sanitizeText(payload.meta.ogImageUrl)
      };
    }

    if (payload.slug !== undefined || payload.title !== undefined) {
      post.slug = await ensureUniqueSlug(payload.slug || payload.title || post.title, post._id);
    }

    if (post.status === 'PUBLISHED' && !post.publishedAt) post.publishedAt = new Date();
    if (post.status !== 'PUBLISHED') post.publishedAt = undefined;
    post.updatedBy = req.user.id;

    await post.save();
    return res.status(200).json({ success: true, data: post });
  } catch (error) {
    return next(error);
  }
};

exports.publishAdminPost = async (req, res, next) => {
  try {
    const post = await Post.findById(req.params.id);
    if (!post) return res.status(404).json({ success: false, message: 'Post not found' });

    post.status = 'PUBLISHED';
    post.publishedAt = new Date();
    post.updatedBy = req.user.id;
    await post.save();

    return res.status(200).json({ success: true, data: post });
  } catch (error) {
    return next(error);
  }
};

exports.unpublishAdminPost = async (req, res, next) => {
  try {
    const post = await Post.findById(req.params.id);
    if (!post) return res.status(404).json({ success: false, message: 'Post not found' });

    const nextStatus = req.body?.status === 'ARCHIVED' ? 'ARCHIVED' : 'DRAFT';
    post.status = nextStatus;
    post.publishedAt = undefined;
    post.updatedBy = req.user.id;
    await post.save();

    return res.status(200).json({ success: true, data: post });
  } catch (error) {
    return next(error);
  }
};

exports.deleteAdminPost = async (req, res, next) => {
  try {
    const post = await Post.findById(req.params.id);
    if (!post) return res.status(404).json({ success: false, message: 'Post not found' });

    post.status = 'ARCHIVED';
    post.publishedAt = undefined;
    post.updatedBy = req.user.id;
    await post.save();

    return res.status(200).json({ success: true, message: 'Post archived', data: post });
  } catch (error) {
    return next(error);
  }
};

exports.getAdminPostsAnalytics = async (req, res, next) => {
  try {
    const { type, dateFrom, dateTo } = req.query;
    const match = { contentType: 'POST', eventType: 'VIEW' };

    if (dateFrom || dateTo) {
      match.createdAt = {};
      if (dateFrom) match.createdAt.$gte = new Date(dateFrom);
      if (dateTo) match.createdAt.$lte = new Date(dateTo);
    }

    const postMatch = {};
    if (type && POST_TYPES.includes(type)) postMatch.type = type;

    const postIds = await Post.find(postMatch).select('_id');
    if (type) {
      match.contentId = { $in: postIds.map((p) => p._id) };
    }

    const [viewsByDay, topRows, audienceRows, featuredRows, totalViews] = await Promise.all([
      EngagementEvent.aggregate([
        { $match: match },
        {
          $group: {
            _id: { day: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } } },
            views: { $sum: 1 }
          }
        },
        { $sort: { '_id.day': 1 } }
      ]),
      EngagementEvent.aggregate([
        { $match: match },
        { $group: { _id: '$contentId', views: { $sum: 1 } } },
        { $sort: { views: -1 } },
        { $limit: 20 }
      ]),
      EngagementEvent.aggregate([
        { $match: match },
        { $group: { _id: '$role', views: { $sum: 1 } } },
        { $sort: { views: -1 } }
      ]),
      EngagementEvent.aggregate([
        { $match: match },
        {
          $lookup: {
            from: 'posts',
            localField: 'contentId',
            foreignField: '_id',
            as: 'post'
          }
        },
        { $unwind: '$post' },
        { $match: { 'post.featured': true } },
        { $group: { _id: '$contentId', views: { $sum: 1 } } },
        { $sort: { views: -1 } },
        { $limit: 10 }
      ]),
      EngagementEvent.countDocuments(match)
    ]);

    const topIds = topRows.map((row) => row._id);
    const featuredIds = featuredRows.map((row) => row._id);
    const uniqueIds = [...new Set([...topIds.map(String), ...featuredIds.map(String)])].map((id) => new mongoose.Types.ObjectId(id));
    const postDocs = uniqueIds.length ? await Post.find({ _id: { $in: uniqueIds } }).select('_id title slug type featured viewCount') : [];
    const postMap = new Map(postDocs.map((p) => [String(p._id), p]));

    return res.status(200).json({
      success: true,
      data: {
        totalViews,
        viewsByDay: viewsByDay.map((row) => ({ date: row._id.day, views: row.views })),
        topPosts: topRows.map((row) => {
          const post = postMap.get(String(row._id));
          return {
            postId: String(row._id),
            title: post?.title || 'Deleted post',
            slug: post?.slug || null,
            type: post?.type || null,
            views: row.views
          };
        }),
        viewsByAudience: audienceRows.map((row) => ({ role: row._id, views: row.views })),
        featuredPostPerformance: featuredRows.map((row) => {
          const post = postMap.get(String(row._id));
          return {
            postId: String(row._id),
            title: post?.title || 'Deleted post',
            slug: post?.slug || null,
            views: row.views
          };
        })
      }
    });
  } catch (error) {
    return next(error);
  }
};

exports.getSinglePostAnalytics = async (req, res, next) => {
  try {
    const postId = req.params.id;
    if (!mongoose.Types.ObjectId.isValid(postId)) {
      return res.status(400).json({ success: false, message: 'Invalid post id' });
    }

    const match = {
      contentType: 'POST',
      contentId: new mongoose.Types.ObjectId(postId),
      eventType: 'VIEW'
    };

    if (req.query.dateFrom || req.query.dateTo) {
      match.createdAt = {};
      if (req.query.dateFrom) match.createdAt.$gte = new Date(req.query.dateFrom);
      if (req.query.dateTo) match.createdAt.$lte = new Date(req.query.dateTo);
    }

    const [viewsByDay, totalViews, viewsByRole] = await Promise.all([
      EngagementEvent.aggregate([
        { $match: match },
        {
          $group: {
            _id: { day: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } } },
            views: { $sum: 1 }
          }
        },
        { $sort: { '_id.day': 1 } }
      ]),
      EngagementEvent.countDocuments(match),
      EngagementEvent.aggregate([{ $match: match }, { $group: { _id: '$role', views: { $sum: 1 } } }, { $sort: { views: -1 } }])
    ]);

    return res.status(200).json({
      success: true,
      data: {
        totalViews,
        viewsByDay: viewsByDay.map((row) => ({ date: row._id.day, views: row.views })),
        viewsByAudience: viewsByRole.map((row) => ({ role: row._id, views: row.views }))
      }
    });
  } catch (error) {
    return next(error);
  }
};

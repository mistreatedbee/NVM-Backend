const PlaybookModule = require('../models/PlaybookModule');
const PlaybookLesson = require('../models/PlaybookLesson');

function slugify(input) {
  const fallback = `item-${Date.now()}`;
  if (!input) return fallback;
  return String(input)
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120) || fallback;
}

async function ensureUniqueSlug(model, base, excludeId) {
  const root = slugify(base);
  let i = 0;
  while (true) {
    const candidate = i === 0 ? root : `${root}-${i}`;
    const existing = await model.findOne({ slug: candidate }).select('_id');
    if (!existing || String(existing._id) === String(excludeId || '')) return candidate;
    i += 1;
  }
}

exports.listModulesAdmin = async (req, res, next) => {
  try {
    const modules = await PlaybookModule.find({}).sort({ order: 1, createdAt: 1 });
    return res.status(200).json({ success: true, data: modules });
  } catch (error) {
    return next(error);
  }
};

exports.listLessonsAdmin = async (req, res, next) => {
  try {
    const query = {};
    if (req.query.moduleId) query.moduleId = req.query.moduleId;
    const lessons = await PlaybookLesson.find(query).populate('moduleId', 'title slug').sort({ moduleId: 1, order: 1, createdAt: 1 });
    return res.status(200).json({ success: true, data: lessons });
  } catch (error) {
    return next(error);
  }
};

exports.createPlaybookModule = async (req, res, next) => {
  try {
    const title = String(req.body?.title || '').trim();
    if (!title) return res.status(400).json({ success: false, message: 'title is required' });
    const module = await PlaybookModule.create({
      title,
      slug: await ensureUniqueSlug(PlaybookModule, req.body.slug || title),
      description: String(req.body.description || '').trim() || undefined,
      order: Number(req.body.order || 0),
      status: req.body.status === 'PUBLISHED' ? 'PUBLISHED' : 'DRAFT'
    });
    return res.status(201).json({ success: true, data: module });
  } catch (error) {
    return next(error);
  }
};

exports.updatePlaybookModule = async (req, res, next) => {
  try {
    const module = await PlaybookModule.findById(req.params.id);
    if (!module) return res.status(404).json({ success: false, message: 'Module not found' });
    if (req.body.title !== undefined) module.title = String(req.body.title || '').trim();
    if (req.body.description !== undefined) module.description = String(req.body.description || '').trim();
    if (req.body.order !== undefined) module.order = Number(req.body.order || 0);
    if (req.body.status && ['DRAFT', 'PUBLISHED'].includes(req.body.status)) module.status = req.body.status;
    if (req.body.slug !== undefined || req.body.title !== undefined) {
      module.slug = await ensureUniqueSlug(PlaybookModule, req.body.slug || req.body.title || module.title, module._id);
    }
    await module.save();
    return res.status(200).json({ success: true, data: module });
  } catch (error) {
    return next(error);
  }
};

exports.publishPlaybookModule = async (req, res, next) => {
  try {
    const module = await PlaybookModule.findById(req.params.id);
    if (!module) return res.status(404).json({ success: false, message: 'Module not found' });
    module.status = 'PUBLISHED';
    await module.save();
    return res.status(200).json({ success: true, data: module });
  } catch (error) {
    return next(error);
  }
};

exports.createPlaybookLesson = async (req, res, next) => {
  try {
    const title = String(req.body?.title || '').trim();
    if (!title || !req.body?.moduleId) {
      return res.status(400).json({ success: false, message: 'title and moduleId are required' });
    }
    const module = await PlaybookModule.findById(req.body.moduleId);
    if (!module) return res.status(404).json({ success: false, message: 'Module not found' });

    const checklistItems = Array.isArray(req.body.checklistItems)
      ? req.body.checklistItems
          .map((item) => ({ text: String(item.text || '').trim(), key: String(item.key || '').trim() }))
          .filter((item) => item.text && item.key)
      : [];

    const lesson = await PlaybookLesson.create({
      moduleId: module._id,
      title,
      slug: await ensureUniqueSlug(PlaybookLesson, req.body.slug || title),
      content: String(req.body.content || '').trim(),
      checklistItems,
      estimatedTimeMinutes: Number(req.body.estimatedTimeMinutes || 10),
      order: Number(req.body.order || 0),
      status: req.body.status === 'PUBLISHED' ? 'PUBLISHED' : 'DRAFT'
    });

    return res.status(201).json({ success: true, data: lesson });
  } catch (error) {
    return next(error);
  }
};

exports.updatePlaybookLesson = async (req, res, next) => {
  try {
    const lesson = await PlaybookLesson.findById(req.params.id);
    if (!lesson) return res.status(404).json({ success: false, message: 'Lesson not found' });

    if (req.body.moduleId) {
      const module = await PlaybookModule.findById(req.body.moduleId);
      if (!module) return res.status(404).json({ success: false, message: 'Module not found' });
      lesson.moduleId = module._id;
    }
    if (req.body.title !== undefined) lesson.title = String(req.body.title || '').trim();
    if (req.body.content !== undefined) lesson.content = String(req.body.content || '').trim();
    if (req.body.order !== undefined) lesson.order = Number(req.body.order || 0);
    if (req.body.estimatedTimeMinutes !== undefined) lesson.estimatedTimeMinutes = Number(req.body.estimatedTimeMinutes || 10);
    if (req.body.status && ['DRAFT', 'PUBLISHED'].includes(req.body.status)) lesson.status = req.body.status;
    if (Array.isArray(req.body.checklistItems)) {
      lesson.checklistItems = req.body.checklistItems
        .map((item) => ({ text: String(item.text || '').trim(), key: String(item.key || '').trim() }))
        .filter((item) => item.text && item.key);
    }
    if (req.body.slug !== undefined || req.body.title !== undefined) {
      lesson.slug = await ensureUniqueSlug(PlaybookLesson, req.body.slug || req.body.title || lesson.title, lesson._id);
    }

    await lesson.save();
    return res.status(200).json({ success: true, data: lesson });
  } catch (error) {
    return next(error);
  }
};

exports.publishPlaybookLesson = async (req, res, next) => {
  try {
    const lesson = await PlaybookLesson.findById(req.params.id);
    if (!lesson) return res.status(404).json({ success: false, message: 'Lesson not found' });
    lesson.status = 'PUBLISHED';
    await lesson.save();
    return res.status(200).json({ success: true, data: lesson });
  } catch (error) {
    return next(error);
  }
};

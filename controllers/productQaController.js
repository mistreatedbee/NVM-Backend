const Product = require('../models/Product');
const Vendor = require('../models/Vendor');
const ProductQuestion = require('../models/ProductQuestion');
const ProductAnswer = require('../models/ProductAnswer');

function parsePagination(query) {
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const limit = Math.min(50, Math.max(1, parseInt(query.limit, 10) || 10));
  return { page, limit, skip: (page - 1) * limit };
}

exports.createQuestion = async (req, res, next) => {
  try {
    if (req.user.role !== 'customer') {
      return res.status(403).json({ success: false, message: 'Only customers can ask questions' });
    }
    const product = await Product.findOne({ _id: req.params.productId, status: 'PUBLISHED', isActive: true }).select('_id');
    if (!product) return res.status(404).json({ success: false, message: 'Product not found' });

    const question = String(req.body.question || '').trim();
    if (!question) return res.status(400).json({ success: false, message: 'question is required' });

    const created = await ProductQuestion.create({
      productId: product._id,
      userId: req.user.id,
      question,
      status: 'PUBLISHED'
    });
    return res.status(201).json({ success: true, data: created });
  } catch (error) {
    return next(error);
  }
};

exports.getQuestions = async (req, res, next) => {
  try {
    const product = await Product.findOne({ _id: req.params.productId, status: 'PUBLISHED', isActive: true }).select('_id');
    if (!product) return res.status(404).json({ success: false, message: 'Product not found' });

    const { page, limit, skip } = parsePagination(req.query);
    const [rows, total] = await Promise.all([
      ProductQuestion.find({ productId: product._id, status: 'PUBLISHED' })
        .populate('userId', 'name avatar')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      ProductQuestion.countDocuments({ productId: product._id, status: 'PUBLISHED' })
    ]);

    const answers = await ProductAnswer.find({ questionId: { $in: rows.map((r) => r._id) } })
      .populate('vendorId', 'storeName')
      .populate('adminId', 'name')
      .lean();
    const answerMap = new Map(answers.map((a) => [String(a.questionId), a]));

    return res.status(200).json({
      success: true,
      data: rows.map((row) => ({ ...row, answer: answerMap.get(String(row._id)) || null })),
      total,
      page,
      pages: Math.ceil(total / limit),
      limit
    });
  } catch (error) {
    return next(error);
  }
};

exports.answerQuestion = async (req, res, next) => {
  try {
    const question = await ProductQuestion.findById(req.params.questionId).populate('productId', 'vendor status isActive');
    if (!question || !question.productId || question.productId.status !== 'PUBLISHED' || !question.productId.isActive) {
      return res.status(404).json({ success: false, message: 'Question not found' });
    }

    const answerText = String(req.body.answer || '').trim();
    if (!answerText) return res.status(400).json({ success: false, message: 'answer is required' });

    let vendorId = null;
    if (req.user.role === 'vendor') {
      const vendor = await Vendor.findOne({ user: req.user.id }).select('_id');
      if (!vendor || String(vendor._id) !== String(question.productId.vendor)) {
        return res.status(403).json({ success: false, message: 'Not authorized to answer this question' });
      }
      vendorId = vendor._id;
    } else if (req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Not authorized' });
    }

    const payload = vendorId
      ? { questionId: question._id, vendorId, answer: answerText }
      : { questionId: question._id, adminId: req.user.id, answer: answerText };

    const data = await ProductAnswer.findOneAndUpdate(
      { questionId: question._id },
      payload,
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    return res.status(200).json({ success: true, data });
  } catch (error) {
    return next(error);
  }
};

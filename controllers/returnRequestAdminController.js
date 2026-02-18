const ReturnRequest = require('../models/ReturnRequest');

exports.listReturnRequests = async (req, res, next) => {
  try {
    const query = {};
    if (req.query.status) query.status = req.query.status;
    const data = await ReturnRequest.find(query)
      .sort({ createdAt: -1 })
      .populate('orderId', 'orderNumber status paymentStatus')
      .populate('userId', 'name email');
    return res.status(200).json({ success: true, data });
  } catch (error) {
    return next(error);
  }
};

exports.updateReturnRequest = async (req, res, next) => {
  try {
    const status = String(req.body?.status || '').toUpperCase();
    if (!['APPROVED', 'REJECTED', 'REFUNDED'].includes(status)) {
      return res.status(400).json({ success: false, message: 'Invalid status' });
    }
    const data = await ReturnRequest.findByIdAndUpdate(
      req.params.id,
      { status, adminNote: req.body?.adminNote || '' },
      { new: true }
    ).populate('orderId', 'orderNumber status paymentStatus');
    if (!data) return res.status(404).json({ success: false, message: 'Return request not found' });
    return res.status(200).json({ success: true, data });
  } catch (error) {
    return next(error);
  }
};

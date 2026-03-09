const mongoose = require('mongoose');

const invoiceLineItemSchema = new mongoose.Schema(
  {
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
      required: true
    },
    titleSnapshot: {
      type: String,
      required: true
    },
    skuSnapshot: String,
    qty: {
      type: Number,
      required: true,
      min: 1
    },
    unitPrice: {
      type: Number,
      required: true,
      min: 0
    },
    lineTotal: {
      type: Number,
      required: true,
      min: 0
    }
  },
  { _id: false }
);

const invoiceSchema = new mongoose.Schema(
  {
    invoiceNumber: {
      type: String,
      required: true,
      unique: true,
      trim: true
    },
    orderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Order',
      required: true
    },
    customerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    vendorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Vendor',
      default: null
    },
    type: {
      type: String,
      enum: ['CUSTOMER', 'VENDOR'],
      required: true
    },
    status: {
      type: String,
      enum: ['ISSUED', 'VOID', 'REFUNDED'],
      default: 'ISSUED'
    },
    currency: {
      type: String,
      enum: ['ZAR'],
      default: 'ZAR'
    },
    billingDetails: {
      name: String,
      email: String,
      phone: String,
      address: {
        fullName: String,
        street: String,
        city: String,
        state: String,
        country: String,
        zipCode: String
      }
    },
    vendorDetails: {
      storeName: String,
      contact: {
        name: String,
        email: String,
        phone: String
      },
      location: {
        country: String,
        state: String,
        city: String,
        suburb: String,
        addressLine: String
      },
      banking: {
        bankName: String,
        accountHolder: String,
        accountNumber: String,
        branchCode: String,
        accountType: String,
        payoutEmail: String,
        payoutReference: String
      }
    },
    lineItems: {
      type: [invoiceLineItemSchema],
      default: []
    },
    totals: {
      subtotal: { type: Number, required: true, min: 0 },
      deliveryFee: { type: Number, default: 0, min: 0 },
      discount: { type: Number, default: 0, min: 0 },
      tax: { type: Number, default: 0, min: 0 },
      total: { type: Number, required: true, min: 0 }
    },
    issuedAt: {
      type: Date,
      default: Date.now
    },
    pdf: {
      pdfUrl: String,
      pdfStorageKey: String,
      generatedAt: Date
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {}
    },
    voidReason: String,
    voidedAt: Date,
    voidedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    }
  },
  {
    timestamps: true
  }
);

invoiceSchema.index({ orderId: 1 });
invoiceSchema.index({ customerId: 1, issuedAt: -1 });
invoiceSchema.index({ vendorId: 1, issuedAt: -1 });
invoiceSchema.index({ type: 1, orderId: 1, vendorId: 1 }, { unique: true });

module.exports = mongoose.model('Invoice', invoiceSchema);

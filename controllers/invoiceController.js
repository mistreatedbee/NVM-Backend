const Order = require('../models/Order');
const Vendor = require('../models/Vendor');
// const PDFDocument = require('pdfkit'); // Install with: npm install pdfkit
const fs = require('fs');
const path = require('path');

// @desc    Generate invoice for an order
// @route   GET /api/invoices/:orderId
// @access  Private (Customer/Vendor/Admin)
exports.generateInvoice = async (req, res, next) => {
  return res.status(501).json({
    success: false,
    message: 'Invoice generation requires pdfkit package. Run: npm install pdfkit'
  });
  /* Disabled until pdfkit is installed
  try {
    const order = await Order.findById(req.params.orderId)
      .populate('customer', 'name email phone')
      .populate('items.product', 'name')
      .populate('items.vendor', 'storeName email phone address bankDetails');

    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    // Check authorization
    if (
      req.user.role !== 'admin' &&
      order.customer.toString() !== req.user.id &&
      !order.items.some(item => item.vendor && item.vendor.user && item.vendor.user.toString() === req.user.id)
    ) {
      return res.status(403).json({ success: false, message: 'Not authorized to view this invoice' });
    }

    // Create PDF document
    const doc = new PDFDocument({ margin: 50 });

    // Set response headers
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=invoice-${order.orderNumber}.pdf`);

    // Pipe PDF to response
    doc.pipe(res);

    // Add NVM Logo/Header
    doc.fontSize(24).font('Helvetica-Bold').text('NVM MARKETPLACE', 50, 50);
    doc.fontSize(10).font('Helvetica').text('Ndingoho Vendor Markets', 50, 80);
    doc.text('South Africa', 50, 95);
    doc.moveDown();

    // Invoice Title
    doc.fontSize(20).font('Helvetica-Bold').text('TAX INVOICE', 50, 130);
    doc.fontSize(10).font('Helvetica').text(`Invoice Number: ${order.orderNumber}`, 50, 160);
    doc.text(`Date: ${new Date(order.createdAt).toLocaleDateString('en-ZA', { 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    })}`, 50, 175);
    doc.text(`Payment Status: ${order.paymentStatus.toUpperCase()}`, 50, 190);

    // Draw line
    doc.moveTo(50, 210).lineTo(550, 210).stroke();

    // Customer Details
    doc.fontSize(12).font('Helvetica-Bold').text('BILL TO:', 50, 230);
    doc.fontSize(10).font('Helvetica')
      .text(order.shippingAddress.fullName, 50, 250)
      .text(order.shippingAddress.street, 50, 265)
      .text(`${order.shippingAddress.city}, ${order.shippingAddress.state}`, 50, 280)
      .text(`${order.shippingAddress.zipCode}, ${order.shippingAddress.country}`, 50, 295)
      .text(`Phone: ${order.shippingAddress.phone}`, 50, 310);

    // Group items by vendor
    const itemsByVendor = {};
    order.items.forEach(item => {
      const vendorId = item.vendor._id.toString();
      if (!itemsByVendor[vendorId]) {
        itemsByVendor[vendorId] = {
          vendor: item.vendor,
          items: []
        };
      }
      itemsByVendor[vendorId].items.push(item);
    });

    let yPosition = 350;

    // Iterate through each vendor
    Object.values(itemsByVendor).forEach((vendorGroup, index) => {
      const vendor = vendorGroup.vendor;
      
      // Vendor Details
      doc.fontSize(12).font('Helvetica-Bold').text(`VENDOR ${index + 1}:`, 50, yPosition);
      yPosition += 20;
      
      doc.fontSize(10).font('Helvetica')
        .text(`Store Name: ${vendor.storeName}`, 50, yPosition);
      yPosition += 15;
      
      doc.text(`Email: ${vendor.email}`, 50, yPosition);
      yPosition += 15;
      
      doc.text(`Phone: ${vendor.phone}`, 50, yPosition);
      yPosition += 15;
      
      if (vendor.address) {
        doc.text(`Address: ${vendor.address.street}, ${vendor.address.city}, ${vendor.address.state}`, 50, yPosition);
        yPosition += 15;
      }
      
      yPosition += 10;

      // Items Table Header
      doc.fontSize(10).font('Helvetica-Bold');
      doc.text('ITEM', 50, yPosition);
      doc.text('QTY', 300, yPosition);
      doc.text('PRICE', 370, yPosition);
      doc.text('TOTAL', 470, yPosition);
      yPosition += 15;
      
      doc.moveTo(50, yPosition).lineTo(550, yPosition).stroke();
      yPosition += 10;

      // Items
      doc.font('Helvetica');
      vendorGroup.items.forEach(item => {
        if (yPosition > 700) {
          doc.addPage();
          yPosition = 50;
        }
        
        doc.text(item.name, 50, yPosition, { width: 230 });
        doc.text(item.quantity.toString(), 300, yPosition);
        doc.text(`R ${item.price.toFixed(2)}`, 370, yPosition);
        doc.text(`R ${item.subtotal.toFixed(2)}`, 470, yPosition);
        yPosition += 20;
      });

      yPosition += 10;

      // Banking Details for this vendor
      if (vendor.bankDetails && (order.paymentMethod === 'eft' || order.paymentMethod === 'bank-transfer')) {
        doc.fontSize(11).font('Helvetica-Bold').text('PAYMENT DETAILS (EFT):', 50, yPosition);
        yPosition += 20;
        
        doc.fontSize(10).font('Helvetica')
          .text(`Bank Name: ${vendor.bankDetails.bankName}`, 50, yPosition);
        yPosition += 15;
        
        doc.text(`Account Holder: ${vendor.bankDetails.accountHolderName}`, 50, yPosition);
        yPosition += 15;
        
        doc.text(`Account Number: ${vendor.bankDetails.accountNumber}`, 50, yPosition);
        yPosition += 15;
        
        doc.text(`Branch Code: ${vendor.bankDetails.branchCode}`, 50, yPosition);
        yPosition += 15;
        
        doc.text(`Account Type: ${vendor.bankDetails.accountType.toUpperCase()}`, 50, yPosition);
        yPosition += 15;
        
        if (vendor.bankDetails.swiftCode) {
          doc.text(`Swift Code: ${vendor.bankDetails.swiftCode}`, 50, yPosition);
          yPosition += 15;
        }
        
        yPosition += 10;
        doc.fontSize(9).font('Helvetica-Oblique')
          .text('Please use order number as reference when making payment', 50, yPosition);
        yPosition += 25;
      }

      doc.moveTo(50, yPosition).lineTo(550, yPosition).stroke();
      yPosition += 20;
    });

    // Order Summary
    if (yPosition > 650) {
      doc.addPage();
      yPosition = 50;
    }

    doc.fontSize(12).font('Helvetica-Bold').text('ORDER SUMMARY', 350, yPosition);
    yPosition += 20;

    doc.fontSize(10).font('Helvetica');
    doc.text('Subtotal:', 350, yPosition);
    doc.text(`R ${order.subtotal.toFixed(2)}`, 470, yPosition);
    yPosition += 15;

    if (order.shippingCost > 0) {
      doc.text('Shipping:', 350, yPosition);
      doc.text(`R ${order.shippingCost.toFixed(2)}`, 470, yPosition);
      yPosition += 15;
    }

    if (order.tax > 0) {
      doc.text('Tax (VAT):', 350, yPosition);
      doc.text(`R ${order.tax.toFixed(2)}`, 470, yPosition);
      yPosition += 15;
    }

    if (order.discount > 0) {
      doc.text('Discount:', 350, yPosition);
      doc.text(`-R ${order.discount.toFixed(2)}`, 470, yPosition);
      yPosition += 15;
    }

    doc.moveTo(350, yPosition).lineTo(550, yPosition).stroke();
    yPosition += 10;

    doc.fontSize(12).font('Helvetica-Bold');
    doc.text('TOTAL:', 350, yPosition);
    doc.text(`R ${order.total.toFixed(2)}`, 470, yPosition);

    // Footer
    doc.fontSize(8).font('Helvetica').text(
      'Thank you for shopping with NVM Marketplace!',
      50,
      750,
      { align: 'center', width: 500 }
    );
    
    doc.text(
      'For any queries, please contact the vendor directly or visit www.nvmmarketplace.co.za',
      50,
      765,
      { align: 'center', width: 500 }
    );

    // Finalize PDF
    doc.end();
  } catch (error) {
    console.error('Invoice generation error:', error);
    next(error);
  }
  */
};

// @desc    Get invoice data (JSON format)
// @route   GET /api/invoices/:orderId/data
// @access  Private (Customer/Vendor/Admin)
exports.getInvoiceData = async (req, res, next) => {
  try {
    const order = await Order.findById(req.params.orderId)
      .populate('customer', 'name email phone')
      .populate('items.product', 'name')
      .populate('items.vendor', 'storeName email phone address bankDetails');

    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    // Check authorization
    if (
      req.user.role !== 'admin' &&
      order.customer._id.toString() !== req.user.id &&
      !order.items.some(item => {
        const vendor = item.vendor;
        return vendor && vendor.user && vendor.user.toString() === req.user.id;
      })
    ) {
      return res.status(403).json({ success: false, message: 'Not authorized to view this invoice' });
    }

    // Group items by vendor
    const itemsByVendor = {};
    order.items.forEach(item => {
      const vendorId = item.vendor._id.toString();
      if (!itemsByVendor[vendorId]) {
        itemsByVendor[vendorId] = {
          vendor: {
            id: item.vendor._id,
            storeName: item.vendor.storeName,
            email: item.vendor.email,
            phone: item.vendor.phone,
            address: item.vendor.address,
            bankDetails: order.paymentMethod === 'eft' || order.paymentMethod === 'bank-transfer' 
              ? item.vendor.bankDetails 
              : null
          },
          items: []
        };
      }
      itemsByVendor[vendorId].items.push({
        id: item._id,
        productId: item.product._id,
        name: item.name,
        image: item.image,
        price: item.price,
        quantity: item.quantity,
        subtotal: item.subtotal
      });
    });

    const invoiceData = {
      orderNumber: order.orderNumber,
      date: order.createdAt,
      customer: {
        name: order.customer.name,
        email: order.customer.email,
        phone: order.customer.phone || order.shippingAddress.phone
      },
      shippingAddress: order.shippingAddress,
      vendors: Object.values(itemsByVendor),
      subtotal: order.subtotal,
      shippingCost: order.shippingCost,
      tax: order.tax,
      discount: order.discount,
      total: order.total,
      paymentMethod: order.paymentMethod,
      paymentStatus: order.paymentStatus,
      fulfillmentMethod: order.fulfillmentMethod
    };

    res.status(200).json({
      success: true,
      data: invoiceData
    });
  } catch (error) {
    next(error);
  }
};


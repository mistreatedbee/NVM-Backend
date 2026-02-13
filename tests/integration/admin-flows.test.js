const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const { MongoMemoryServer } = require('mongodb-memory-server');

const app = require('../../app');
const User = require('../../models/User');
const Vendor = require('../../models/Vendor');
const Product = require('../../models/Product');
const Category = require('../../models/Category');

let mongoServer;

function authHeaderFor(userId) {
  const token = jwt.sign(
    { id: String(userId) },
    process.env.JWT_SECRET || 'test-secret',
    { expiresIn: '1h' }
  );
  return `Bearer ${token}`;
}

async function seedUsersAndVendor() {
  const admin = await User.create({
    name: 'Admin',
    email: 'admin@test.com',
    password: 'password123',
    role: 'admin',
    isVerified: true
  });

  const vendorUser = await User.create({
    name: 'Vendor User',
    email: 'vendor@test.com',
    password: 'password123',
    role: 'vendor',
    isVerified: true
  });

  const customer = await User.create({
    name: 'Customer',
    email: 'customer@test.com',
    password: 'password123',
    role: 'customer',
    isVerified: true
  });

  const vendor = await Vendor.create({
    user: vendorUser._id,
    storeName: 'Vendor Store',
    description: 'Vendor store description',
    category: 'electronics',
    businessType: 'business',
    email: 'vendor-store@test.com',
    phone: '0123456789',
    address: {
      street: '1 Test Street',
      city: 'Cape Town',
      state: 'Western Cape',
      country: 'South Africa',
      zipCode: '8001'
    },
    status: 'approved',
    accountStatus: 'active',
    isActive: true
  });

  return { admin, vendorUser, customer, vendor };
}

test.before(async () => {
  process.env.JWT_SECRET = 'test-secret';
  const externalMongoUri = process.env.TEST_MONGO_URI || process.env.MONGO_URI;

  if (externalMongoUri) {
    await mongoose.connect(externalMongoUri, { dbName: 'nvm-tests' });
    return;
  }

  mongoServer = await Promise.race([
    MongoMemoryServer.create({
      instance: { dbName: 'nvm-tests' }
    }),
    new Promise((_, reject) => {
      setTimeout(() => {
        reject(new Error('MongoMemoryServer startup timeout. Set TEST_MONGO_URI to use an external MongoDB instance.'));
      }, 60000);
    })
  ]);

  await mongoose.connect(mongoServer.getUri(), { dbName: 'nvm-tests' });
});

test.after(async () => {
  if (mongoose.connection.readyState === 1) {
    await mongoose.connection.dropDatabase();
    await mongoose.connection.close();
  }
  if (mongoServer) {
    await mongoServer.stop();
  }
});

test.beforeEach(async () => {
  const collections = mongoose.connection.collections;
  for (const name of Object.keys(collections)) {
    await collections[name].deleteMany({});
  }
});

test('vendor admin flows: status update, document review, compliance, activity logs', async () => {
  const { admin, vendorUser, vendor } = await seedUsersAndVendor();

  const adminAuth = authHeaderFor(admin._id);
  const vendorAuth = authHeaderFor(vendorUser._id);

  const statusRes = await request(app)
    .put(`/api/vendors/${vendor._id}/status`)
    .set('Authorization', adminAuth)
    .send({ accountStatus: 'suspended', reason: 'Policy breach' })
    .expect(200);

  assert.equal(statusRes.body.success, true);
  assert.equal(statusRes.body.data.accountStatus, 'suspended');
  assert.equal(statusRes.body.data.status, 'suspended');

  const userAfterSuspend = await User.findById(vendorUser._id);
  assert.equal(userAfterSuspend.isActive, false);

  const documentUploadRes = await request(app)
    .post(`/api/vendors/${vendor._id}/documents`)
    .set('Authorization', vendorAuth)
    .field('type', 'business-registration')
    .field('name', 'Business Registration Certificate')
    .field('url', 'https://example.com/docs/business-registration.pdf')
    .expect(201);

  assert.equal(documentUploadRes.body.success, true);
  assert.equal(documentUploadRes.body.data.type, 'business-registration');

  await request(app)
    .post(`/api/vendors/${vendor._id}/documents`)
    .set('Authorization', vendorAuth)
    .field('type', 'tax-certificate')
    .field('name', 'Tax Certificate')
    .field('url', 'https://example.com/docs/tax-certificate.pdf')
    .expect(201);

  const documentId = documentUploadRes.body.data._id;
  const reviewDocRes = await request(app)
    .put(`/api/vendors/${vendor._id}/documents/${documentId}/review`)
    .set('Authorization', adminAuth)
    .send({ action: 'verify' })
    .expect(200);

  assert.equal(reviewDocRes.body.success, true);
  assert.equal(reviewDocRes.body.data.status, 'verified');

  const complianceRes = await request(app)
    .post(`/api/vendors/${vendor._id}/compliance-checks`)
    .set('Authorization', adminAuth)
    .send({
      checkType: 'kyc',
      status: 'passed',
      notes: 'KYC validated by admin'
    })
    .expect(201);

  assert.equal(complianceRes.body.success, true);
  assert.equal(complianceRes.body.data.checkType, 'kyc');
  assert.equal(complianceRes.body.data.status, 'passed');

  const logsRes = await request(app)
    .get(`/api/vendors/${vendor._id}/activity-logs?page=1&limit=2`)
    .set('Authorization', adminAuth)
    .expect(200);

  assert.equal(logsRes.body.success, true);
  assert.equal(logsRes.body.currentPage, 1);
  assert.equal(logsRes.body.pages >= 1, true);
  assert.equal(logsRes.body.count <= 2, true);

  const docsRes = await request(app)
    .get(`/api/vendors/${vendor._id}/documents?page=1&limit=1`)
    .set('Authorization', adminAuth)
    .expect(200);

  assert.equal(docsRes.body.success, true);
  assert.equal(docsRes.body.currentPage, 1);
  assert.equal(docsRes.body.count, 1);
  assert.equal(docsRes.body.pages >= 2, true);
});

test('product moderation/report endpoints: report, admin queue, moderation, audit', async () => {
  const { admin, customer, vendor } = await seedUsersAndVendor();
  const adminAuth = authHeaderFor(admin._id);
  const customerAuth = authHeaderFor(customer._id);

  const category = await Category.create({
    name: 'Electronics',
    description: 'Electronics category'
  });

  const product = await Product.create({
    vendor: vendor._id,
    name: 'Wireless Mouse',
    description: 'High precision wireless mouse',
    productType: 'physical',
    category: category._id,
    price: 199.99,
    stock: 20,
    images: [{ url: 'https://example.com/product/mouse.jpg' }],
    status: 'active',
    isActive: true,
    isApproved: false,
    moderationStatus: 'pending'
  });

  const reportRes = await request(app)
    .post(`/api/products/${product._id}/report`)
    .set('Authorization', customerAuth)
    .send({ reason: 'misleading', details: 'Images do not match product details.' })
    .expect(201);

  assert.equal(reportRes.body.success, true);
  assert.equal(reportRes.body.data.reportCount, 1);

  const reportedQueueRes = await request(app)
    .get('/api/products/admin/reported?reportStatus=open')
    .set('Authorization', adminAuth)
    .expect(200);

  assert.equal(reportedQueueRes.body.success, true);
  assert.equal(reportedQueueRes.body.total >= 1, true);

  const resolveReportsRes = await request(app)
    .put(`/api/products/${product._id}/moderate`)
    .set('Authorization', adminAuth)
    .send({ action: 'resolve-reports', reason: 'Reviewed and handled' })
    .expect(200);

  assert.equal(resolveReportsRes.body.success, true);
  assert.equal(resolveReportsRes.body.data.reportCount, 0);

  const approveRes = await request(app)
    .put(`/api/products/${product._id}/moderate`)
    .set('Authorization', adminAuth)
    .send({ action: 'approve', reason: 'Complies with policy' })
    .expect(200);

  assert.equal(approveRes.body.success, true);
  assert.equal(approveRes.body.data.moderationStatus, 'approved');
  assert.equal(approveRes.body.data.isApproved, true);

  const auditRes = await request(app)
    .get(`/api/products/${product._id}/audit?reportsPage=1&reportsLimit=1&activityPage=1&activityLimit=1&historyPage=1&historyLimit=1`)
    .set('Authorization', adminAuth)
    .expect(200);

  assert.equal(auditRes.body.success, true);
  assert.equal(Array.isArray(auditRes.body.data.moderationHistory), true);
  assert.equal(Array.isArray(auditRes.body.data.activityLogs), true);
  assert.equal(auditRes.body.data.moderationHistory.length >= 1, true);
  assert.equal(auditRes.body.data.pagination.reports.page, 1);
  assert.equal(auditRes.body.data.pagination.activityLogs.limit, 1);
});

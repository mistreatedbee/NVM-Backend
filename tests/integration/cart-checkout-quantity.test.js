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
const Cart = require('../../models/Cart');
const Order = require('../../models/Order');

let mongoServer;

function authHeaderFor(userId) {
  const token = jwt.sign(
    { id: String(userId) },
    process.env.JWT_SECRET || 'test-secret',
    { expiresIn: '1h' }
  );
  return `Bearer ${token}`;
}

async function seedCustomerVendorProduct() {
  const customer = await User.create({
    name: 'Customer',
    email: 'cart-customer@test.com',
    password: 'password123',
    role: 'customer',
    isVerified: true
  });

  const vendorUser = await User.create({
    name: 'Vendor User',
    email: 'cart-vendor@test.com',
    password: 'password123',
    role: 'vendor',
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
    vendorStatus: 'ACTIVE',
    accountStatus: 'active',
    isActive: true
  });

  const category = await Category.create({
    name: 'Electronics',
    description: 'Electronics category'
  });

  const product = await Product.create({
    vendor: vendor._id,
    vendorId: vendorUser._id,
    name: 'Wireless Mouse',
    description: 'High precision wireless mouse',
    productType: 'physical',
    category: category._id,
    price: 199.99,
    stock: 20,
    images: [{ url: 'https://example.com/product/mouse.jpg' }],
    status: 'PUBLISHED',
    isActive: true
  });

  return { customer, product };
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

test('cart add endpoint should be idempotent for same Idempotency-Key', async () => {
  const { customer, product } = await seedCustomerVendorProduct();
  const customerAuth = authHeaderFor(customer._id);
  const idempotencyKey = 'cart-add-fixed-key-1';

  const first = await request(app)
    .post('/api/cart/add')
    .set('Authorization', customerAuth)
    .set('Idempotency-Key', idempotencyKey)
    .send({ productId: product._id.toString(), qty: 1 })
    .expect(200);

  const second = await request(app)
    .post('/api/cart/add')
    .set('Authorization', customerAuth)
    .set('Idempotency-Key', idempotencyKey)
    .send({ productId: product._id.toString(), qty: 1 })
    .expect(200);

  assert.equal(first.body.success, true);
  assert.equal(second.body.success, true);
  assert.equal(first.body.data.itemCount, 1);
  assert.equal(second.body.data.itemCount, 1);
  assert.equal(second.body.data.items.length, 1);
  assert.equal(second.body.data.items[0].qty, 1);
});

test('checkout createOrder should be idempotent for same Idempotency-Key', async () => {
  const { customer, product } = await seedCustomerVendorProduct();
  const customerAuth = authHeaderFor(customer._id);

  await request(app)
    .post('/api/cart/add')
    .set('Authorization', customerAuth)
    .send({ productId: product._id.toString(), qty: 1 })
    .expect(200);

  const idemKey = 'checkout-fixed-key-1';
  const payload = {
    items: [
      {
        product: product._id.toString(),
        quantity: 1,
        price: 199.99
      }
    ],
    shippingAddress: {
      fullName: 'Customer Name',
      phone: '0123456789',
      street: '123 Main St',
      city: 'Cape Town',
      state: 'Western Cape',
      country: 'South Africa',
      zipCode: '8001'
    },
    billingAddress: {
      fullName: 'Customer Name',
      phone: '0123456789',
      street: '123 Main St',
      city: 'Cape Town',
      state: 'Western Cape',
      country: 'South Africa',
      zipCode: '8001'
    },
    paymentMethod: 'INVOICE'
  };

  const first = await request(app)
    .post('/api/orders')
    .set('Authorization', customerAuth)
    .set('Idempotency-Key', idemKey)
    .send(payload)
    .expect(201);

  const second = await request(app)
    .post('/api/orders')
    .set('Authorization', customerAuth)
    .set('Idempotency-Key', idemKey)
    .send(payload)
    .expect(200);

  assert.equal(first.body.success, true);
  assert.equal(second.body.success, true);
  assert.equal(second.body.idempotentReplay, true);
  assert.equal(String(first.body.data._id), String(second.body.data._id));

  const ordersCount = await Order.countDocuments({ customer: customer._id });
  assert.equal(ordersCount, 1);

  const cart = await Cart.findOne({ userId: customer._id });
  assert.equal(cart.items.length, 1);
  assert.equal(cart.items[0].qty, 1);
});

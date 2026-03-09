# VM Marketplace Backend API

Backend server for VM Marketplace - A multi-vendor e-commerce platform.

## 🚀 Quick Start

### 1. Install Dependencies
```bash
cd vm-marketplace-backend
npm install
```

### 2. Set Up Environment Variables
Create a `.env` file in the root directory:
```env
PORT=5001
NODE_ENV=development
MONGODB_URI=mongodb://localhost:27017/vm-marketplace
JWT_SECRET=your-super-secret-jwt-key-change-this-in-production
FRONTEND_URL=http://localhost:5173
```

### 3. Start MongoDB
Make sure MongoDB is running:
- **Local MongoDB**: `mongod` (if installed locally)
- **MongoDB Atlas**: Use the connection string in `.env`

### 4. Run the Server
```bash
# Development mode (with auto-reload)
npm run dev

# Production mode
npm start
```

The server will start on `http://localhost:5001`

## 📡 API Endpoints

### Vendors
- `POST /api/vendors` - Create vendor profile (Vendor)
- `GET /api/vendors` - Get all vendors
- `GET /api/vendors/:id` - Get vendor by ID
- `GET /api/vendors/slug/:slug` - Get vendor by slug
- `GET /api/vendors/me/profile` - Get my vendor profile (Vendor)
- `PUT /api/vendors/:id` - Update vendor profile
- `PUT /api/vendors/:id/approve` - Approve vendor (Admin)
- `PUT /api/vendors/:id/reject` - Reject vendor (Admin)
- `GET /api/vendors/:id/analytics` - Get vendor analytics

### Admin Vendor Management (New)
- `GET /api/admin/vendors?status=&verified=&q=&page=&limit=` - List vendors with filters + pagination (Admin)
- `GET /api/admin/vendors/:vendorId` - Vendor details with documents + metrics (Admin)
- `PATCH /api/admin/vendors/:vendorId/approve` - Approve vendor (Admin)
- `PATCH /api/admin/vendors/:vendorId/reject` - Reject vendor with reason (Admin)
- `PATCH /api/admin/vendors/:vendorId/suspend` - Suspend vendor with reason (Admin)
- `PATCH /api/admin/vendors/:vendorId/unsuspend` - Remove suspension (Admin)
- `PATCH /api/admin/vendors/:vendorId/profile` - Edit vendor profile incl. phone (Admin)
- `GET /api/admin/vendors/:vendorId/documents` - List vendor documents (Admin)
- `PATCH /api/admin/documents/:docId/approve` - Approve vendor document (Admin)
- `PATCH /api/admin/documents/:docId/reject` - Reject vendor document (Admin)
- `GET /api/admin/vendors/:vendorId/metrics` - Vendor metrics (orders/sales/reviews/rating) (Admin)
- `GET /api/admin/audit-logs?vendorId=&page=&limit=` - Audit logs (Admin)

### Vendor Verification (New)
- `POST /api/vendor/documents` - Upload vendor document (`multipart/form-data`, fields: `docType`, `file`) (Vendor)
- `GET /api/vendor/documents` - List own uploaded documents (Vendor)
- `DELETE /api/vendor/documents/:docId` - Delete own unapproved document (Vendor)
- `GET /api/vendor/metrics` - Vendor metrics (orders/sales/reviews/rating) (Vendor)

### Products
- `POST /api/products` - Create product (Vendor)
- `GET /api/products` - Get all products
- `GET /api/products/featured` - Get featured products
- `GET /api/products/:id` - Get product by ID
- `GET /api/products/slug/:slug` - Get product by slug
- `GET /api/products/vendor/:vendorId` - Get vendor products
- `PUT /api/products/:id` - Update product (Vendor)
- `DELETE /api/products/:id` - Delete product (Vendor)

### Orders
- `POST /api/orders` - Create order
- `GET /api/orders` - Get all orders (Admin)
- `GET /api/orders/my/orders` - Get my orders
- `GET /api/orders/vendor/orders` - Get vendor orders (Vendor)
- `GET /api/orders/:id` - Get order by ID
- `PUT /api/orders/:id/status` - Update order status
- `PUT /api/orders/:id/cancel` - Cancel order

### Payments
- `POST /api/payments/create-intent` - Create payment intent
- `POST /api/payments/confirm` - Confirm payment
- `POST /api/payments/webhook` - Stripe webhook
- `GET /api/payments/methods` - Get payment methods
- `POST /api/payments/refund` - Request refund (Admin)

### Categories
- `POST /api/categories` - Create category (Admin)
- `GET /api/categories` - Get all categories
- `GET /api/categories/:slug` - Get category by slug
- `PUT /api/categories/:id` - Update category (Admin)
- `DELETE /api/categories/:id` - Delete category (Admin)

### Reviews
- `POST /api/reviews` - Create review
- `GET /api/reviews/product/:productId` - Get product reviews
- `GET /api/reviews/vendor/:vendorId` - Get vendor reviews
- `PUT /api/reviews/:id` - Update review
- `DELETE /api/reviews/:id` - Delete review
- `PUT /api/reviews/:id/response` - Add vendor response (Vendor)
- `PUT /api/reviews/:id/helpful` - Mark review as helpful

### Search
- `GET /api/search` - Search products and vendors

### Subscriptions
- `GET /api/subscriptions/plans` - Get subscription plans
- `POST /api/subscriptions/subscribe` - Subscribe to plan (Vendor)
- `GET /api/subscriptions/my` - Get my subscription (Vendor)
- `POST /api/subscriptions/cancel` - Cancel subscription (Vendor)

### Health
- `GET /api/health` - Health check

## 🔐 Authentication

Protected routes require a JWT token in the Authorization header:
```
Authorization: Bearer <token>
```

## 📊 Database Models

### Vendor
- Store information (name, description, logo, banner)
- Business details (type, tax ID, license)
- Contact information (email, phone, address)
- Banking details (for EFT payments)
- Status (pending, approved, rejected, suspended)
- Stats (rating, reviews, sales, revenue)

### Product
- Basic info (name, description, images)
- Type (physical, digital, service)
- Category and tags
- Pricing and inventory
- Variants (size, color, etc.)
- Shipping details
- Reviews and ratings

### Order
- Order items and pricing
- Customer and shipping details
- Payment information
- Order status and tracking
- Fulfillment method (delivery/collection)

### Category
- Name, description, image
- Parent category (for subcategories)
- Status and ordering

### Review
- Rating and comment
- Product/Vendor reference
- Helpful count
- Vendor response

## 🛠️ Development

### User Roles
- **Customer**: Can browse, purchase, and review products
- **Vendor**: Can create store, manage products and orders
- **Admin**: Full access, can approve vendors and moderate content

## 📝 Notes

- JWT tokens expire in 30 days
- Passwords are hashed with bcrypt
- All user inputs are validated
- CORS is configured for frontend URL
- Error handling middleware included

## 🔒 Security

- Passwords are hashed (bcrypt)
- JWT tokens for authentication
- Input validation with express-validator
- CORS protection
- Rate limiting
- Environment variables for secrets

## 📦 Dependencies

- **express** - Web framework
- **mongoose** - MongoDB ODM
- **bcryptjs** - Password hashing
- **jsonwebtoken** - JWT tokens
- **express-validator** - Input validation
- **cors** - CORS middleware
- **dotenv** - Environment variables
- **multer** - File uploads
- **cloudinary** - Image storage
- **stripe** - Payment processing
- **nodemailer** - Email sending

## 🌐 For Production Deployment

When deploying, make sure to set these environment variables:
1. **MONGODB_URI**: Your production MongoDB connection string
2. **JWT_SECRET**: A strong, randomly generated secret
3. **FRONTEND_URL**: Your production frontend URL
4. **NODE_ENV**: `production`
5. **CLOUDINARY_***: Your Cloudinary credentials
6. **STRIPE_***: Your Stripe credentials (if using)


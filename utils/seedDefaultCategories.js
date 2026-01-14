const Category = require('../models/Category');

const DEFAULT_CATEGORIES = [
  { name: 'Fashion & Clothing', description: 'Clothing, shoes, accessories and fashion items.' },
  { name: 'Electronics', description: 'Phones, computers, gadgets and electronics.' },
  { name: 'Home & Garden', description: 'Home decor, furniture, garden and household items.' },
  { name: 'Health & Beauty', description: 'Beauty, skincare, wellness and personal care.' },
  { name: 'Food & Beverages', description: 'Food products, snacks, drinks and beverages.' },
  { name: 'Sports & Outdoors', description: 'Sports gear, fitness and outdoor equipment.' },
  { name: 'Books & Media', description: 'Books, media and educational resources.' },
  { name: 'Art & Crafts', description: 'Art, handmade crafts and creative supplies.' },
  { name: 'Services', description: 'Professional and local services.' },
  { name: 'Baby & Kids', description: 'Baby and kids products.' },
  { name: 'Music & Instruments', description: 'Musical instruments and music-related products.' },
  { name: 'Photography', description: 'Photography gear and accessories.' },
  { name: 'Jewelry & Watches', description: 'Jewelry, watches and accessories.' },
  { name: 'Gifts & Party', description: 'Gifts, party supplies and celebrations.' },
  { name: 'Automotive', description: 'Automotive parts and accessories.' }
];

async function ensureDefaultCategories() {
  try {
    let created = 0;

    for (let idx = 0; idx < DEFAULT_CATEGORIES.length; idx++) {
      const c = DEFAULT_CATEGORIES[idx];
      const existing = await Category.findOne({ name: c.name });
      if (existing) continue;

      await Category.create({
        name: c.name,
        description: c.description,
        order: idx,
        isActive: true,
        isFeatured: idx < 8
      });
      created++;
    }

    if (created > 0) {
      console.log(`✅ Seeded ${created} default categories`);
    }
  } catch (err) {
    // Don’t crash server if seed fails (e.g. duplicates, partial data)
    console.error('⚠️  Failed to seed default categories:', err.message || err);
  }
}

module.exports = { ensureDefaultCategories };


const FAQ_RESPONSES = [
  {
    intent: 'product_upload',
    patterns: ['upload product', 'add product', 'create product', 'product listing'],
    response: 'To upload a product: 1) Go to Vendor Dashboard > Products > Add Product. 2) Add title, pricing, stock, and category. 3) Upload clear photos. 4) Submit for moderation if required.'
  },
  {
    intent: 'orders_payouts',
    patterns: ['payout', 'payment', 'withdraw', 'order payment', 'when paid'],
    response: 'For payouts: 1) Verify your bank details in Vendor Settings. 2) Check order payment status in Orders. 3) Paid/confirmed orders are added to payout cycles. 4) Contact support if a paid order is missing.'
  },
  {
    intent: 'profile_setup',
    patterns: ['profile setup', 'store profile', 'update profile', 'vendor profile'],
    response: 'To complete profile setup: 1) Open Vendor Dashboard > Profile. 2) Add store name, category, contact, and policy details. 3) Upload logo/banner. 4) Save and review public preview.'
  },
  {
    intent: 'verification_status',
    patterns: ['verification', 'kyc', 'approved', 'pending verification'],
    response: 'Verification status is available in Vendor Dashboard > Compliance. If pending, ensure required documents are uploaded and readable. Rejected items include reasons to fix and resubmit.'
  },
  {
    intent: 'policy_questions',
    patterns: ['policy', 'refund policy', 'return policy', 'terms', 'dispute policy'],
    response: 'Policy guidance: Keep shipping, returns, and dispute terms up to date in your store settings. Orders must follow marketplace dispute and fraud rules for eligibility and account protection.'
  }
];

function normalize(value) {
  return (value || '').toLowerCase().trim();
}

function detectIntent(message) {
  const normalized = normalize(message);
  for (const item of FAQ_RESPONSES) {
    if (item.patterns.some(pattern => normalized.includes(pattern))) {
      return item;
    }
  }
  return null;
}

function botReply(message) {
  const match = detectIntent(message);

  if (match) {
    return {
      resolved: true,
      intent: match.intent,
      response: match.response
    };
  }

  return {
    resolved: false,
    intent: null,
    response: 'I could not confidently resolve that yet. Can you provide your order reference or clarify whether this is about products, payouts, profile, verification, or policy?'
  };
}

module.exports = {
  botReply
};

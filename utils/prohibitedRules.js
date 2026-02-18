const PROHIBITED_KEYWORDS = [
  'weapon',
  'gun',
  'firearm',
  'explosive',
  'counterfeit',
  'stolen',
  'narcotic',
  'drug',
  'illegal'
];

function detectProhibitedKeywords(text) {
  const content = String(text || '').toLowerCase();
  return PROHIBITED_KEYWORDS.filter((keyword) => content.includes(keyword));
}

module.exports = {
  PROHIBITED_KEYWORDS,
  detectProhibitedKeywords
};

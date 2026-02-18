const crypto = require('crypto');

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function base32Encode(buffer) {
  let bits = '';
  for (const byte of buffer) {
    bits += byte.toString(2).padStart(8, '0');
  }
  let output = '';
  for (let i = 0; i < bits.length; i += 5) {
    const chunk = bits.slice(i, i + 5).padEnd(5, '0');
    output += BASE32_ALPHABET[parseInt(chunk, 2)];
  }
  return output;
}

function base32Decode(input) {
  const value = String(input || '').toUpperCase().replace(/=+$/g, '');
  let bits = '';
  for (const char of value) {
    const index = BASE32_ALPHABET.indexOf(char);
    if (index < 0) continue;
    bits += index.toString(2).padStart(5, '0');
  }
  const bytes = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) {
    bytes.push(parseInt(bits.slice(i, i + 8), 2));
  }
  return Buffer.from(bytes);
}

function hotp(secretBuffer, counter) {
  const counterBuffer = Buffer.alloc(8);
  counterBuffer.writeUInt32BE(Math.floor(counter / 0x100000000), 0);
  counterBuffer.writeUInt32BE(counter % 0x100000000, 4);
  const hmac = crypto.createHmac('sha1', secretBuffer).update(counterBuffer).digest();
  const offset = hmac[hmac.length - 1] & 0xf;
  const code = ((hmac[offset] & 0x7f) << 24)
    | ((hmac[offset + 1] & 0xff) << 16)
    | ((hmac[offset + 2] & 0xff) << 8)
    | (hmac[offset + 3] & 0xff);
  return String(code % 1000000).padStart(6, '0');
}

function generateSecret() {
  return base32Encode(crypto.randomBytes(20));
}

function generateTotpCode(secret, timestampMs = Date.now(), stepSeconds = 30) {
  const counter = Math.floor(timestampMs / 1000 / stepSeconds);
  return hotp(base32Decode(secret), counter);
}

function verifyTotpCode(secret, token, window = 1) {
  const normalizedToken = String(token || '').replace(/\s+/g, '');
  if (!/^\d{6}$/.test(normalizedToken)) return false;
  const now = Date.now();
  for (let delta = -window; delta <= window; delta += 1) {
    const code = generateTotpCode(secret, now + delta * 30 * 1000);
    if (code === normalizedToken) return true;
  }
  return false;
}

function getEncryptionKey() {
  const seed = process.env.TWO_FACTOR_ENCRYPTION_KEY || process.env.JWT_SECRET || '';
  if (!seed) throw new Error('Missing TWO_FACTOR_ENCRYPTION_KEY or JWT_SECRET');
  return crypto.createHash('sha256').update(seed).digest();
}

function encryptSecret(secret) {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-cbc', getEncryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()]);
  return `${iv.toString('hex')}:${encrypted.toString('hex')}`;
}

function decryptSecret(payload) {
  const [ivHex, encryptedHex] = String(payload || '').split(':');
  if (!ivHex || !encryptedHex) return null;
  const decipher = crypto.createDecipheriv('aes-256-cbc', getEncryptionKey(), Buffer.from(ivHex, 'hex'));
  const decrypted = Buffer.concat([decipher.update(Buffer.from(encryptedHex, 'hex')), decipher.final()]);
  return decrypted.toString('utf8');
}

function buildOtpAuthUrl({ issuer, account, secret }) {
  return `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(account)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;
}

module.exports = {
  generateSecret,
  verifyTotpCode,
  encryptSecret,
  decryptSecret,
  buildOtpAuthUrl
};

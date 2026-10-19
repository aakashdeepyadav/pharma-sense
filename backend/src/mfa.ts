import crypto from 'node:crypto';

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const TOTP_STEP_SECONDS = 30;
export const MFA_REQUIRED_ROLES = new Set(['Admin', 'Inventory Manager', 'Pharmacist', 'Staff']);

export function encodeBase32(value: Buffer) {
  let bits = 0;
  let buffer = 0;
  let output = '';
  for (const byte of value) {
    buffer = (buffer << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(buffer >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) output += BASE32_ALPHABET[(buffer << (5 - bits)) & 31];
  return output;
}

function decodeBase32(value: string) {
  let bits = 0;
  let buffer = 0;
  const bytes: number[] = [];
  for (const character of value.toUpperCase().replace(/=+$/u, '')) {
    const digit = BASE32_ALPHABET.indexOf(character);
    if (digit < 0) throw new Error('Invalid MFA secret');
    buffer = (buffer << 5) | digit;
    bits += 5;
    if (bits >= 8) {
      bytes.push((buffer >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

export function generateTotpSecret() {
  return encodeBase32(crypto.randomBytes(20));
}

export function totpStepAt(timestampMs = Date.now()) {
  return Math.floor(timestampMs / 1000 / TOTP_STEP_SECONDS);
}

export function totpForStep(secret: string, step: number) {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));
  const digest = crypto.createHmac('sha1', decodeBase32(secret)).update(counter).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const binary = digest.readUInt32BE(offset) & 0x7fffffff;
  return String(binary % 1_000_000).padStart(6, '0');
}

export function verifyTotp(secret: string, code: string, timestampMs = Date.now()) {
  if (!/^\d{6}$/u.test(code)) return null;
  const currentStep = totpStepAt(timestampMs);
  for (const step of [currentStep, currentStep - 1, currentStep + 1]) {
    const expected = totpForStep(secret, step);
    if (crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(code))) return step;
  }
  return null;
}

function encryptionKey() {
  const encoded = process.env.MFA_ENCRYPTION_KEY;
  const key = encoded ? Buffer.from(encoded, 'base64') : Buffer.alloc(0);
  if (key.length !== 32 || key.toString('base64').replace(/=+$/u, '') !== encoded?.replace(/=+$/u, '')) {
    throw new Error('MFA_ENCRYPTION_KEY must be a base64-encoded 32-byte key');
  }
  return key;
}

export function validateMfaEncryptionKey() {
  encryptionKey();
}

export function encryptMfaSecret(secret: string) {
  const nonce = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey(), nonce);
  const ciphertext = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()]);
  return ['v1', nonce.toString('base64url'), cipher.getAuthTag().toString('base64url'), ciphertext.toString('base64url')].join('.');
}

export function decryptMfaSecret(value: string) {
  const [version, nonce, tag, ciphertext] = value.split('.');
  if (version !== 'v1' || !nonce || !tag || !ciphertext) throw new Error('Invalid encrypted MFA secret');
  const decipher = crypto.createDecipheriv('aes-256-gcm', encryptionKey(), Buffer.from(nonce, 'base64url'));
  decipher.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(ciphertext, 'base64url')), decipher.final()]).toString('utf8');
}

export function generateRecoveryCodes() {
  return Array.from({ length: 10 }, () => crypto.randomBytes(8).toString('hex').toUpperCase());
}

export function hashRecoveryCode(code: string) {
  return crypto.createHash('sha256').update(code.replaceAll('-', '').trim().toUpperCase()).digest('hex');
}

export function createTotpUri(secret: string, account: string, issuer = 'PharmaSense') {
  const label = encodeURIComponent(`${issuer}:${account}`);
  const params = new URLSearchParams({ secret, issuer, algorithm: 'SHA1', digits: '6', period: String(TOTP_STEP_SECONDS) });
  return `otpauth://totp/${label}?${params.toString()}`;
}

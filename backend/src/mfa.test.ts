import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  decryptMfaSecret,
  encryptMfaSecret,
  generateRecoveryCodes,
  generateTotpSecret,
  hashRecoveryCode,
  totpForStep,
  verifyTotp,
} from './mfa';

describe('multi-factor authentication utilities', () => {
  it('matches the RFC 6238 SHA-1 six-digit test vector', () => {
    const secret = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';
    assert.equal(totpForStep(secret, 1), '287082');
    assert.equal(verifyTotp(secret, '287082', 30_000), 1);
    assert.equal(verifyTotp(secret, '000000', 30_000), null);
  });

  it('encrypts MFA secrets with authenticated encryption', () => {
    const previousKey = process.env.MFA_ENCRYPTION_KEY;
    process.env.MFA_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64');
    try {
      const secret = generateTotpSecret();
      const encrypted = encryptMfaSecret(secret);
      assert.notEqual(encrypted, secret);
      assert.equal(decryptMfaSecret(encrypted), secret);
      assert.throws(() => decryptMfaSecret(encrypted.replace(/.$/u, 'A')));
    } finally {
      if (previousKey === undefined) delete process.env.MFA_ENCRYPTION_KEY;
      else process.env.MFA_ENCRYPTION_KEY = previousKey;
    }
  });

  it('creates unique high-entropy recovery codes and hashes them consistently', () => {
    const codes = generateRecoveryCodes();
    assert.equal(codes.length, 10);
    assert.equal(new Set(codes).size, codes.length);
    assert.equal(hashRecoveryCode(codes[0]), hashRecoveryCode(`${codes[0].slice(0, 8)}-${codes[0].slice(8)}`));
  });
});

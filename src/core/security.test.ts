import { describe, it, expect } from 'vitest';
import { isRestrictedFile, scanContentForSecrets } from './security.js';

describe('security', () => {
  describe('isRestrictedFile', () => {
    it('should return true for critical security files', () => {
      expect(isRestrictedFile('.env')).toBe(true);
      expect(isRestrictedFile('my-key.pem')).toBe(true);
      expect(isRestrictedFile('my-key.key')).toBe(true);
      expect(isRestrictedFile('credentials.json')).toBe(true);
      expect(isRestrictedFile('credentials-dev.json')).toBe(true);
    });

    it('should return true for all lockfiles', () => {
      expect(isRestrictedFile('pnpm-lock.yaml')).toBe(true);
      expect(isRestrictedFile('package-lock.json')).toBe(true);
      expect(isRestrictedFile('yarn.lock')).toBe(true);
    });

    it('should return false for safe files', () => {
      expect(isRestrictedFile('index.ts')).toBe(false);
      expect(isRestrictedFile('README.md')).toBe(false);
      expect(isRestrictedFile('.gitignore')).toBe(false);
      expect(isRestrictedFile('package.json')).toBe(false);
    });
  });

  describe('scanContentForSecrets', () => {
    it('should detect AWS Access Keys', () => {
      const content = 'my key is AKIAIOSFODNN7EXAMPLE and this is secret';
      const result = scanContentForSecrets(content);
      expect(result.found).toBe(true);
      expect(result.type).toBe('AWS Access Key');
    });

    it('should detect OpenAI-style keys', () => {
      const content = 'const key = "sk-abcdefghijklmnopqrstuvwxyz12345";';
      const result = scanContentForSecrets(content);
      expect(result.found).toBe(true);
      expect(result.type).toBe('OpenAI-style key');
    });

    it('should detect Private key headers (RSA)', () => {
      const content = '-----BEGIN RSA PRIVATE KEY-----\nMIIEowIBAAKCAQEA';
      const result = scanContentForSecrets(content);
      expect(result.found).toBe(true);
      expect(result.type).toBe('Private key header');
    });

    it('should detect Private key headers (Generic)', () => {
      const content = '-----BEGIN PRIVATE KEY-----\nMIIEowIBAAKCAQEA';
      const result = scanContentForSecrets(content);
      expect(result.found).toBe(true);
      expect(result.type).toBe('Private key header');
    });

    it('should detect generic secrets/tokens assigned in a single line', () => {
      expect(scanContentForSecrets('password = "mySuperSecretPassword_123"').found).toBe(true);
      expect(scanContentForSecrets("secret='mySuperSecretPassword_123'").found).toBe(true);
      expect(scanContentForSecrets('const token   =   "mySuperSecretPassword_123"').found).toBe(true);
    });

    it('should NOT produce false positives for generic words without assignment', () => {
      // e.g. variable named "password" but not assigned in the same line
      const content = 'let password;\npassword = getPassword();';
      const result = scanContentForSecrets(content);
      expect(result.found).toBe(false);

      const content2 = 'const auth = { requirePassword: true };';
      const result2 = scanContentForSecrets(content2);
      expect(result2.found).toBe(false);
    });
  });
});

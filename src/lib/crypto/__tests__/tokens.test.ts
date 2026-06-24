import { describe, it, expect } from 'vitest';
import { encryptToken, decryptToken, isEncryptedToken } from '@/lib/crypto/tokens';

describe('token encryption util', () => {
    it('encrypt → decrypt round-trips', () => {
        const plain = 'EAAB_test_page_access_token_12345';
        const enc = encryptToken(plain);
        expect(enc).toBeTruthy();
        expect(enc).not.toBe(plain);
        expect(enc!.startsWith('enc:v1:')).toBe(true);
        expect(decryptToken(enc)).toBe(plain);
    });

    it('passes through legacy plaintext on decrypt (backward-compat)', () => {
        const legacy = 'EAAB_legacy_plaintext_token';
        expect(decryptToken(legacy)).toBe(legacy);
    });

    it('is idempotent — does not double-encrypt', () => {
        const enc = encryptToken('some-token');
        expect(encryptToken(enc)).toBe(enc);
    });

    it('handles null / undefined / empty', () => {
        expect(encryptToken(null)).toBeNull();
        expect(encryptToken(undefined)).toBeNull();
        expect(encryptToken('')).toBeNull();
        expect(decryptToken(null)).toBeNull();
        expect(decryptToken('')).toBeNull();
    });

    it('returns null on tampered ciphertext (fail-closed)', () => {
        const enc = encryptToken('tamper-me')!;
        const tampered = enc.slice(0, -4) + 'dead';
        expect(decryptToken(tampered)).toBeNull();
    });

    it('isEncryptedToken detects the prefix', () => {
        expect(isEncryptedToken(encryptToken('x'))).toBe(true);
        expect(isEncryptedToken('plaintext')).toBe(false);
        expect(isEncryptedToken(null)).toBe(false);
    });

    it('produces distinct ciphertext per call (random IV) but same plaintext', () => {
        const a = encryptToken('same');
        const b = encryptToken('same');
        expect(a).not.toBe(b);
        expect(decryptToken(a)).toBe('same');
        expect(decryptToken(b)).toBe('same');
    });
});

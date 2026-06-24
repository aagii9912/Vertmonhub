/**
 * Token encryption-at-rest util
 *
 * Facebook/Instagram page access token-уудыг `shops` хүснэгтэд шифрлэн хадгалахад
 * ашиглана. `admin/auth.ts`-ийн session схемтэй ижил AES-256-GCM, гэхдээ:
 *   - `enc:v1:` prefix-тэй тул хуучин (plaintext) мөрүүдтэй зэрэгцэн ажиллана
 *     (data migration шаардлагагүй) —  decryptToken prefix-гүй утгыг шууд буцаана.
 *   - encryptToken нь idempotent — аль хэдийн шифрлэгдсэн утгыг дахин шифрлэхгүй.
 *
 * ⚠️ TOKEN_ENCRYPTION_KEY-г re-encrypt backfill-гүйгээр сольбол хуучин токенууд
 * тайлагдахгүй болохыг анхаар.
 */

import crypto from 'crypto';
import { logger } from '@/lib/utils/logger';

const ENC_PREFIX = 'enc:v1:';

// Шифрлэлтийн түлхүүр. Тусгай TOKEN_ENCRYPTION_KEY байхгүй бол service-role key,
// эцэст нь хөгжүүлэлтийн fallback руу шилжинэ. session-той мөргөлдөхгүйн тулд
// тусдаа salt ашиглана.
const ENCRYPTION_SECRET =
    process.env.TOKEN_ENCRYPTION_KEY ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    'fallback-token-secret-32chars-min!!';

function getKey(): Buffer {
    return crypto.scryptSync(ENCRYPTION_SECRET, 'vertmon-token-salt', 32);
}

/**
 * Токеныг шифрлэнэ. Аль хэдийн шифрлэгдсэн (enc:v1: prefix-тэй) бол хэвээр буцаана.
 * null/хоосон утгыг null болгож буцаана.
 */
export function encryptToken(plain: string | null | undefined): string | null {
    if (!plain) return null;
    if (plain.startsWith(ENC_PREFIX)) return plain; // idempotent

    try {
        const iv = crypto.randomBytes(12); // GCM-д стандарт 12 byte
        const cipher = crypto.createCipheriv('aes-256-gcm', getKey(), iv);
        const encrypted = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
        const authTag = cipher.getAuthTag();
        return `${ENC_PREFIX}${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`;
    } catch (error) {
        logger.error('encryptToken failed', { error });
        // Шифрлэж чадаагүй бол хадгалахаас сэргийлж null буцаана.
        return null;
    }
}

/**
 * Токеныг тайлна. Prefix-гүй (хуучин plaintext) бол шууд буцаана. enc:v1: бол
 * GCM decrypt. auth-tag таарахгүй / гэмтсэн бол null (fail-closed).
 */
export function decryptToken(value: string | null | undefined): string | null {
    if (!value) return null;
    if (!value.startsWith(ENC_PREFIX)) return value; // legacy plaintext pass-through

    try {
        const body = value.slice(ENC_PREFIX.length);
        const [ivHex, authTagHex, cipherHex] = body.split(':');
        if (!ivHex || !authTagHex || !cipherHex) return null;

        const decipher = crypto.createDecipheriv('aes-256-gcm', getKey(), Buffer.from(ivHex, 'hex'));
        decipher.setAuthTag(Buffer.from(authTagHex, 'hex'));
        const decrypted = Buffer.concat([
            decipher.update(Buffer.from(cipherHex, 'hex')),
            decipher.final(),
        ]);
        return decrypted.toString('utf8');
    } catch (error) {
        logger.error('decryptToken failed', { error });
        return null;
    }
}

/** Утга шифрлэгдсэн эсэхийг шалгах (туслах). */
export function isEncryptedToken(value: string | null | undefined): boolean {
    return !!value && value.startsWith(ENC_PREFIX);
}

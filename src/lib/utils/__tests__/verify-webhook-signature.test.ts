/**
 * verifyWebhookSignature — Facebook/Instagram webhook гарын үсгийн баталгаажуулалт.
 * Аюулгүйн хувьд чухал: буруу/дутуу гарын үсгийг татгалзаж, зөвхөн зөв HMAC-г зөвшөөрнө.
 */

import { describe, it, expect } from 'vitest';
import crypto from 'crypto';
import { verifyWebhookSignature } from '@/lib/utils/verify-webhook-signature';

const PAYLOAD = JSON.stringify({ object: 'page', entry: [{ id: '1' }] });
const SECRET = 'super-secret-app-key';

function sign(payload: string, secret: string): string {
    return 'sha256=' + crypto.createHmac('sha256', secret).update(payload).digest('hex');
}

describe('verifyWebhookSignature', () => {
    it('зөв гарын үсэгт true', () => {
        expect(verifyWebhookSignature(PAYLOAD, sign(PAYLOAD, SECRET), SECRET)).toBe(true);
    });

    it('гарын үсэг байхгүй (null) бол false', () => {
        expect(verifyWebhookSignature(PAYLOAD, null, SECRET)).toBe(false);
    });

    it('secret хоосон бол false', () => {
        expect(verifyWebhookSignature(PAYLOAD, sign(PAYLOAD, SECRET), '')).toBe(false);
    });

    it('secret-ийн зай (whitespace)-г trim хийнэ', () => {
        // trim хийгдсэн secret-ээр гарын үсэг зурсан тул зайтай secret ч таарна
        expect(verifyWebhookSignature(PAYLOAD, sign(PAYLOAD, SECRET), `  ${SECRET}  `)).toBe(true);
    });

    it('буруу secret-ийн гарын үсэг (ижил урт) бол false', () => {
        expect(verifyWebhookSignature(PAYLOAD, sign(PAYLOAD, 'wrong-secret'), SECRET)).toBe(false);
    });

    it('payload өөрчлөгдсөн бол false', () => {
        const sig = sign(PAYLOAD, SECRET);
        expect(verifyWebhookSignature(PAYLOAD + 'x', sig, SECRET)).toBe(false);
    });

    it('гарын үсгийн урт зөрүүтэй бол false (timingSafeEqual throw → catch)', () => {
        expect(verifyWebhookSignature(PAYLOAD, 'sha256=short', SECRET)).toBe(false);
    });
});

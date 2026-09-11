import { describe, it, expect, afterEach, vi } from 'vitest';

vi.mock('@google/generative-ai', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@google/generative-ai')>()),
    GoogleGenerativeAI: class { getGenerativeModel() { return {}; } },
}));

import { isAllowedAttachmentUrl } from '../runAgent';

/** SSRF хамгаалалт (2026-09 review H2): зөвхөн өөрийн Supabase storage public bucket. */
describe('isAllowedAttachmentUrl', () => {
    afterEach(() => vi.unstubAllEnvs());

    it('өөрийн storage public bucket → true', () => {
        vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://abc.supabase.co');
        expect(isAllowedAttachmentUrl('https://abc.supabase.co/storage/v1/object/public/products/shop/x.png')).toBe(true);
        expect(isAllowedAttachmentUrl('https://abc.supabase.co/storage/v1/object/public/property-images/s/p/x.jpg')).toBe(true);
    });
    it('өөр host, өөр bucket, дотоод сүлжээ, protocol зөрүү → false', () => {
        vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://abc.supabase.co');
        expect(isAllowedAttachmentUrl('http://10.0.0.5:8080/internal')).toBe(false);
        expect(isAllowedAttachmentUrl('https://evil.example/storage/v1/object/public/products/x.png')).toBe(false);
        expect(isAllowedAttachmentUrl('https://abc.supabase.co/storage/v1/object/public/private-bucket/x.png')).toBe(false);
        expect(isAllowedAttachmentUrl('http://abc.supabase.co/storage/v1/object/public/products/x.png')).toBe(false);
        expect(isAllowedAttachmentUrl('https://abc.supabase.co/rest/v1/customers')).toBe(false);
        expect(isAllowedAttachmentUrl('not a url')).toBe(false);
    });
    it('env байхгүй бол юу ч зөвшөөрөхгүй', () => {
        vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '');
        expect(isAllowedAttachmentUrl('https://abc.supabase.co/storage/v1/object/public/products/x.png')).toBe(false);
    });
});

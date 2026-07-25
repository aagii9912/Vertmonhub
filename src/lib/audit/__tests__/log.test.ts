import { describe, it, expect } from 'vitest';
import { diffFields, redact } from '../log';

describe('diffFields', () => {
    it('зөвхөн өөрчлөгдсөн талбарыг буцаана', () => {
        const before = { id: '1', name: 'Бат', price: 100, note: 'a' };
        const after = { id: '1', name: 'Бат', price: 250, note: 'a' };

        const d = diffFields(before, after);

        expect(d.before).toEqual({ price: 100 });
        expect(d.after).toEqual({ price: 250 });
    });

    it('өөрчлөлт байхгүй бол хоосон буцаана', () => {
        const row = { id: '1', amount: 5 };
        const d = diffFields(row, { ...row });
        expect(d.before).toEqual({});
        expect(d.after).toEqual({});
    });

    it('updated_at/created_at-ыг дефолтоор алгасна', () => {
        const d = diffFields(
            { id: '1', updated_at: '2026-01-01', created_at: '2025-01-01' },
            { id: '1', updated_at: '2026-07-25', created_at: '2025-01-01' },
        );
        expect(d.before).toEqual({});
        expect(d.after).toEqual({});
    });

    it('нэмэгдсэн болон хасагдсан талбарыг барина', () => {
        const d = diffFields<Record<string, unknown>>(
            { id: '1', old_only: 'x' },
            { id: '1', new_only: 'y' },
        );
        expect(d.before).toEqual({ old_only: 'x' });
        expect(d.after).toEqual({ new_only: 'y' });
    });

    it('устгалын үед (after = null) бүх талбар before-д үлдэнэ', () => {
        const d = diffFields({ id: '1', total: 900 }, null);
        expect(d.before).toEqual({ id: '1', total: 900 });
        expect(d.after).toEqual({});
    });

    it('string ба number хэлбэрийн ижил утгыг өөрчлөлт гэж үзэхгүй', () => {
        // Supabase numeric баганыг string-ээр буцааж болзошгүй
        const d = diffFields<Record<string, unknown>>({ amount: 100 }, { amount: '100' });
        expect(d.before).toEqual({});
        expect(d.after).toEqual({});
    });

    it('үүрлэсэн объектын өөрчлөлтийг илрүүлнэ', () => {
        const d = diffFields<Record<string, unknown>>(
            { meta: { a: 1 } },
            { meta: { a: 2 } },
        );
        expect(d.before).toEqual({ meta: { a: 1 } });
        expect(d.after).toEqual({ meta: { a: 2 } });
    });
});

describe('redact', () => {
    it('нууц талбарыг далдална', () => {
        const out = redact({
            name: 'Бат',
            password: 'nuuts123',
            facebook_page_access_token: 'EAAG...',
        }) as Record<string, unknown>;

        expect(out.name).toBe('Бат');
        expect(out.password).toBe('[redacted]');
        expect(out.facebook_page_access_token).toBe('[redacted]');
    });

    it('үүрлэсэн бүтцэд ч ажиллана', () => {
        const out = redact({
            shop: { name: 'Мандала', api_key: 'sk-123' },
        }) as Record<string, Record<string, unknown>>;

        expect(out.shop.name).toBe('Мандала');
        expect(out.shop.api_key).toBe('[redacted]');
    });

    it('массив доторх нууцыг ч далдална', () => {
        const out = redact([{ token: 'abc' }, { ok: 1 }]) as Record<string, unknown>[];
        expect(out[0].token).toBe('[redacted]');
        expect(out[1].ok).toBe(1);
    });

    it('нууц биш утгыг хэвээр үлдээнэ', () => {
        expect(redact('энгийн текст')).toBe('энгийн текст');
        expect(redact(42)).toBe(42);
        expect(redact(null)).toBe(null);
    });
});

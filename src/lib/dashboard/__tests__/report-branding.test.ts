import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { brandingImageUrl, ReportBrandingSaveSchema, parseBrandingMediaPath } from '../report-branding';
import { loadReportBranding, readReportBranding, saveReportBranding } from '../report-branding-store';
import { parseReportMediaPath, sniffReportImage } from '../report-media';

const shop = '20000000-0000-4000-8000-000000000001';
const otherShop = '20000000-0000-4000-8000-000000000002';
const actor = '10000000-0000-4000-8000-000000000001';
const image = (n: number, shopId = shop, ext = 'png') => `branding/${shopId}/30000000-0000-4000-8000-00000000000${n}.${ext}`;

type Row = Record<string, unknown>;
/** report_branding-ийн in-memory хувилбар: select/eq/maybeSingle, insert, нөхцөлт update. */
function database(initial: Row | null, options: { missing?: boolean; uniqueOnInsert?: boolean } = {}) {
    let row = initial ? { ...initial } : null;
    const writes: Array<{ kind: string; values: Row; filters: Array<[string, unknown]> }> = [];
    const from = vi.fn(() => {
        const filters: Array<[string, unknown]> = [];
        let write: { kind: 'insert' | 'update'; values: Row } | null = null;
        const result = () => {
            if (options.missing) return { data: null, error: { code: '42P01', message: 'relation "public.report_branding" does not exist' } };
            if (write?.kind === 'insert') {
                writes.push({ kind: 'insert', values: write.values, filters });
                if (options.uniqueOnInsert || row) return { data: null, error: { code: '23505', message: 'duplicate key' } };
                row = { ...write.values };
                return { data: { ...row }, error: null };
            }
            const matches = !!row && filters.every(([key, value]) => row![key] === value);
            if (write?.kind === 'update') {
                writes.push({ kind: 'update', values: write.values, filters });
                if (!matches) return { data: null, error: null };
                row = { ...row!, ...write.values };
            }
            return { data: matches ? { ...row! } : null, error: null };
        };
        const query = {
            select: () => query,
            eq: (key: string, value: unknown) => { filters.push([key, value]); return query; },
            insert: (values: Row) => { write = { kind: 'insert', values }; return query; },
            update: (values: Row) => { write = { kind: 'update', values }; return query; },
            single: () => Promise.resolve(result()),
            maybeSingle: () => Promise.resolve(result()),
        };
        return query;
    });
    return { db: { from } as unknown as SupabaseClient, writes, current: () => row };
}

/** Storage: шинээр сонгосон зураг байгаа эсэх (тестэд бүгд байна). */
const exists = async () => true;
const save = (over: Partial<Record<string, unknown>> = {}) => ReportBrandingSaveSchema.parse({
    displayName: 'ЭЛИЗИУМ', footerText: 'ВЕРТМОН ПРОПЕРТИС', coverImagePath: image(1), logoPath: null, expectedUpdatedAt: null, ...over,
});

describe('report branding rules', () => {
    it('accepts only this layout of branding paths and keeps them apart from slide media', () => {
        expect(parseBrandingMediaPath(image(1))).toEqual({ path: image(1), shopId: shop, ext: 'png' });
        for (const bad of [image(1, shop, 'gif'), `branding/${shop}/../x.png`, `${shop}/${actor}/30000000-0000-4000-8000-000000000001.png`, `/branding/${shop}/x.png`, 7]) {
            expect(parseBrandingMediaPath(bad)).toBeNull();
        }
        expect(parseReportMediaPath(image(1))).toBeNull();
        expect(brandingImageUrl(image(1))).toBe(`/api/dashboard/report-branding/media?path=${encodeURIComponent(image(1))}`);
        expect(brandingImageUrl(null)).toBeNull();
        expect(sniffReportImage(Uint8Array.from([0xff, 0xd8, 0xff, 0xe0]))).toBe('image/jpeg');
        expect(sniffReportImage(new TextEncoder().encode('<svg/>'))).toBeNull();
    });

    it('trims text, treats empty as unknown and refuses unknown fields', () => {
        expect(save({ displayName: '  ЭЛИЗИУМ ', footerText: '   ' })).toMatchObject({ displayName: 'ЭЛИЗИУМ', footerText: null });
        expect(ReportBrandingSaveSchema.safeParse({ ...save(), shop_id: otherShop }).success).toBe(false);
        expect(ReportBrandingSaveSchema.safeParse({ ...save(), displayName: 'Э'.repeat(81) }).success).toBe(false);
        expect(ReportBrandingSaveSchema.safeParse({ ...save(), logoPath: 'https://evil.test/logo.png' }).success).toBe(false);
        expect(ReportBrandingSaveSchema.safeParse({ ...save(), expectedUpdatedAt: 'yesterday' }).success).toBe(false);
    });
});

describe('report branding store', () => {
    it('loads null fields when nothing is saved or the table is missing, and throws other read errors', async () => {
        expect(await loadReportBranding(database(null).db, shop)).toEqual({ displayName: null, footerText: null, coverImagePath: null, logoPath: null, updatedAt: null });
        expect(await readReportBranding(database(null, { missing: true }).db, shop)).toMatchObject({ available: false, branding: { displayName: null } });
        const broken = { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: { code: '57014', message: 'timeout' } }) }) }) }) } as unknown as SupabaseClient;
        await expect(loadReportBranding(broken, shop)).rejects.toThrow('timeout');
    });

    it('creates once, updates only with the read version, and returns replaced images for cleanup', async () => {
        const { db, current } = database(null);
        const created = await saveReportBranding(db, shop, actor, save(), exists);
        expect(created).toMatchObject({ ok: true, removed: [], branding: { displayName: 'ЭЛИЗИУМ', coverImagePath: image(1) } });
        expect(current()).toMatchObject({ shop_id: shop, updated_by: actor, display_name: 'ЭЛИЗИУМ' });
        const version = (created as { branding: { updatedAt: string } }).branding.updatedAt;
        // Хуучин хувилбараар (эсвэл шинэ гэж) хадгалбал юу ч бичихгүй.
        expect(await saveReportBranding(db, shop, actor, save({ expectedUpdatedAt: null }), exists)).toEqual({ conflict: true });
        expect(await saveReportBranding(db, shop, actor, save({ expectedUpdatedAt: '2020-01-01T00:00:00Z' }), exists)).toEqual({ conflict: true });
        const updated = await saveReportBranding(db, shop, actor, save({ coverImagePath: image(2), logoPath: image(3), expectedUpdatedAt: version }), exists);
        expect(updated).toMatchObject({ ok: true, removed: [image(1)], branding: { coverImagePath: image(2), logoPath: image(3) } });
        const cleared = await saveReportBranding(db, shop, actor, save({ coverImagePath: image(2), logoPath: null, displayName: null, expectedUpdatedAt: current()!.updated_at }), exists);
        expect(cleared).toMatchObject({ ok: true, removed: [image(3)], branding: { displayName: null, logoPath: null } });
    });

    it('refuses a new image path that is not in storage, so a stale draft never removes a colleague\'s image', async () => {
        // A, B хоёр лого = image(1) үед нээсэн. B image(2) оруулж хадгалсан (image(1) storage-оос устсан).
        const { db, current } = database({ shop_id: shop, display_name: null, footer_text: null, cover_image_path: null, logo_path: image(2), updated_at: '2026-10-23T03:00:00.5+00:00', updated_by: actor });
        const inStorage = new Set([image(2), image(3)]);
        const checked: string[] = [];
        const storage = async (path: string) => { checked.push(path); return inStorage.has(path); };
        // A хуучин нооргоор (image(1)), шинэ хувилбартай хадгалвал — татгалзана, юу ч бичихгүй, юу ч устгахгүй.
        expect(await saveReportBranding(db, shop, actor, save({ coverImagePath: null, logoPath: image(1), expectedUpdatedAt: '2026-10-23T03:00:00.5+00:00' }), storage))
            .toEqual({ invalid: expect.stringMatching(/олдсонгүй/) });
        expect(current()).toMatchObject({ logo_path: image(2) });
        // Хуучин хувилбартай бол эхлээд 409 (зураг шалгахгүй).
        expect(await saveReportBranding(db, shop, actor, save({ coverImagePath: null, logoPath: image(1), expectedUpdatedAt: '2026-10-23T02:00:00+00:00' }), storage)).toEqual({ conflict: true });
        expect(checked).toEqual([image(1)]);
        // Хадгалагдсан зургийг дахин шалгахгүй; шинэ, storage-д байгаа зураг болно.
        const saved = await saveReportBranding(db, shop, actor, save({ coverImagePath: image(3), logoPath: image(2), expectedUpdatedAt: '2026-10-23T03:00:00.5+00:00' }), storage);
        expect(saved).toMatchObject({ ok: true, removed: [], branding: { coverImagePath: image(3), logoPath: image(2) } });
        expect(checked).toEqual([image(1), image(3)]);
    });

    it('refuses another shop\'s image, answers a concurrent first save as a conflict and a missing table as unavailable', async () => {
        expect(await saveReportBranding(database(null).db, shop, actor, save({ coverImagePath: image(1, otherShop) }), exists)).toEqual({ invalid: expect.any(String) });
        expect(await saveReportBranding(database(null, { uniqueOnInsert: true }).db, shop, actor, save(), exists)).toEqual({ conflict: true });
        expect(await saveReportBranding(database(null, { missing: true }).db, shop, actor, save(), exists)).toEqual({ unavailable: true });
    });
});

// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
    DEFAULT_REFERRAL_SOURCES, REFERRAL_REQUIRED_ERROR, availableReferralText, missingDefaultReferralSources, normalizeReferralName,
    referralNameKey, referralNameMap, referralOptionLabel, referralRequired,
} from '@/lib/sales/referral-sources';
import {
    CreateReferralSourceSchema, REFERRAL_UNAVAILABLE, UpdateReferralSourceSchema, addDefaultReferralSources, createReferralSource,
    isMissingReferralSchema, listReferralSources, loadReferralNames, readReferralSources, reorderReferralSources, resolveReferralSource,
    updateReferralSource,
} from '@/lib/sales/referral-sources-store';
import { createMemoryDb, type MemoryDb } from '@/test/memory-db';

const audits = vi.hoisted(() => [] as unknown[]);
vi.mock('@/lib/services/AuditService', () => ({ recordAudit: async (entry: unknown) => { audits.push(entry); } }));

const facebook = '70000000-0000-4000-8000-000000000001';
const neighbour = '70000000-0000-4000-8000-000000000002';
const barmash = '70000000-0000-4000-8000-000000000003';
const foreign = '70000000-0000-4000-8000-000000000004';
const missingTable = { code: 'PGRST205', message: "Could not find the table 'public.sales_referral_sources' in the schema cache" };

let db: MemoryDb;
const client = () => db as unknown as SupabaseClient;

beforeEach(() => {
    audits.length = 0;
    db = createMemoryDb({
        sales_referral_sources: [
            { id: facebook, shop_id: 'shop-1', name: 'Facebook', sort_order: 10, archived_at: null },
            { id: neighbour, shop_id: 'shop-1', name: 'Ойрхон амьдардаг', sort_order: 20, archived_at: null },
            { id: barmash, shop_id: 'shop-1', name: 'Бармаш түрээслэгч', sort_order: 30, archived_at: '2026-10-20T00:00:00Z' },
            { id: foreign, shop_id: 'shop-2', name: 'Монкон', sort_order: 10, archived_at: null },
        ],
    }, {
        // DB-ийн хэсэгчилсэн unique индекс: идэвхтэй нэр төсөлд давтагдахгүй.
        insert: (table, row, rows) => table === 'sales_referral_sources' && !row.archived_at
            && rows.some(other => other.shop_id === row.shop_id && !other.archived_at && referralNameKey(other.name) === referralNameKey(row.name))
            ? { code: '23505', message: 'duplicate key' } : null,
    });
});

describe('referral source labels and rules', () => {
    it('normalizes names and keys case- and space-insensitively, Cyrillic included', () => {
        expect(normalizeReferralName('  Ойрхон   амьдардаг ')).toBe('Ойрхон амьдардаг');
        expect(normalizeReferralName('   ')).toBeNull();
        expect(normalizeReferralName(5)).toBeNull();
        expect(referralNameKey('ОЙРХОН  АМЬДАРДАГ')).toBe(referralNameKey('ойрхон амьдардаг'));
        expect(referralNameKey('Өмнөговь Үйлдвэр')).toBe('өмнөговь үйлдвэр');
    });

    it('labels archived options, maps names and lists only missing defaults (archived counts as present)', () => {
        expect(referralOptionLabel({ name: 'Танил', archived_at: null })).toBe('Танил');
        expect(referralOptionLabel({ name: 'Танил', archived_at: '2026-10-20' })).toBe('Танил (архив)');
        expect(referralNameMap([{ id: 'a', name: 'Facebook' }]).get('a')).toBe('Facebook');
        expect(DEFAULT_REFERRAL_SOURCES).toEqual(['Facebook', 'Инстаграм', 'Ойрхон амьдардаг', 'Монкон', 'Мандала Гарден ОС', 'Бармаш түрээслэгч', 'Ажилтан', 'Танил', 'Бусад']);
        expect(missingDefaultReferralSources([{ name: 'facebook' }, { name: 'Бармаш  түрээслэгч' }, { name: 'Билбоард' }]))
            .toEqual(['Инстаграм', 'Ойрхон амьдардаг', 'Монкон', 'Мандала Гарден ОС', 'Ажилтан', 'Танил', 'Бусад']);
    });

    it('requires a referral only for new-customer meetings in projects that have an active list', () => {
        expect(referralRequired('new_customer', 3)).toBe(true);
        expect(referralRequired(undefined, 3)).toBe(true);
        expect(referralRequired('new_customer', 0)).toBe(false);
        expect(referralRequired('repeat_customer', 3)).toBe(false);
        expect(referralRequired('existing_buyer', 3)).toBe(false);
        expect(availableReferralText([])).toContain('идэвхтэй сонголт алга');
    });
});

describe('reading the list', () => {
    it('reads one project in order, active only unless archived are asked for', async () => {
        expect((await listReferralSources(client(), 'shop-1')).map(source => source.name)).toEqual(['Facebook', 'Ойрхон амьдардаг']);
        expect((await readReferralSources(client(), 'shop-1', { includeArchived: true }))).toMatchObject({ available: true, sources: [{ id: facebook }, { id: neighbour }, { id: barmash }] });
        expect((await loadReferralNames(client(), 'shop-1', [null, barmash])).get(barmash)).toBe('Бармаш түрээслэгч');
        expect((await loadReferralNames(client(), 'shop-1', [null, undefined])).size).toBe(0);
    });

    it('tolerates the missing table (migration not applied) but surfaces other read errors', async () => {
        db.failNext.sales_referral_sources = missingTable;
        expect(await readReferralSources(client(), 'shop-1')).toEqual({ sources: [], available: false });
        db.failNext.sales_referral_sources = { code: '42703', message: 'column property_viewings.referral_source_id does not exist' };
        expect(await listReferralSources(client(), 'shop-1')).toEqual([]);
        db.failNext.sales_referral_sources = { code: '57014', message: 'canceling statement due to statement timeout' };
        await expect(listReferralSources(client(), 'shop-1')).rejects.toThrow(/timeout/);
        expect(isMissingReferralSchema({ code: '42P01', message: 'relation "public.sales_referral_sources" does not exist' })).toBe(true);
        expect(isMissingReferralSchema({ code: '23505', message: 'duplicate' })).toBe(false);
        expect(isMissingReferralSchema(null)).toBe(false);
    });
});

describe('resolving a referral for a meeting or contract', () => {
    it('accepts an active id or an exact name, keeps the current archived one and never guesses', async () => {
        expect(await resolveReferralSource(client(), 'shop-1', { id: neighbour })).toMatchObject({ ok: true, referralSourceId: neighbour });
        expect(await resolveReferralSource(client(), 'shop-1', { name: ' facebook ' })).toMatchObject({ ok: true, referralSourceId: facebook, source: { name: 'Facebook' } });
        expect(await resolveReferralSource(client(), 'shop-1', { id: barmash }, { current: barmash })).toMatchObject({ ok: true, referralSourceId: barmash });
        expect(await resolveReferralSource(client(), 'shop-1', { id: barmash })).toMatchObject({ ok: false, status: 400, error: expect.stringContaining('архивлагдсан') });
        expect(await resolveReferralSource(client(), 'shop-1', { name: 'Бармаш түрээслэгч' })).toMatchObject({ ok: false, status: 400 });
        expect(await resolveReferralSource(client(), 'shop-1', { id: foreign })).toMatchObject({ ok: false, status: 400, error: expect.stringContaining('Боломжтой: Facebook, Ойрхон амьдардаг') });
        expect(await resolveReferralSource(client(), 'shop-1', { name: 'Сошиал медиа' })).toMatchObject({ ok: false, status: 400, error: expect.stringContaining('«Сошиал медиа»') });
        expect(await resolveReferralSource(client(), 'shop-1', { id: 'facebook' })).toMatchObject({ ok: false, status: 400 });
        expect(await resolveReferralSource(client(), 'shop-1', { name: 7 })).toMatchObject({ ok: false, status: 400 });
    });

    it('clears with null and enforces the new-customer requirement only when the project has an active list', async () => {
        expect(await resolveReferralSource(client(), 'shop-1', { id: null })).toMatchObject({ ok: true, referralSourceId: null });
        expect(await resolveReferralSource(client(), 'shop-1', {}, { required: true })).toMatchObject({ ok: false, status: 400, error: expect.stringContaining(REFERRAL_REQUIRED_ERROR) });
        expect(await resolveReferralSource(client(), 'shop-1', { id: null }, { required: true })).toMatchObject({ ok: false, status: 400 });
        db.tables.sales_referral_sources = db.tables.sales_referral_sources.map(row => ({ ...row, archived_at: row.archived_at ?? '2026-10-21T00:00:00Z' }));
        expect(await resolveReferralSource(client(), 'shop-1', {}, { required: true })).toMatchObject({ ok: true, referralSourceId: null, available: true });
    });

    it('does not block meetings before the migration, but refuses to store a referral it cannot check', async () => {
        db.failNext.sales_referral_sources = missingTable;
        expect(await resolveReferralSource(client(), 'shop-1', {}, { required: true })).toEqual({ ok: true, referralSourceId: null, source: null, available: false });
        db.failNext.sales_referral_sources = missingTable;
        expect(await resolveReferralSource(client(), 'shop-1', { id: facebook })).toEqual({ ok: false, status: 503, error: REFERRAL_UNAVAILABLE });
        db.failNext.sales_referral_sources = { code: '57014', message: 'timeout' };
        expect(await resolveReferralSource(client(), 'shop-1', { id: facebook })).toMatchObject({ ok: false, status: 503 });
    });
});

describe('settings writes', () => {
    it('validates input strictly', () => {
        expect(CreateReferralSourceSchema.safeParse({ name: '  Билбоард  ' })).toMatchObject({ success: true, data: { name: 'Билбоард' } });
        expect(CreateReferralSourceSchema.safeParse({ name: ' ' }).success).toBe(false);
        expect(CreateReferralSourceSchema.safeParse({ name: 'x'.repeat(81) }).success).toBe(false);
        expect(CreateReferralSourceSchema.safeParse({ name: 'Билбоард', shop_id: 'shop-2' }).success).toBe(false);
        expect(UpdateReferralSourceSchema.safeParse({}).success).toBe(false);
        expect(UpdateReferralSourceSchema.safeParse({ archived_at: null }).success).toBe(false);
    });

    it('creates after the last one, refuses an active duplicate and audits', async () => {
        const created = await createReferralSource(client(), 'shop-1', { name: 'Билбоард' }, 'admin-1');
        expect(created).toMatchObject({ ok: true, source: { name: 'Билбоард', sort_order: 40 } });
        expect(db.tables.sales_referral_sources.at(-1)).toMatchObject({ shop_id: 'shop-1', created_by: 'admin-1' });
        expect(await createReferralSource(client(), 'shop-1', { name: 'FACEBOOK' }, 'admin-1')).toMatchObject({ ok: false, status: 409 });
        // Архивласан ижил нэрийг дахин нэмж болно (хэсэгчилсэн индекс).
        expect(await createReferralSource(client(), 'shop-1', { name: 'Бармаш түрээслэгч' }, 'admin-1')).toMatchObject({ ok: true });
        expect(audits).toHaveLength(2);
        db.failNext.sales_referral_sources = missingTable;
        expect(await createReferralSource(client(), 'shop-1', { name: 'Шинэ' }, 'admin-1')).toEqual({ ok: false, status: 503, error: REFERRAL_UNAVAILABLE });
    });

    it('renames, archives and restores within the project only', async () => {
        expect(await updateReferralSource(client(), 'shop-1', neighbour, { name: 'Ойролцоо амьдардаг' }, 'admin-1')).toMatchObject({ ok: true, source: { name: 'Ойролцоо амьдардаг' } });
        expect(await updateReferralSource(client(), 'shop-1', neighbour, { name: 'facebook' }, 'admin-1')).toMatchObject({ ok: false, status: 409 });
        const archived = await updateReferralSource(client(), 'shop-1', facebook, { archived: true }, 'admin-1');
        expect(archived).toMatchObject({ ok: true, source: { archived_at: expect.any(String) } });
        expect(await updateReferralSource(client(), 'shop-1', facebook, { archived: false }, 'admin-1')).toMatchObject({ ok: true, source: { archived_at: null } });
        expect(await updateReferralSource(client(), 'shop-1', foreign, { archived: true }, 'admin-1')).toMatchObject({ ok: false, status: 404 });
        expect(await updateReferralSource(client(), 'shop-1', 'not-a-uuid', { archived: true }, 'admin-1')).toMatchObject({ ok: false, status: 400 });
        // Сэргээхэд ижил нэртэй идэвхтэй сонголт байвал 409.
        await createReferralSource(client(), 'shop-1', { name: 'Бармаш түрээслэгч' }, 'admin-1');
        expect(await updateReferralSource(client(), 'shop-1', barmash, { archived: false }, 'admin-1')).toMatchObject({ ok: false, status: 409 });
        const writes = db.writes.length;
        expect(await updateReferralSource(client(), 'shop-1', neighbour, { name: 'Ойролцоо амьдардаг' }, 'admin-1')).toMatchObject({ ok: true });
        expect(db.writes.length).toBe(writes);
    });

    it('reorders the whole list in one request and refuses a stale order', async () => {
        const result = await reorderReferralSources(client(), 'shop-1', [barmash, facebook, neighbour], 'admin-1');
        expect(result).toMatchObject({ ok: true, sources: [{ id: barmash, sort_order: 10 }, { id: facebook, sort_order: 20 }, { id: neighbour, sort_order: 30 }] });
        expect(db.tables.sales_referral_sources.find(row => row.id === foreign)?.sort_order).toBe(10);
        expect(await reorderReferralSources(client(), 'shop-1', [facebook, neighbour], 'admin-1')).toMatchObject({ ok: false, status: 409 });
        expect(await reorderReferralSources(client(), 'shop-1', [facebook, neighbour, foreign], 'admin-1')).toMatchObject({ ok: false, status: 409 });
    });

    it('adds only the missing W12 defaults and is idempotent', async () => {
        const first = await addDefaultReferralSources(client(), 'shop-1', 'admin-1');
        expect(first).toMatchObject({ ok: true, skipped: 3 });
        if (!first.ok) return;
        expect(first.created.map(source => source.name)).toEqual(['Инстаграм', 'Монкон', 'Мандала Гарден ОС', 'Ажилтан', 'Танил', 'Бусад']);
        expect(first.created.map(source => source.sort_order)).toEqual([40, 50, 60, 70, 80, 90]);
        expect(await addDefaultReferralSources(client(), 'shop-1', 'admin-1')).toEqual({ ok: true, created: [], skipped: DEFAULT_REFERRAL_SOURCES.length });
        expect((await addDefaultReferralSources(client(), 'shop-3', 'admin-1') as { created: unknown[] }).created).toHaveLength(9);
    });
});

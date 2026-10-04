// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createMemoryDb, type MemoryDb } from '@/test/memory-db';

const audit = vi.hoisted(() => ({ entries: [] as Record<string, unknown>[] }));
vi.mock('@/lib/services/AuditService', () => ({ recordAudit: async (entry: Record<string, unknown>) => { audit.entries.push(entry); } }));

import {
    CreateLeadCategorySchema, UpdateLeadCategorySchema, addDefaultLeadCategories, countLeadsByCategory, createLeadCategory,
    deleteLeadCategory, leadCategoryInputError, listLeadCategories, resolveLeadCategory, updateLeadCategory,
} from '../LeadCategoryService';
import { DEFAULT_LEAD_CATEGORIES, LEAD_CATEGORY_LIMIT, categoryNameKey } from '@/lib/leads/labels';

const shop = 'shop-1';
const buyer = '10000000-0000-4000-8000-000000000001';
const barter = '10000000-0000-4000-8000-000000000002';
const foreign = '10000000-0000-4000-8000-000000000003';
const missing = '10000000-0000-4000-8000-000000000009';
let memory: MemoryDb;
let db: SupabaseClient;

/** DB-ийн unique (shop_id, name key), FK (ашиглагдсан ангилал) ба 30-ын trigger-ийг дуурайна. */
function setup(categories: Record<string, unknown>[], leads: Record<string, unknown>[] = []) {
    memory = createMemoryDb({ lead_categories: categories, leads, lead_activities: [] }, {
        insert: (table, row, rows) => {
            if (table !== 'lead_categories') return null;
            if (rows.filter((other) => other.shop_id === row.shop_id).length >= LEAD_CATEGORY_LIMIT) return { code: '23514', message: 'lead_category_limit' };
            return rows.some((other) => other.shop_id === row.shop_id && categoryNameKey(other.name) === categoryNameKey(row.name))
                ? { code: '23505', message: 'duplicate key' } : null;
        },
        delete: (table, row) => table === 'lead_categories' && memory.tables.leads.some((lead) => lead.category_id === row.id)
            ? { code: '23503', message: 'violates foreign key' } : null,
    });
    db = memory as unknown as SupabaseClient;
}

const category = (id: string, name: string, extra: Record<string, unknown> = {}) =>
    ({ id, shop_id: shop, name, description: null, tone: 'neutral', sort_order: 10, is_active: true, ...extra });

beforeEach(() => {
    audit.entries = [];
    setup([
        category(buyer, 'Хөрөнгө оруулагч', { tone: 'success', sort_order: 20 }),
        category(barter, 'Бартер', { sort_order: 10, is_active: false }),
        { ...category(foreign, 'Түрээслэгч'), shop_id: 'shop-2' },
    ]);
});

describe('LeadCategoryService reads', () => {
    it('lists the shop categories in order and hides archived unless asked', async () => {
        expect((await listLeadCategories(db, shop)).map((c) => c.name)).toEqual(['Хөрөнгө оруулагч']);
        expect((await listLeadCategories(db, shop, { includeArchived: true })).map((c) => c.name)).toEqual(['Бартер', 'Хөрөнгө оруулагч']);
        memory.failNext.lead_categories = { code: '57014', message: 'timeout' };
        await expect(listLeadCategories(db, shop)).rejects.toMatchObject({ code: '57014' });
    });

    it('counts active leads per category and uncategorized leads', async () => {
        memory.tables.leads = [
            { id: 'a', shop_id: shop, category_id: buyer, deleted_at: null },
            { id: 'b', shop_id: shop, category_id: buyer, deleted_at: '2026-10-01' },
            { id: 'c', shop_id: shop, category_id: null, deleted_at: null },
            { id: 'd', shop_id: 'shop-2', category_id: null, deleted_at: null },
        ];
        expect(await countLeadsByCategory(db, shop, [buyer, barter])).toEqual({ byCategory: { [buyer]: 1, [barter]: 0 }, uncategorized: 1 });
    });
});

describe('resolveLeadCategory', () => {
    it('accepts an active id of the same shop and clears with null or an empty id', async () => {
        expect(await resolveLeadCategory(db, shop, { id: buyer })).toMatchObject({ ok: true, categoryId: buyer });
        expect(await resolveLeadCategory(db, shop, { id: null })).toEqual({ ok: true, categoryId: null, category: null });
        expect(await resolveLeadCategory(db, shop, { id: '' })).toEqual({ ok: true, categoryId: null, category: null });
    });

    it('rejects malformed, foreign, missing and newly archived ids but keeps the current archived one', async () => {
        expect(await resolveLeadCategory(db, shop, { id: 'nope' })).toMatchObject({ ok: false, status: 400, error: 'Буруу ангилал' });
        expect(await resolveLeadCategory(db, shop, { id: foreign })).toMatchObject({ ok: false, status: 400, error: 'Ангилал олдсонгүй' });
        expect(await resolveLeadCategory(db, shop, { id: missing })).toMatchObject({ ok: false, status: 400 });
        expect(await resolveLeadCategory(db, shop, { id: barter })).toMatchObject({ ok: false, status: 400, error: expect.stringContaining('архивлагдсан') });
        expect(await resolveLeadCategory(db, shop, { id: barter }, { current: barter })).toMatchObject({ ok: true, categoryId: barter });
        memory.failNext.lead_categories = { code: '57014', message: 'timeout' };
        expect(await resolveLeadCategory(db, shop, { id: buyer })).toMatchObject({ ok: false, status: 503 });
    });

    it('matches names exactly but case- and space-insensitively and never guesses', async () => {
        expect(await resolveLeadCategory(db, shop, { name: '  хөрөнгө   ОРУУЛАГЧ ' })).toMatchObject({ ok: true, categoryId: buyer });
        for (const name of ['', 'none', 'Ангилалгүй', ' ангилалгүй ', null]) {
            expect(await resolveLeadCategory(db, shop, { name })).toEqual({ ok: true, categoryId: null, category: null });
        }
        const unknown = await resolveLeadCategory(db, shop, { name: 'Хөрөнгө' });
        expect(unknown).toMatchObject({ ok: false, status: 400 });
        expect((unknown as { error: string }).error).toContain('Боломжтой ангилал: Хөрөнгө оруулагч');
        expect((unknown as { error: string }).error).not.toContain('Бартер');
        // Өөр төслийн ангилал нэрээр ч олдохгүй.
        expect(await resolveLeadCategory(db, shop, { name: 'Түрээслэгч' })).toMatchObject({ ok: false, status: 400 });
        expect(await resolveLeadCategory(db, shop, { name: 'Бартер' })).toMatchObject({ ok: false, status: 400 });
        expect(await resolveLeadCategory(db, shop, { name: 'бартер' }, { allowArchived: true })).toMatchObject({ ok: true, categoryId: barter });
    });

    it('explains when the project has no categories yet', async () => {
        setup([]);
        const result = await resolveLeadCategory(db, shop, { name: 'Бартер' });
        expect((result as { error: string }).error).toContain('Тохиргоо → Лидийн ангилал');
    });
});

describe('LeadCategoryService writes', () => {
    it('validates input with a strict Mongolian allow-list', () => {
        expect(CreateLeadCategorySchema.parse({ name: '  Дилер   / Агент ', description: '  ' })).toEqual({ name: 'Дилер / Агент', description: null });
        for (const input of [{ name: '' }, { name: 'Ангилалгүй' }, { name: 'x'.repeat(61) }, { name: 'A', tone: 'danger' }, { name: 'A', shop_id: shop }]) {
            const parsed = CreateLeadCategorySchema.safeParse(input);
            expect(parsed.success, JSON.stringify(input)).toBe(false);
            expect(leadCategoryInputError(parsed.error!)).toMatch(/[А-Яа-яӨөҮү]/);
        }
        expect(UpdateLeadCategorySchema.safeParse({}).success).toBe(false);
        expect(UpdateLeadCategorySchema.safeParse({ is_active: false }).success).toBe(true);
        expect(leadCategoryInputError(UpdateLeadCategorySchema.safeParse({ shop_id: 'x' }).error!)).toBe('Зөвшөөрөгдөөгүй талбар: shop_id');
    });

    it('creates with the next sort order, refuses duplicates (also archived) and audits', async () => {
        const created = await createLeadCategory(db, shop, { name: 'Дилер / Агент', tone: 'info' }, 'admin-1');
        expect(created).toMatchObject({ ok: true, category: { name: 'Дилер / Агент', tone: 'info', sort_order: 30 } });
        expect(memory.writes.at(-1)).toMatchObject({ table: 'lead_categories', op: 'insert', data: { shop_id: shop, created_by: 'admin-1' } });
        expect(audit.entries).toEqual([expect.objectContaining({ entity: 'lead_category', action: 'create', actorId: 'admin-1' })]);
        expect(await createLeadCategory(db, shop, { name: 'ХӨРӨНГӨ ОРУУЛАГЧ' }, null)).toMatchObject({ ok: false, status: 409 });
        expect(await createLeadCategory(db, shop, { name: 'бартер' }, null)).toMatchObject({ ok: false, status: 409, error: expect.stringContaining('архив') });
        // Өөр төсөлд ижил нэртэй байж болно.
        expect(await createLeadCategory(db, 'shop-2', { name: 'Бартер' }, null)).toMatchObject({ ok: true });
    });

    it('enforces the per-project cap and maps a racing duplicate to 409', async () => {
        setup(Array.from({ length: LEAD_CATEGORY_LIMIT }, (_, i) => category(`id-${i}`, `Ангилал ${i}`)));
        expect(await createLeadCategory(db, shop, { name: 'Илүү' }, null)).toMatchObject({ ok: false, status: 400, error: expect.stringContaining('30') });
        // Зэрэг нэмсэн давхардал (DB unique) → 409.
        const raced = createMemoryDb({ lead_categories: [] }, { insert: () => ({ code: '23505', message: 'duplicate key' }) });
        expect(await createLeadCategory(raced as unknown as SupabaseClient, shop, { name: 'Шинэ' }, null)).toMatchObject({ ok: false, status: 409 });
    });

    it('updates allow-listed fields, rejects renames onto another category and audits only real changes', async () => {
        expect(await updateLeadCategory(db, shop, buyer, { name: 'Бартер' }, null)).toMatchObject({ ok: false, status: 409 });
        expect(await updateLeadCategory(db, shop, foreign, { is_active: false }, null)).toMatchObject({ ok: false, status: 404 });
        expect(await updateLeadCategory(db, shop, 'bad', { is_active: false }, null)).toMatchObject({ ok: false, status: 400 });
        const renamed = await updateLeadCategory(db, shop, buyer, { name: 'хөрөнгө оруулагч', tone: 'success' }, 'admin-1');
        expect(renamed).toMatchObject({ ok: true, category: { name: 'хөрөнгө оруулагч', tone: 'success' } });
        expect(audit.entries).toEqual([expect.objectContaining({ action: 'update', changes: { name: { from: 'Хөрөнгө оруулагч', to: 'хөрөнгө оруулагч' } } })]);
        expect(await updateLeadCategory(db, shop, barter, { is_active: true }, null)).toMatchObject({ ok: true, category: { is_active: true } });
    });

    it('deletes only unused categories, counting soft-deleted leads too', async () => {
        memory.tables.leads = [{ id: 'gone', shop_id: shop, category_id: buyer, deleted_at: '2026-09-01' }];
        expect(await deleteLeadCategory(db, shop, buyer, null)).toMatchObject({ ok: false, status: 409, error: expect.stringContaining('Архивлана') });
        expect(await deleteLeadCategory(db, shop, foreign, null)).toMatchObject({ ok: false, status: 404 });
        expect(await deleteLeadCategory(db, shop, barter, 'admin-1')).toEqual({ ok: true, id: barter });
        expect(memory.tables.lead_categories.map((c) => c.id)).toEqual([buyer, foreign]);
        expect(audit.entries).toEqual([expect.objectContaining({ action: 'delete', entityId: barter })]);
    });

    it('adds the suggested categories idempotently, skipping existing names and respecting the cap', async () => {
        setup([category(barter, 'бартер', { is_active: false })]);
        const first = await addDefaultLeadCategories(db, shop, 'admin-1');
        expect(first).toMatchObject({ ok: true, skipped: 1 });
        expect((first as { created: { name: string }[] }).created.map((c) => c.name))
            .toEqual(DEFAULT_LEAD_CATEGORIES.filter((preset) => preset.name !== 'Бартер').map((preset) => preset.name));
        expect(await addDefaultLeadCategories(db, shop, 'admin-1')).toMatchObject({ ok: true, created: [], skipped: DEFAULT_LEAD_CATEGORIES.length });
        expect(memory.tables.lead_categories).toHaveLength(DEFAULT_LEAD_CATEGORIES.length);

        setup(Array.from({ length: LEAD_CATEGORY_LIMIT - 2 }, (_, i) => category(`id-${i}`, `Ангилал ${i}`)));
        const capped = await addDefaultLeadCategories(db, shop, null);
        expect((capped as { created: unknown[] }).created).toHaveLength(2);
        expect(memory.tables.lead_categories).toHaveLength(LEAD_CATEGORY_LIMIT);
    });
});

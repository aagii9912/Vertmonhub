import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { CreateServiceLogSchema, UpdateServiceLogSchema, createServiceLog, serviceLogInputError, updateServiceLog } from '../ServiceLogService';

type Row = Record<string, unknown>;
const contractId = '00000000-0000-4000-8000-000000000010';
const customerId = '00000000-0000-4000-8000-000000000020';

/** Шүүлтүүрийг хүндэтгэдэг жижиг Supabase хуурамч (insert/update-ийг бүртгэнэ). */
function fakeDb(tables: Record<string, Row[]>) {
    const writes: Array<{ table: string; kind: 'insert' | 'update'; values: Row }> = [];
    const db = { from(table: string) {
        const filters: Array<(row: Row) => boolean> = [];
        let pending: { kind: 'insert' | 'update'; values: Row } | null = null;
        const rows = () => (tables[table] ?? []).filter(row => filters.every(filter => filter(row)));
        const run = () => {
            if (pending?.kind === 'insert') {
                const row = { id: `log-${(tables[table] ?? []).length + 1}`, ...pending.values };
                (tables[table] ??= []).push(row);
                writes.push({ table, ...pending });
                return { data: row, error: null };
            }
            if (pending?.kind === 'update') {
                const matched = rows();
                matched.forEach(row => Object.assign(row, pending!.values));
                writes.push({ table, ...pending });
                return { data: matched[0] ?? null, error: null };
            }
            return { data: rows()[0] ?? null, error: null };
        };
        const chain: Record<string, unknown> = {
            select: () => chain,
            eq: (key: string, value: unknown) => { filters.push(row => row[key] === value); return chain; },
            is: (key: string, value: unknown) => { filters.push(row => (row[key] ?? null) === value); return chain; },
            insert: (values: Row) => { pending = { kind: 'insert', values }; return chain; },
            update: (values: Row) => { pending = { kind: 'update', values }; return chain; },
            single: async () => run(), maybeSingle: async () => run(),
            then: (resolve: (value: unknown) => unknown) => Promise.resolve({ data: rows(), error: null }).then(resolve),
        };
        return chain;
    } } as unknown as SupabaseClient;
    return { db, writes, tables };
}

const roster = () => [
    { shop_id: 'shop', name: 'Номин', user_id: 'user-nomin', is_active: true },
    { shop_id: 'shop', name: 'Сараа', user_id: null, is_active: true },
    { shop_id: 'shop', name: 'Хуучин', user_id: null, is_active: false },
];
const profiles = () => [{ id: 'user-nomin', full_name: 'Номин Бат' }, { id: 'user-admin', full_name: 'Админ Дорж' }, { id: 'user-saraa', full_name: 'Сараа' }];
const create = (input: Record<string, unknown>) => CreateServiceLogSchema.parse({ subject: 'Цахилгааны асуудал', ...input });

beforeEach(() => vi.useRealTimers());

describe('service log input', () => {
    it('accepts every UI type including suggestion and rejects unknown fields with Mongolian errors', () => {
        expect(CreateServiceLogSchema.safeParse({ subject: 'Санал', type: 'suggestion', channel: 'phone' }).success).toBe(true);
        const unknown = CreateServiceLogSchema.safeParse({ subject: 'x', shop_id: 'other' });
        expect(unknown.success).toBe(false);
        expect(serviceLogInputError(unknown.error!)).toBe('Зөвшөөрөгдөөгүй талбар: shop_id');
        expect(serviceLogInputError(CreateServiceLogSchema.safeParse({ subject: 'x', type: 'bug' }).error!)).toBe('Буруу төрөл');
        expect(serviceLogInputError(CreateServiceLogSchema.safeParse({ subject: '  ' }).error!)).toBe('Гарчиг шаардлагатай');
        // Хоосон маягтын талбар null болно.
        expect(create({ customer_id: '', channel: '', description: '  ' })).toMatchObject({ customer_id: null, channel: null, description: null, type: 'inquiry', priority: 'medium', status: 'open' });
    });

    it('validates the patch allow-list', () => {
        expect(UpdateServiceLogSchema.safeParse({}).success).toBe(false);
        expect(UpdateServiceLogSchema.safeParse({ status: 'done' }).success).toBe(false);
        expect(UpdateServiceLogSchema.safeParse({ satisfaction_rating: 6 }).success).toBe(false);
        expect(UpdateServiceLogSchema.safeParse({ assigned_to: 'Номин' }).success).toBe(false);
        expect(UpdateServiceLogSchema.parse({ manager_name: '' })).toEqual({ manager_name: null });
    });
});

describe('createServiceLog', () => {
    it('uses an explicit active roster manager and rejects other names', async () => {
        const { db, writes } = fakeDb({ sales_managers: roster(), user_profiles: profiles() });
        const result = await createServiceLog(db, { shopId: 'shop', userId: 'user-admin', input: create({ manager_name: 'Сараа', type: 'suggestion' }) });
        expect(result).toMatchObject({ ok: true });
        expect(writes[0].values).toMatchObject({ shop_id: 'shop', type: 'suggestion', manager_name: 'Сараа', assigned_to: 'Сараа', resolved_at: null, resolved_by: null });
        expect(await createServiceLog(db, { shopId: 'shop', userId: 'user-admin', input: create({ manager_name: 'Хуучин' }) })).toMatchObject({ ok: false, status: 400 });
        expect(writes).toHaveLength(1);
    });

    it('defaults to the linked contract manager, then to the creator roster name, then to nobody', async () => {
        const { db, writes } = fakeDb({ sales_managers: roster(), user_profiles: profiles(),
            property_contracts: [{ id: contractId, shop_id: 'shop', sales_manager: 'Сараа', deleted_at: null }],
            customers: [{ id: customerId, shop_id: 'shop', deleted_at: null }] });
        await createServiceLog(db, { shopId: 'shop', userId: 'user-nomin', input: create({ contract_id: contractId, customer_id: customerId }) });
        expect(writes[0].values).toMatchObject({ manager_name: 'Сараа', contract_id: contractId, customer_id: customerId });
        await createServiceLog(db, { shopId: 'shop', userId: 'user-nomin', input: create({}) });
        expect(writes[1].values).toMatchObject({ manager_name: 'Номин', assigned_to: 'Номин' });
        await createServiceLog(db, { shopId: 'shop', userId: 'user-admin', input: create({}) });
        // Бүртгэлгүй админ: хариуцагчгүй; профайлын нэр assigned_to-д бичигдэхгүй (нэрээр менежерт оноогдохгүй).
        expect(writes[2].values).toMatchObject({ manager_name: null, assigned_to: null });
        // Хуучин клиентийн assigned_to бүртгэлийн нэртэй таарвал хариуцагч болно.
        await createServiceLog(db, { shopId: 'shop', userId: 'user-admin', input: create({ assigned_to: 'Сараа' }) });
        expect(writes[3].values).toMatchObject({ manager_name: 'Сараа' });
        // Профайлын нэр нь дансгүй бүртгэлтэй ижил хэрэглэгч — данс холбоогүй тул хариуцагч болохгүй.
        await createServiceLog(db, { shopId: 'shop', userId: 'user-saraa', input: create({}) });
        expect(writes[4].values).toMatchObject({ manager_name: null, assigned_to: null });
    });

    it('refuses links to another project and stamps resolution when created resolved', async () => {
        const { db, writes } = fakeDb({ sales_managers: roster(), user_profiles: profiles(),
            property_contracts: [{ id: contractId, shop_id: 'other-shop', sales_manager: 'Сараа', deleted_at: null }], customers: [] });
        expect(await createServiceLog(db, { shopId: 'shop', userId: 'user-nomin', input: create({ contract_id: contractId }) })).toMatchObject({ ok: false, status: 404, error: 'Холбох гэрээ олдсонгүй' });
        expect(await createServiceLog(db, { shopId: 'shop', userId: 'user-nomin', input: create({ customer_id: customerId }) })).toMatchObject({ ok: false, status: 404 });
        expect(writes).toHaveLength(0);
        await createServiceLog(db, { shopId: 'shop', userId: 'user-nomin', input: create({ status: 'resolved' }) });
        expect(writes[0].values).toMatchObject({ status: 'resolved', resolved_by: 'user-nomin' });
        expect(typeof writes[0].values.resolved_at).toBe('string');
    });
});

describe('updateServiceLog', () => {
    const log = (values: Row) => ({ id: 'log-1', shop_id: 'shop', status: 'open', resolved_at: null, resolved_by: null, manager_name: null, ...values });

    it('stamps resolution once, keeps it when closing and clears it on reopen', async () => {
        vi.useFakeTimers({ now: new Date('2026-10-04T03:00:00Z') });
        const { db, tables } = fakeDb({ service_logs: [log({})], sales_managers: roster() });
        const patch = (value: Row) => updateServiceLog(db, { shopId: 'shop', id: 'log-1', userId: 'user-nomin', patch: UpdateServiceLogSchema.parse(value) });
        expect(await patch({ status: 'resolved' })).toMatchObject({ ok: true });
        expect(tables.service_logs[0]).toMatchObject({ status: 'resolved', resolved_at: '2026-10-04T03:00:00.000Z', resolved_by: 'user-nomin' });
        vi.setSystemTime(new Date('2026-10-06T03:00:00Z'));
        await patch({ status: 'closed' });
        expect(tables.service_logs[0]).toMatchObject({ status: 'closed', resolved_at: '2026-10-04T03:00:00.000Z' });
        await patch({ status: 'in_progress' });
        expect(tables.service_logs[0]).toMatchObject({ status: 'in_progress', resolved_at: null, resolved_by: null });
    });

    it('validates reassignment against the roster and scopes to the shop', async () => {
        const { db, tables } = fakeDb({ service_logs: [log({}), log({ id: 'log-2', shop_id: 'other' })], sales_managers: roster() });
        const patch = (id: string, value: Row) => updateServiceLog(db, { shopId: 'shop', id, userId: 'user-nomin', patch: UpdateServiceLogSchema.parse(value) });
        expect(await patch('log-1', { manager_name: 'Бүртгэлгүй' })).toMatchObject({ ok: false, status: 400 });
        expect(await patch('log-1', { manager_name: 'Номин', priority: 'urgent' })).toMatchObject({ ok: true });
        expect(tables.service_logs[0]).toMatchObject({ manager_name: 'Номин', assigned_to: 'Номин', priority: 'urgent' });
        await patch('log-1', { manager_name: null });
        expect(tables.service_logs[0]).toMatchObject({ manager_name: null, assigned_to: null });
        expect(await patch('log-2', { priority: 'low' })).toMatchObject({ ok: false, status: 404 });
        expect(tables.service_logs[1]).not.toHaveProperty('priority');
    });
});

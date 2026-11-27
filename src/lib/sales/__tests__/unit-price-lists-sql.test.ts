// @vitest-environment node
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { expect, it } from 'vitest';

const shop = '10000000-0000-4000-8000-000000000001';
const actor = '20000000-0000-4000-8000-000000000001';
const unit = (code: string, prices: Record<string, number> = { '50%': 49_900_000 }) => ({ block: '201', code, model: 'Энгийн', area_sqm: 12.5, prices });
const config = (rows: object[], valid_from: string | null = '2026-10-08', valid_until: string | null = '2026-12-31') => ({
    source: 'PQ-ZP-206-005', valid_from, valid_until, note: '', conditions: [{ label: '50%', advance_percent: 50 }, { label: 'Үнэ', advance_percent: null }], rows });

async function setup() {
    const db = new PGlite();
    await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
        CREATE TABLE shops(id uuid PRIMARY KEY,user_id uuid);
        CREATE TABLE shop_members(shop_id uuid,user_id uuid);
        CREATE TABLE user_roles(user_id uuid,role text);
        CREATE TABLE admin_audit_log(actor_id uuid,action text,target_id text,meta jsonb);`);
    await db.query('INSERT INTO shops VALUES($1,$2)', [shop, actor]);
    await db.query("INSERT INTO user_roles VALUES($1,'super_admin')", [actor]);
    const sql = readFileSync('supabase/migrations/20261127140000_unit_price_lists.sql', 'utf8');
    await db.exec(sql); await db.exec(sql);
    return db;
}
const save = (db: PGlite, list: string, name: string, version: number, status: string, value: object, category = 'parking', by = actor) =>
    db.query<{ result: { version: number; status: string; category: string } }>('SELECT save_project_unit_price_list($1,$2,$3,$4,$5,$6,$7,$8::jsonb) result', [shop, by, list, name, category, version, status, JSON.stringify(value)]);
const rows = async (db: PGlite) => (await db.query<{ list_key: string; version: number; status: string }>('SELECT list_key,version,status FROM project_unit_price_lists ORDER BY list_key,version')).rows.map(row => `${row.list_key}:${row.version}:${row.status}`);

it('versions each list, archives its previous active version on activation, and audits without the full price table', async () => {
    const db = await setup();
    try {
        expect((await save(db, 'zp-201', ' 201, 202-р блокийн зогсоол ', 0, 'draft', config([unit('201-160')]))).rows[0].result).toMatchObject({ version: 1, status: 'draft', category: 'parking' });
        await save(db, 'zp-201', '201, 202-р блокийн зогсоол', 1, 'active', config([unit('201-160'), unit('201-161', { 'Үнэ': 52_000_000 })]));
        await save(db, 'zp-203', '203-р блокийн зогсоол', 0, 'active', config([unit('203-11')], '2026-10-08', null));
        await save(db, 'zp-201', '201, 202-р блокийн зогсоол', 2, 'active', config([unit('201-160')]));
        expect(await rows(db)).toEqual(['zp-201:1:draft', 'zp-201:2:archived', 'zp-201:3:active', 'zp-203:1:active']);
        await expect(save(db, 'zp-201', '201, 202-р блокийн зогсоол', 2, 'draft', config([]))).rejects.toMatchObject({ code: '40001' });
        const audit = (await db.query<{ action: string; meta: Record<string, unknown> }>("SELECT action, meta FROM admin_audit_log ORDER BY (meta->>'after_version')::int, meta->>'list_key'")).rows;
        expect(audit).toHaveLength(4);
        expect(audit[0].meta).toMatchObject({ list_key: 'zp-201', category: 'parking', rows: 1, valid_until: '2026-12-31' });
        expect(audit[0].meta).not.toHaveProperty('config');
    } finally { await db.close(); }
}, 30_000);

it('refuses malformed prices, unknown conditions, duplicate codes and names, a changed kind and overlapping active lists, writing nothing', async () => {
    const db = await setup();
    try {
        await save(db, 'zp-201', 'Зогсоол 201', 0, 'active', config([unit('201-160')], '2026-10-08', null));
        const before = await rows(db);
        const bad = [
            config([unit('201-161', { '30%': 1 })]), config([unit('201-161', { '50%': 49_900_000.5 })]), config([unit('201-161', { '50%': 0 })]),
            config([{ ...unit('201-161'), code: '' }]), config([{ ...unit('201-161'), extra: 1 }]), { ...config([unit('201-161')]), extra: 1 },
            { ...config([unit('201-161')]), conditions: [{ label: '50%', advance_percent: 50 }, { label: '50%', advance_percent: 30 }] },
            { ...config([unit('201-161')]), conditions: [{ label: '50%', advance_percent: 150 }] },
            config([unit('201-161')], '2026-12-31', '2026-10-08'),
        ];
        for (const value of bad) await expect(save(db, 'zp-new', 'Шинэ', 0, 'draft', value)).rejects.toMatchObject({ code: '22023' });
        // Activation needs a source, a start day, a price for every unit and unique codes.
        for (const value of [{ ...config([unit('201-161')]), source: ' ' }, config([unit('201-161')], null, null), config([unit('201-161', {})]), config([unit('201-161'), unit(' 201-161 ')]), config([])]) {
            await expect(save(db, 'zp-new', 'Шинэ', 0, 'active', value)).rejects.toMatchObject({ code: '22023' });
        }
        await expect(save(db, 'zp-new', 'зогсоол 201', 0, 'draft', config([]))).rejects.toMatchObject({ code: '23505' });
        await expect(save(db, 'zp-201', 'Зогсоол 201', 1, 'draft', config([]), 'industry')).rejects.toMatchObject({ code: '22023' });
        await expect(save(db, 'zp-new', 'Шинэ', 0, 'draft', config([]), 'residential')).rejects.toMatchObject({ code: '22023' });
        // The same space in another active parking list on the same days (the first list has no end day).
        await expect(save(db, 'zp-new', 'Шинэ', 0, 'active', config([unit('201-160')], '2027-06-01', '2027-06-30'))).rejects.toMatchObject({ code: '23P01' });
        expect(await rows(db)).toEqual(before);
        // Before the first list starts, another space, or another kind of unit with the same code: fine.
        await save(db, 'zp-new', 'Шинэ', 0, 'active', config([unit('201-160')], '2026-09-01', '2026-10-07'));
        await save(db, 'zp-other', 'Бусад', 0, 'active', config([unit('201-161')]));
        await save(db, 'storage', 'Агуулах 201', 0, 'active', config([unit('201-160')]), 'industry');
    } finally { await db.close(); }
}, 30_000);

it('withdraws one list active price and keeps table and functions server-only', async () => {
    const db = await setup();
    const retire = (list: string, version: number, by = actor) => db.query<{ result: { status: string } }>('SELECT retire_project_unit_price_list($1,$2,$3,$4) result', [shop, by, list, version]);
    try {
        await save(db, 'zp-201', 'Зогсоол 201', 0, 'active', config([unit('201-160')]));
        await expect(retire('zp-201', 2)).rejects.toMatchObject({ code: '40001' });
        expect((await retire('zp-201', 1)).rows[0].result.status).toBe('archived');
        await expect(retire('zp-201', 1)).rejects.toMatchObject({ code: 'P0002' });
        expect((await db.query<{ stamped: boolean }>('SELECT archived_at IS NOT NULL stamped FROM project_unit_price_lists')).rows[0].stamped).toBe(true);
        const stranger = '20000000-0000-4000-8000-000000000009';
        await expect(save(db, 'x', 'X', 0, 'draft', config([]), 'parking', stranger)).rejects.toMatchObject({ code: '42501' });
        await expect(retire('zp-201', 1, stranger)).rejects.toMatchObject({ code: '42501' });
        await db.exec('SET ROLE authenticated');
        await expect(db.query('SELECT * FROM project_unit_price_lists')).rejects.toMatchObject({ code: '42501' });
        await expect(save(db, 'x', 'X', 0, 'draft', config([]))).rejects.toMatchObject({ code: '42501' });
        await db.exec('RESET ROLE; SET ROLE service_role');
        await expect(db.query("UPDATE project_unit_price_lists SET status='active'")).rejects.toMatchObject({ code: '42501' });
        expect((await db.query('SELECT 1 FROM project_unit_price_lists')).rows).toHaveLength(1);
    } finally { await db.close(); }
}, 30_000);

// @vitest-environment node
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { expect, it } from 'vitest';

const shop = '10000000-0000-4000-8000-000000000001';
const other = '10000000-0000-4000-8000-000000000003';
const actor = '20000000-0000-4000-8000-000000000001';
const rule = (block: string, floor_min = 2, floor_max = 9) => ({ block, model: 'A', floor_min, floor_max, payment_condition: '50%', price_per_sqm: 4_000_000, advance_percent: 50 });
const config = (rules: object[], valid_from = '2026-11-01', valid_until = '2027-02-28') => ({ source: 'Баталсан үнэ', valid_from, valid_until, inventory_area_confirmed: true, rules });

/** The pricing migration with rows saved before price lists, then this migration twice (idempotent). */
async function setup() {
    const db = new PGlite();
    await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
        CREATE TABLE shops(id uuid PRIMARY KEY,user_id uuid);
        CREATE TABLE shop_members(shop_id uuid,user_id uuid);
        CREATE TABLE user_roles(user_id uuid,role text);
        CREATE TABLE admin_audit_log(actor_id uuid,action text,target_id text,meta jsonb);`);
    await db.query('INSERT INTO shops VALUES($1,$2),($3,$2)', [shop, actor, other]);
    await db.query("INSERT INTO user_roles VALUES($1,'super_admin')", [actor]);
    await db.exec(readFileSync('supabase/migrations/20261008120000_project_pricing.sql', 'utf8'));
    await db.query('SELECT save_project_pricing($1,$2,0,$3,$4::jsonb)', [shop, actor, 'active', JSON.stringify(config([rule('201')], '2026-10-01', '2026-10-31'))]);
    const sql = readFileSync('supabase/migrations/20261127120000_project_price_lists.sql', 'utf8');
    await db.exec(sql); await db.exec(sql);
    const step = readFileSync('supabase/migrations/20261127130000_price_list_step.sql', 'utf8');
    await db.exec(step); await db.exec(step);
    return db;
}
const save = (db: PGlite, list: string, name: string, version: number, status: string, value: object, target = shop) =>
    db.query<{ result: { version: number; list_key: string; list_name: string } }>('SELECT save_project_price_list($1,$2,$3,$4,$5,$6,$7::jsonb) result', [target, actor, list, name, version, status, JSON.stringify(value)]);
const rows = async (db: PGlite) => (await db.query<{ list_key: string; version: number; status: string }>(
    'SELECT list_key,version,status FROM project_pricing_configs WHERE shop_id=$1 ORDER BY list_key,version', [shop])).rows.map(row => `${row.list_key}:${row.version}:${row.status}`);

it('keeps earlier versions as the default list and still serves the single-list entry point', async () => {
    const db = await setup();
    try {
        expect((await db.query('SELECT list_key,list_name,version,status,archived_at FROM project_pricing_configs')).rows)
            .toEqual([{ list_key: 'main', list_name: 'Үндсэн үнэ', version: 1, status: 'active', archived_at: null }]);
        // Code deployed before price lists keeps saving the default list through the old function.
        await db.query('SELECT save_project_pricing($1,$2,1,$3,$4::jsonb)', [shop, actor, 'active', JSON.stringify(config([rule('201')]))]);
        expect(await rows(db)).toEqual(['main:1:archived', 'main:2:active']);
        expect((await db.query<{ stamped: boolean }>("SELECT archived_at IS NOT NULL stamped FROM project_pricing_configs WHERE version=1")).rows[0].stamped).toBe(true);
    } finally { await db.close(); }
}, 30_000);

it('versions each list on its own: activating one list never archives another, and stale saves are per list', async () => {
    const db = await setup();
    try {
        expect((await save(db, 'forest-garden', ' Forest Garden тусгай үнэ ', 0, 'active', config([rule('503')], '2026-11-01', '2026-12-31'))).rows[0].result)
            .toMatchObject({ version: 1, list_key: 'forest-garden', list_name: 'Forest Garden тусгай үнэ' });
        expect(await rows(db)).toEqual(['forest-garden:1:active', 'main:1:active']);
        await save(db, 'main', 'Үндсэн үнэ', 1, 'active', config([rule('201')]));
        await save(db, 'forest-garden', 'Forest Garden тусгай үнэ', 1, 'draft', config([rule('503')]));
        expect(await rows(db)).toEqual(['forest-garden:1:active', 'forest-garden:2:draft', 'main:1:archived', 'main:2:active']);
        // The default list is at version 2, the special list at 2: each checks its own latest version.
        await expect(save(db, 'forest-garden', 'Forest Garden тусгай үнэ', 1, 'draft', config([rule('503')]))).rejects.toMatchObject({ code: '40001' });
        await expect(save(db, 'new-list', 'Шинэ', 2, 'draft', config([]))).rejects.toMatchObject({ code: '40001' });
        // Another project's lists are separate: same key, own versions.
        expect((await save(db, 'forest-garden', 'Forest Garden тусгай үнэ', 0, 'active', config([rule('503')]), other)).rows[0].result.version).toBe(1);
        expect((await db.query<{ meta: { list_key: string } }>("SELECT meta FROM admin_audit_log WHERE action='pricing.active' ORDER BY (meta->>'after_version')::int DESC LIMIT 1")).rows[0].meta.list_key).toBeDefined();
    } finally { await db.close(); }
}, 30_000);

it('refuses a second active price for the same unit, condition and days, and a duplicate list name, writing nothing', async () => {
    const db = await setup();
    try {
        await save(db, 'main', 'Үндсэн үнэ', 1, 'active', config([rule('201'), rule('503', 2, 9)], '2026-11-01', '2026-12-31'));
        const before = await rows(db);
        const audits = (await db.query('SELECT 1 FROM admin_audit_log')).rows.length;
        // Same block, model, condition, overlapping floors and days.
        await expect(save(db, 'special', 'Тусгай үнэ', 0, 'active', config([rule('503', 9, 12)], '2026-12-31', '2027-01-31'))).rejects.toMatchObject({ code: '23P01' });
        await expect(save(db, 'special', ' үндсэн ҮНЭ ', 0, 'draft', config([]))).rejects.toMatchObject({ code: '23505' });
        await expect(save(db, 'Special', 'Тусгай үнэ', 0, 'draft', config([]))).rejects.toMatchObject({ code: '22023' });
        await expect(save(db, 'special', '   ', 0, 'draft', config([]))).rejects.toMatchObject({ code: '22023' });
        expect(await rows(db)).toEqual(before);
        expect((await db.query('SELECT 1 FROM admin_audit_log')).rows).toHaveLength(audits);
        // A draft may overlap (it prices nothing); other floors, or the days after the default list ends, are fine.
        await save(db, 'special', 'Тусгай үнэ', 0, 'draft', config([rule('503', 9, 12)], '2026-12-31', '2027-01-31'));
        await save(db, 'special', 'Тусгай үнэ', 1, 'active', config([rule('503', 10, 12)], '2026-12-01', '2026-12-31'));
        await save(db, 'special', 'Тусгай үнэ', 2, 'active', config([rule('503', 2, 12)], '2027-01-01', '2027-01-31'));
        // The default list cannot come back over the special price either.
        await expect(save(db, 'main', 'Үндсэн үнэ', 2, 'active', config([rule('503')], '2027-01-15', '2027-03-31'))).rejects.toMatchObject({ code: '23P01' });
        // Renaming a list to its own name is not a duplicate.
        await save(db, 'special', 'Тусгай үнэ', 3, 'draft', config([]));
    } finally { await db.close(); }
}, 30_000);

it('withdraws only the named list active price, audited, and rejects stale or empty withdrawals', async () => {
    const db = await setup();
    const retire = (list: string, version: number) => db.query<{ result: { status: string; version: number } }>('SELECT retire_project_price_list($1,$2,$3,$4) result', [shop, actor, list, version]);
    try {
        await save(db, 'special', 'Тусгай үнэ', 0, 'active', config([rule('503')]));
        await expect(retire('special', 2)).rejects.toMatchObject({ code: '40001' });
        await expect(retire('missing', 1)).rejects.toMatchObject({ code: '40001' });
        expect((await retire('special', 1)).rows[0].result).toMatchObject({ status: 'archived', version: 1 });
        expect(await rows(db)).toEqual(['main:1:active', 'special:1:archived']);
        expect((await db.query<{ stamped: boolean }>("SELECT archived_at IS NOT NULL stamped FROM project_pricing_configs WHERE list_key='special'")).rows[0].stamped).toBe(true);
        expect((await db.query<{ meta: { list_key: string; version: number } }>("SELECT meta FROM admin_audit_log WHERE action='pricing.retired'")).rows[0].meta).toMatchObject({ list_key: 'special', version: 1 });
        await expect(retire('special', 1)).rejects.toMatchObject({ code: 'P0002' });
        // The withdrawn price no longer blocks another list from pricing the same units.
        await save(db, 'main', 'Үндсэн үнэ', 1, 'active', config([rule('201'), rule('503')]));
    } finally { await db.close(); }
}, 30_000);

it('keeps the table and the new functions server-only', async () => {
    const db = await setup();
    try {
        await db.exec('SET ROLE authenticated');
        await expect(db.query('SELECT * FROM project_pricing_configs')).rejects.toMatchObject({ code: '42501' });
        await expect(save(db, 'special', 'Тусгай үнэ', 0, 'draft', config([]))).rejects.toMatchObject({ code: '42501' });
        await expect(db.query('SELECT retire_project_price_list($1,$2,$3,$4)', [shop, actor, 'main', 1])).rejects.toMatchObject({ code: '42501' });
        await db.exec('RESET ROLE; SET ROLE service_role');
        await expect(db.query("UPDATE project_pricing_configs SET status='archived'")).rejects.toMatchObject({ code: '42501' });
        await save(db, 'special', 'Тусгай үнэ', 0, 'draft', config([]));
        await db.exec('RESET ROLE');
        const stranger = '20000000-0000-4000-8000-000000000009';
        await expect(db.query('SELECT save_project_price_list($1,$2,$3,$4,0,$5,$6::jsonb)', [shop, stranger, 'x', 'X', 'draft', JSON.stringify(config([]))])).rejects.toMatchObject({ code: '42501' });
        await expect(db.query('SELECT retire_project_price_list($1,$2,$3,$4)', [shop, stranger, 'main', 1])).rejects.toMatchObject({ code: '42501' });
    } finally { await db.close(); }
}, 30_000);

it('stores a step price with the list and refuses a malformed one, writing nothing', async () => {
    const db = await setup();
    try {
        const stepped = { ...config([rule('503')], '2026-11-27', '2026-12-31'), step: { amount_per_sqm: 100_000, counts_from: '2026-11-27' } };
        expect((await save(db, 'forest-garden', 'Forest Garden тусгай үнэ', 0, 'active', stepped)).rows[0].result.version).toBe(1);
        expect((await db.query<{ step: object }>("SELECT config->'step' step FROM project_pricing_configs WHERE list_key='forest-garden'")).rows[0].step).toEqual(stepped.step);
        // A list without a step, or with an explicit null, is stored as before.
        await save(db, 'main', 'Үндсэн үнэ', 1, 'draft', config([rule('201')]));
        await save(db, 'main', 'Үндсэн үнэ', 2, 'draft', { ...config([rule('201')]), step: null });
        const before = await rows(db);
        for (const step of [{ amount_per_sqm: 0, counts_from: '2026-11-27' }, { amount_per_sqm: 100_000.5, counts_from: '2026-11-27' }, { amount_per_sqm: '100000', counts_from: '2026-11-27' },
            { amount_per_sqm: 100_000 }, { amount_per_sqm: 100_000, counts_from: '27.11.2026' }, { amount_per_sqm: 100_000, counts_from: '2026-11-27', per: 'block' }, 'yes', [100_000]]) {
            await expect(save(db, 'forest-garden', 'Forest Garden тусгай үнэ', 1, 'draft', { ...stepped, step })).rejects.toMatchObject({ code: '22023' });
        }
        await expect(save(db, 'forest-garden', 'Forest Garden тусгай үнэ', 1, 'draft', { ...stepped, extra: 1 })).rejects.toMatchObject({ code: '22023' });
        expect(await rows(db)).toEqual(before);
        // The single-list entry point still works after the redefinition.
        await db.query('SELECT save_project_pricing($1,$2,3,$3,$4::jsonb)', [shop, actor, 'draft', JSON.stringify(config([rule('201')]))]);
    } finally { await db.close(); }
}, 30_000);

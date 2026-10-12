// @vitest-environment node
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { expect, it } from 'vitest';

const shop = '10000000-0000-4000-8000-000000000001';
const actor = '20000000-0000-4000-8000-000000000001';
const foreign = '10000000-0000-4000-8000-000000000002';
const config = { source: 'Баталсан үнэ', valid_from: '2026-10-01', valid_until: '2026-10-31', inventory_area_confirmed: true,
    rules: [{ block: 'Б1', model: 'E3', floor_min: 2, floor_max: 9, payment_condition: '50%', price_per_sqm: 4_000_000, advance_percent: 50 }] };

async function setup() {
    const db = new PGlite();
    await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
        CREATE TABLE shops(id uuid PRIMARY KEY,user_id uuid);
        CREATE TABLE shop_members(shop_id uuid,user_id uuid);
        CREATE TABLE user_roles(user_id uuid,role text);
        CREATE TABLE admin_audit_log(actor_id uuid,action text,target_id text,meta jsonb);`);
    await db.query('INSERT INTO shops VALUES($1,$2),($3,NULL)', [shop, actor, foreign]);
    await db.query("INSERT INTO user_roles VALUES($1,'super_admin')", [actor]);
    const sql = readFileSync('supabase/migrations/20261008120000_project_pricing.sql', 'utf8');
    await db.exec(sql); await db.exec(sql);
    return db;
}

it('versions and audits offers atomically, preserves active rates while saving drafts, rejects stale saves', async () => {
    const db = await setup();
    const save = (version: number, status = 'active', value = config) => db.query<{ result: { version: number } }>('SELECT save_project_pricing($1,$2,$3,$4,$5::jsonb) result', [shop, actor, version, status, JSON.stringify(value)]);
    try {
        expect((await save(0)).rows[0].result.version).toBe(1);
        await save(1, 'draft');
        expect((await db.query<{ version: number }>("SELECT version FROM project_pricing_configs WHERE status='active'")).rows[0].version).toBe(1);
        await expect(save(1)).rejects.toMatchObject({ code: '40001' });
        await save(2);
        expect((await db.query<{ status: string; version: number }>('SELECT status,version FROM project_pricing_configs ORDER BY version')).rows).toEqual([{ status: 'archived', version: 1 }, { status: 'draft', version: 2 }, { status: 'active', version: 3 }]);
        expect((await db.query<{ count: number }>('SELECT count(*)::int count FROM admin_audit_log')).rows[0].count).toBe(3);
    } finally { await db.close(); }
}, 20_000);

it('rejects unconfirmed/ranged/overlapping rates and foreign shops, with no data or audit writes', async () => {
    const db = await setup();
    const save = (value: object, target = shop) => db.query('SELECT save_project_pricing($1,$2,0,$3,$4::jsonb)', [target, actor, 'active', JSON.stringify(value)]);
    try {
        for (const value of [{ ...config, inventory_area_confirmed: false }, { ...config, rules: [{ ...config.rules[0], advance_percent: null }] }, { ...config, rules: [config.rules[0], config.rules[0]] }, { ...config, rules: [{ ...config.rules[0], price_per_sqm: -1 }] }]) {
            await expect(save(value)).rejects.toMatchObject({ code: '22023' });
        }
        await expect(save(config, foreign)).rejects.toMatchObject({ code: '42501' });
        expect((await db.query('SELECT * FROM project_pricing_configs')).rows).toEqual([]);
        expect((await db.query('SELECT * FROM admin_audit_log')).rows).toEqual([]);
    } finally { await db.close(); }
}, 20_000);

it('revokes client and direct service writes while allowing only service RPC execution', async () => {
    const db = await setup();
    try {
        await db.exec('SET ROLE authenticated');
        await expect(db.query('SELECT * FROM project_pricing_configs')).rejects.toMatchObject({ code: '42501' });
        await expect(db.query('SELECT save_project_pricing($1,$2,0,$3,$4::jsonb)', [shop, actor, 'active', JSON.stringify(config)])).rejects.toMatchObject({ code: '42501' });
        await db.exec('RESET ROLE; SET ROLE service_role');
        await expect(db.query('INSERT INTO project_pricing_configs(shop_id,version,status,config,created_by) VALUES($1,1,$2,$3,$4)', [shop, 'active', JSON.stringify(config), actor])).rejects.toMatchObject({ code: '42501' });
        await db.query('SELECT save_project_pricing($1,$2,0,$3,$4::jsonb)', [shop, actor, 'active', JSON.stringify(config)]);
        expect((await db.query('SELECT * FROM project_pricing_configs')).rows).toHaveLength(1);
    } finally { await db.close(); }
}, 20_000);

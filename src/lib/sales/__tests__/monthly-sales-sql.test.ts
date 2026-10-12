// @vitest-environment node
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const shop = '20000000-0000-4000-8000-000000000001';
const otherShop = '20000000-0000-4000-8000-000000000002';
const actor = '10000000-0000-4000-8000-000000000001';
let db: PGlite;
const migration = readFileSync('supabase/migrations/20261008122000_team_monthly_sales.sql', 'utf8');
const blocksMigration = readFileSync('supabase/migrations/20261008130000_team_sales_blocks.sql', 'utf8');
const save = (months: unknown[], user = actor, shopId = shop, year = 2026) => db.query(
    'SELECT save_team_monthly_sales($1,$2,$3::jsonb,$4) AS saved', [shopId, year, JSON.stringify(months), user],
);

beforeEach(async () => {
    db = new PGlite();
    await db.exec(`
        CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
        CREATE TABLE shops (id uuid PRIMARY KEY, user_id uuid);
        CREATE TABLE user_roles (user_id uuid, role text);
        CREATE TABLE shop_members (shop_id uuid, user_id uuid);
        CREATE TABLE admin_audit_log (actor_id uuid, action text, target_id text, meta jsonb);
        CREATE TABLE team_sales_targets (
            id uuid PRIMARY KEY DEFAULT gen_random_uuid(), shop_id uuid REFERENCES shops(id), year integer NOT NULL,
            month integer NOT NULL CHECK (month BETWEEN 1 AND 12), target_amount numeric(18,2) NOT NULL DEFAULT 0,
            created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now(), UNIQUE (shop_id,year,month)
        );
        GRANT USAGE ON SCHEMA public TO service_role, authenticated;
        GRANT SELECT ON shops,user_roles,shop_members TO service_role;
        GRANT INSERT ON admin_audit_log TO service_role;
        GRANT SELECT,INSERT,UPDATE,DELETE ON team_sales_targets TO authenticated;
    `);
    await db.query('INSERT INTO shops VALUES ($1,$2),($3,NULL)', [shop, actor, otherShop]);
    await db.query("INSERT INTO user_roles VALUES ($1,'super_admin')", [actor]);
    await db.query('INSERT INTO team_sales_targets(shop_id,year,month,target_amount) VALUES ($1,2026,1,500)', [shop]);
    await db.exec(migration);
    await db.exec(migration); // Idempotent and no rewrite of existing monetary values.
    await db.exec(blocksMigration);
    await db.exec(blocksMigration);
});
afterEach(async () => { await db.close(); });

describe('audited monthly monetary RPC', () => {
    it('preserves legacy contract plan and patches only the supplied metric with an audit', async () => {
        await db.exec('SET ROLE service_role');
        await save([{ month: 1, expectedRevision: 0, cashflow_target_amount: 100 }]);
        await db.exec('RESET ROLE');
        expect((await db.query('SELECT target_amount::int, cashflow_target_amount::int, manual_contract_actual_amount, revision, updated_by FROM team_sales_targets')).rows)
            .toEqual([{ target_amount: 500, cashflow_target_amount: 100, manual_contract_actual_amount: null, revision: 1, updated_by: actor }]);
        const audit = (await db.query<{ actor_id: string; meta: { before: { target_amount: number }; after: { revision: number } } }>('SELECT actor_id,meta FROM admin_audit_log')).rows[0];
        expect(audit.actor_id).toBe(actor);
        expect(audit.meta.before.target_amount).toBe(500);
        expect(audit.meta.after.revision).toBe(1);
        await save([{ month: 1, expectedRevision: 1, cashflow_target_amount: null, manual_cashflow_actual_amount: 0 }]);
        expect((await db.query('SELECT cashflow_target_amount, manual_cashflow_actual_amount::int FROM team_sales_targets')).rows[0])
            .toEqual({ cashflow_target_amount: null, manual_cashflow_actual_amount: 0 });
    });

    it('creates an absent month without inventing other zero figures and rejects a stale insert', async () => {
        await save([{ month: 2, expectedRevision: 0, manual_cashflow_actual_amount: 50 }]);
        const rows = (await db.query('SELECT target_amount, cashflow_target_amount, manual_contract_actual_amount, manual_cashflow_actual_amount::int FROM team_sales_targets WHERE month=2')).rows;
        expect(rows).toEqual([{ target_amount: null, cashflow_target_amount: null, manual_contract_actual_amount: null, manual_cashflow_actual_amount: 50 }]);
        await expect(save([{ month: 2, expectedRevision: 0, target_amount: 999 }])).rejects.toMatchObject({ code: '40001' });
        expect((await db.query<{ count: number }>('SELECT count(*)::int AS count FROM admin_audit_log')).rows[0].count).toBe(1);
    });

    it('rolls back every month if one revision conflicts', async () => {
        await save([{ month: 2, expectedRevision: 0, cashflow_target_amount: 10 }]);
        await expect(save([{ month: 1, expectedRevision: 0, target_amount: 900 },
            { month: 2, expectedRevision: 0, cashflow_target_amount: 99 }])).rejects.toMatchObject({ code: '40001' });
        expect((await db.query('SELECT target_amount::int, revision FROM team_sales_targets WHERE month=1')).rows[0]).toEqual({ target_amount: 500, revision: 0 });
        expect((await db.query<{ count: number }>('SELECT count(*)::int AS count FROM admin_audit_log')).rows[0].count).toBe(1);
    });

    it('rolls back money and revision if the mandatory audit fails', async () => {
        await db.exec(`CREATE FUNCTION reject_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'audit unavailable'; END $$;
            CREATE TRIGGER reject_audit BEFORE INSERT ON admin_audit_log FOR EACH ROW EXECUTE FUNCTION reject_audit();`);
        await expect(save([{ month: 1, expectedRevision: 0, target_amount: 900 }])).rejects.toThrow('audit unavailable');
        expect((await db.query('SELECT target_amount::int,revision FROM team_sales_targets')).rows[0]).toEqual({ target_amount: 500, revision: 0 });
    });

    it('denies browser execution/writes, non-super-admin actors and inaccessible projects', async () => {
        await db.exec('SET ROLE authenticated');
        await expect(db.query('SELECT * FROM team_sales_targets')).rejects.toMatchObject({ code: '42501' });
        await expect(save([{ month: 1, expectedRevision: 0, target_amount: 2 }])).rejects.toMatchObject({ code: '42501' });
        await expect(db.query('UPDATE team_sales_targets SET target_amount=2')).rejects.toMatchObject({ code: '42501' });
        await db.exec('RESET ROLE');
        await expect(save([{ month: 1, expectedRevision: 0, target_amount: 2 }], actor, otherShop)).rejects.toMatchObject({ code: '42501' });
        await db.query("UPDATE user_roles SET role='admin'");
        await expect(save([{ month: 1, expectedRevision: 0, target_amount: 2 }])).rejects.toMatchObject({ code: '42501' });
    });

    it('rejects unknown fields, missing revision, duplicates, negatives and extra precision in SQL too', async () => {
        for (const patches of [
            [{ month: 1, target_amount: 2 }], [{ month: 1, expectedRevision: 0, paid_amount: 2 }],
            [{ month: 1, expectedRevision: 0, target_amount: -2 }], [{ month: 1, expectedRevision: 0, target_amount: 1.001 }],
            [{ month: 1, expectedRevision: 0, target_amount: 2 }, { month: 1, expectedRevision: 0, cashflow_target_amount: 3 }],
        ]) await expect(save(patches)).rejects.toMatchObject({ code: '22023' });
        await expect(save([{ month: 1, expectedRevision: 0, target_amount: 1 }], actor, shop, 2101)).rejects.toMatchObject({ code: '22023' });
        expect((await db.query<{ target_amount: number }>('SELECT target_amount::int FROM team_sales_targets')).rows[0].target_amount).toBe(500);
    });

    it('persists block cells, derives exact totals and preserves unrelated legacy metrics', async () => {
        await db.exec('SET ROLE service_role');
        await save([{ month: 1, expectedRevision: 0, block_amounts: {
            b1: { cashflow_target_amount: 0.1, manual_contract_actual_amount: 0 },
            b2: { cashflow_target_amount: 0.2 }, parking: { manual_cashflow_actual_amount: 25 },
        } }]);
        await save([{ month: 1, expectedRevision: 1, block_amounts: { b1: { cashflow_target_amount: 1.1 } } }]);
        await db.exec('RESET ROLE');
        const row = (await db.query<{ block_amounts: unknown }>('SELECT target_amount::int, cashflow_target_amount::text, manual_contract_actual_amount::int, manual_cashflow_actual_amount::int, revision, block_amounts FROM team_sales_targets')).rows[0];
        expect(row).toEqual({ target_amount: 500, cashflow_target_amount: '1.30', manual_contract_actual_amount: 0,
            manual_cashflow_actual_amount: 25, revision: 2, block_amounts: {
                b1: { cashflow_target_amount: 1.1, manual_contract_actual_amount: 0 },
                b2: { cashflow_target_amount: 0.2 }, parking: { manual_cashflow_actual_amount: 25 },
            } });
        await save([{ month: 1, expectedRevision: 2, block_amounts: {
            b1: { cashflow_target_amount: null }, b2: { cashflow_target_amount: null },
        } }]);
        expect((await db.query('SELECT cashflow_target_amount, manual_contract_actual_amount::int FROM team_sales_targets')).rows[0])
            .toEqual({ cashflow_target_amount: null, manual_contract_actual_amount: 0 });
        const audit = (await db.query<{ meta: { after: { block_amounts: unknown } } }>("SELECT meta FROM admin_audit_log WHERE meta->'after'->>'revision'='2'")).rows[0];
        expect(audit.meta.after.block_amounts).toEqual(row.block_amounts);
    });

    it('rejects stale block edits and aggregate writers cannot overwrite a breakdown', async () => {
        await save([{ month: 1, expectedRevision: 0, block_amounts: { b1: { target_amount: 40 } } }]);
        await expect(save([{ month: 1, expectedRevision: 0, block_amounts: { b2: { target_amount: 50 } } }]))
            .rejects.toMatchObject({ code: '40001' });
        await expect(save([{ month: 1, expectedRevision: 1, target_amount: 800 }])).rejects.toMatchObject({ code: '22023' });
        expect((await db.query('SELECT target_amount::int, revision, block_amounts FROM team_sales_targets')).rows[0])
            .toEqual({ target_amount: 40, revision: 1, block_amounts: { b1: { target_amount: 40 } } });
    });

    it('validates nested block money and rolls back all months when a total exceeds its limit', async () => {
        for (const block_amounts of [null, [], {}, { b3: { target_amount: 1 } }, { b1: {} }, { b1: null },
            { b1: { paid_amount: 1 } }, { b1: { target_amount: '1' } }, { b1: { target_amount: -1 } },
            { b1: { target_amount: 1.001 } }, { b1: { target_amount: 1e13 + 1 } }]) {
            await expect(save([{ month: 1, expectedRevision: 0, block_amounts }])).rejects.toMatchObject({ code: '22023' });
        }
        await expect(save([{ month: 1, expectedRevision: 0, target_amount: 1, block_amounts: { b1: { target_amount: 2 } } }]))
            .rejects.toMatchObject({ code: '22023' });
        await expect(save([{ month: 1, expectedRevision: 0, block_amounts: { b1: { target_amount: 20 } } },
            { month: 2, expectedRevision: 0, block_amounts: { b1: { target_amount: 1e13 }, b2: { target_amount: 1 } } }]))
            .rejects.toMatchObject({ code: '22023' });
        expect((await db.query('SELECT target_amount::int, revision, block_amounts FROM team_sales_targets')).rows)
            .toEqual([{ target_amount: 500, revision: 0, block_amounts: {} }]);
        expect((await db.query('SELECT count(*)::int AS count FROM admin_audit_log')).rows).toEqual([{ count: 0 }]);
    });
});

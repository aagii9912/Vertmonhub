// @vitest-environment node
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const shop = '20000000-0000-4000-8000-000000000001';
const otherShop = '20000000-0000-4000-8000-000000000002';
const actor = '10000000-0000-4000-8000-000000000001';
const project = '30000000-0000-4000-8000-000000000001';
const otherProject = '30000000-0000-4000-8000-000000000002';
let db: PGlite;
const read = (name: string) => readFileSync(`supabase/migrations/${name}`, 'utf8');
const monthlyMigration = read('20261008122000_team_monthly_sales.sql');
const blocksMigration = read('20261008130000_team_sales_blocks.sql');
const countsMigration = read('20261022120000_team_sales_contract_counts.sql');
const dropOldCountsMigration = read('20261022160000_drop_old_contract_count_columns.sql');
const extrasMigration = read('20261023150000_sales_targets_stretch_activity.sql');
const save = (months: unknown[], user = actor, shopId = shop) => db.query<{ saved: { months: Array<Record<string, unknown>> } }>(
    'SELECT save_team_monthly_sales($1,2026,$2::jsonb,$3) AS saved', [shopId, JSON.stringify(months), user],
);
const rename = (oldName: string, newName: string, user = actor, shopId = shop) => db.query<{ result: { counts: Record<string, number> } }>(
    'SELECT rename_sales_manager($1,$2,$3,$4) AS result', [shopId, oldName, newName, user],
);
const row = async () => (await db.query<Record<string, unknown>>(`SELECT target_amount::int, stretch_target_amount::text, stretch_cashflow_target_amount::text,
    activity_targets, revision FROM team_sales_targets WHERE shop_id = $1 AND month = 1`, [shop])).rows[0];

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
        -- rename_sales_manager-ийн хүснэгтүүд (production-ий хэлбэрийн хэрэгтэй хэсэг).
        CREATE TABLE projects (id uuid PRIMARY KEY, shop_id uuid NOT NULL, UNIQUE (shop_id, id));
        CREATE TABLE sales_managers (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), shop_id uuid NOT NULL REFERENCES shops(id),
            name text NOT NULL, user_id uuid, is_active boolean NOT NULL DEFAULT true, UNIQUE (shop_id, name));
        CREATE TABLE sales_manager_projects (shop_id uuid NOT NULL, manager_name text NOT NULL, project_id uuid NOT NULL,
            PRIMARY KEY (shop_id, manager_name, project_id),
            FOREIGN KEY (shop_id, manager_name) REFERENCES sales_managers (shop_id, name) ON UPDATE CASCADE ON DELETE CASCADE);
        CREATE TABLE sales_kpi_months (shop_id uuid NOT NULL, year integer NOT NULL, month integer NOT NULL, manager_name text NOT NULL,
            PRIMARY KEY (shop_id, year, month, manager_name),
            FOREIGN KEY (shop_id, manager_name) REFERENCES sales_managers (shop_id, name) ON UPDATE CASCADE ON DELETE CASCADE);
        CREATE TABLE leads (id serial PRIMARY KEY, shop_id uuid, sales_manager_name text, sales_handoff_at timestamptz, deleted_at timestamptz);
        CREATE TABLE property_viewings (id serial PRIMARY KEY, shop_id uuid, sales_manager_name text);
        CREATE TABLE property_contracts (id serial PRIMARY KEY, shop_id uuid, sales_manager text);
        CREATE TABLE customers (id serial PRIMARY KEY, shop_id uuid, sales_manager_name text);
        CREATE TABLE service_logs (id serial PRIMARY KEY, shop_id uuid, manager_name text, assigned_to text);
        CREATE TABLE daily_report_counts (shop_id uuid NOT NULL, report_date date NOT NULL, manager_name text NOT NULL, metric text NOT NULL,
            value integer, updated_by_name text, PRIMARY KEY (shop_id, report_date, manager_name, metric));
        CREATE TABLE daily_report_settings (shop_id uuid PRIMARY KEY, config jsonb NOT NULL DEFAULT '{}'::jsonb);
        CREATE TABLE daily_report_changes (id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, shop_id uuid, manager_name text, changed_by_name text);
        CREATE TABLE property_units (id serial PRIMARY KEY, shop_id uuid, sales_manager text);
        CREATE TABLE lead_activities (id serial PRIMARY KEY, shop_id uuid, created_by_name text);
        GRANT USAGE ON SCHEMA public TO service_role, authenticated;
        GRANT SELECT, UPDATE ON shops TO service_role;
        GRANT SELECT ON user_roles, shop_members TO service_role;
        GRANT INSERT ON admin_audit_log TO service_role;
        GRANT SELECT, INSERT, UPDATE, DELETE ON team_sales_targets TO authenticated;
        GRANT SELECT, INSERT, UPDATE, DELETE ON projects, sales_managers, sales_manager_projects, sales_kpi_months, leads, property_viewings,
            property_contracts, customers, service_logs, daily_report_counts, daily_report_settings, property_units, lead_activities TO service_role;
        GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO service_role;
        -- Append-only түүх: production-д service_role ч засах эрхгүй.
        GRANT SELECT, INSERT ON daily_report_changes TO service_role;
    `);
    await db.query('INSERT INTO shops VALUES ($1,$2),($3,$2)', [shop, actor, otherShop]);
    await db.query("INSERT INTO user_roles VALUES ($1,'super_admin')", [actor]);
    await db.query('INSERT INTO team_sales_targets(shop_id,year,month,target_amount) VALUES ($1,2026,1,500)', [shop]);
    for (const migration of [monthlyMigration, blocksMigration, countsMigration, extrasMigration]) {
        await db.exec(migration);
        await db.exec(migration); // Дахин ажиллуулж болно.
    }
    await db.exec(`CREATE TRIGGER leads_stamp_sales_handoff BEFORE INSERT OR UPDATE ON leads
        FOR EACH ROW EXECUTE FUNCTION stamp_sales_handoff();`);
});
afterEach(async () => { await db.close(); });

describe('stretch and activity plans in save_team_monthly_sales', () => {
    it('stores month-level stretch and activity plans with the revision and audit, and keeps the old patches working', async () => {
        await db.exec('SET ROLE service_role');
        await save([{ month: 1, expectedRevision: 0, stretch_target_amount: 7152996000, stretch_cashflow_target_amount: 2145898800.5,
            activity_targets: { hotline: 380, manager_line: 300, meetings_new: 70, meetings_repeat: 15, chats: 60 } }]);
        await db.exec('RESET ROLE');
        expect(await row()).toEqual({ target_amount: 500, stretch_target_amount: '7152996000.00', stretch_cashflow_target_amount: '2145898800.50',
            activity_targets: { hotline: 380, manager_line: 300, meetings_new: 70, meetings_repeat: 15, chats: 60 }, revision: 1 });
        const audit = (await db.query<{ meta: { before: Record<string, unknown>; after: Record<string, unknown>; patch: Record<string, unknown> } }>(
            'SELECT meta FROM admin_audit_log')).rows[0].meta;
        expect(audit.before.stretch_target_amount).toBeNull();
        expect(audit.after.stretch_target_amount).toBe(7152996000);
        expect(audit.patch.activity_targets).toEqual({ hotline: 380, manager_line: 300, meetings_new: 70, meetings_repeat: 15, chats: 60 });

        // Хуучин замууд (зөвхөн нийт дүн, блокийн нүд) нэмэлт талбарыг хөндөхгүй.
        await save([{ month: 1, expectedRevision: 1, cashflow_target_amount: 100 }]);
        await save([{ month: 1, expectedRevision: 2, block_amounts: { b1: { contract_count_target: 4 } } }]);
        expect(await row()).toMatchObject({ stretch_target_amount: '7152996000.00', activity_targets: { hotline: 380, chats: 60 }, revision: 3 });
        expect((await db.query('SELECT cashflow_target_amount::int, contract_count_target, block_amounts FROM team_sales_targets WHERE month = 1')).rows[0])
            .toEqual({ cashflow_target_amount: 100, contract_count_target: 4, block_amounts: { b1: { contract_count_target: 4 } } });
    });

    it('merges activity keys: a null key removes it, all removed or a null object is unknown (NULL)', async () => {
        await save([{ month: 1, expectedRevision: 0, activity_targets: { hotline: 380, chats: 60 } }]);
        await save([{ month: 1, expectedRevision: 1, activity_targets: { hotline: null, meetings_new: 0 } }]);
        expect((await row()).activity_targets).toEqual({ chats: 60, meetings_new: 0 });
        await save([{ month: 1, expectedRevision: 2, activity_targets: { chats: null, meetings_new: null } }]);
        expect((await row()).activity_targets).toBeNull();
        await save([{ month: 1, expectedRevision: 3, activity_targets: { manager_line: 100 }, stretch_target_amount: 5 }]);
        await save([{ month: 1, expectedRevision: 4, activity_targets: null, stretch_target_amount: null }]);
        expect(await row()).toMatchObject({ activity_targets: null, stretch_target_amount: null, revision: 5 });
        // Шинэ сар: зөвхөн нэмэлт талбартай мөр үүснэ, бусад дүнг зохиохгүй.
        await save([{ month: 2, expectedRevision: 0, stretch_cashflow_target_amount: 0 }]);
        expect((await db.query('SELECT target_amount, stretch_cashflow_target_amount::int, activity_targets FROM team_sales_targets WHERE month = 2')).rows[0])
            .toEqual({ target_amount: null, stretch_cashflow_target_amount: 0, activity_targets: null });
    });

    it('rejects unknown activity keys, negative, fractional, text and oversized values, stretch inside a block, and stale revisions', async () => {
        for (const patch of [
            { activity_targets: { calls: 1 } }, { activity_targets: {} }, { activity_targets: [1] }, { activity_targets: 'x' },
            { activity_targets: { hotline: -1 } }, { activity_targets: { hotline: 1.5 } }, { activity_targets: { hotline: '3' } },
            { activity_targets: { chats: 1_000_001 } }, { activity_targets: { chats: true } },
            { stretch_target_amount: -1 }, { stretch_target_amount: 1.001 }, { stretch_cashflow_target_amount: '10' },
            { stretch_target_amount: 1e13 + 1 }, { block_amounts: { b1: { stretch_target_amount: 1 } } },
            { block_amounts: { b2: { activity_targets: { hotline: 1 } } } },
        ]) await expect(save([{ month: 1, expectedRevision: 0, ...patch }])).rejects.toMatchObject({ code: '22023' });
        await expect(save([{ month: 1, expectedRevision: 3, stretch_target_amount: 1 }])).rejects.toMatchObject({ code: '40001' });
        expect(await row()).toEqual({ target_amount: 500, stretch_target_amount: null, stretch_cashflow_target_amount: null, activity_targets: null, revision: 0 });
        expect((await db.query('SELECT count(*)::int AS count FROM admin_audit_log')).rows).toEqual([{ count: 0 }]);
    });

    it('enforces the column constraints for direct writes too and stays server-only', async () => {
        await expect(db.query(`UPDATE team_sales_targets SET activity_targets = '{"hotline": -2}'`)).rejects.toThrow(/team_sales_activity_targets/);
        await expect(db.query(`UPDATE team_sales_targets SET activity_targets = '{"other": 2}'`)).rejects.toThrow(/team_sales_activity_targets/);
        await expect(db.query(`UPDATE team_sales_targets SET activity_targets = '[]'`)).rejects.toThrow(/team_sales_activity_targets/);
        await expect(db.query('UPDATE team_sales_targets SET stretch_cashflow_target_amount = -1')).rejects.toThrow(/team_sales_stretch_amounts/);
        await db.query(`UPDATE team_sales_targets SET activity_targets = '{"hotline": 0, "chats": 1000000}'`);
        await db.exec('SET ROLE authenticated');
        await expect(save([{ month: 1, expectedRevision: 0, stretch_target_amount: 2 }])).rejects.toMatchObject({ code: '42501' });
        await expect(rename('A', 'B')).rejects.toMatchObject({ code: '42501' });
        await db.exec('RESET ROLE');
        const grants = (await db.query<{ routine_name: string; grantee: string }>(`SELECT routine_name, grantee FROM information_schema.routine_privileges
            WHERE routine_name IN ('save_team_monthly_sales', 'rename_sales_manager') AND grantee IN ('PUBLIC', 'anon', 'authenticated', 'service_role')
            ORDER BY routine_name, grantee`)).rows;
        expect(grants).toEqual([{ routine_name: 'rename_sales_manager', grantee: 'service_role' }, { routine_name: 'save_team_monthly_sales', grantee: 'service_role' }]);
    });

    it('the later drop of the old count pair still recognises this RPC as the current one', async () => {
        await db.exec(dropOldCountsMigration);
        await save([{ month: 1, expectedRevision: 0, stretch_target_amount: 9 }]);
        expect((await row()).stretch_target_amount).toBe('9.00');
    });
});

describe('rename_sales_manager', () => {
    async function seed() {
        // Хуучин (хариуцуулалтын тамгагүй) лидүүдийг дуурайна; эхний лид өмнө нь тамгатай.
        await db.exec('ALTER TABLE leads DISABLE TRIGGER leads_stamp_sales_handoff');
        await db.query('INSERT INTO projects VALUES ($1,$2),($3,$4)', [project, shop, otherProject, otherShop]);
        for (const shopId of [shop, otherShop]) {
            const projectId = shopId === shop ? project : otherProject;
            await db.query("INSERT INTO sales_managers(shop_id,name,user_id) VALUES ($1,'Khongoroo',$2),($1,'Ариунбилэг',NULL)", [shopId, actor]);
            await db.query("INSERT INTO sales_manager_projects VALUES ($1,'Khongoroo',$2),($1,'Ариунбилэг',$2)", [shopId, projectId]);
            await db.query("INSERT INTO sales_kpi_months VALUES ($1,2026,10,'Khongoroo'),($1,2026,9,'Khongoroo')", [shopId]);
            await db.query("INSERT INTO leads(shop_id,sales_manager_name) VALUES ($1,'Khongoroo'),($1,'Khongoroo'),($1,'Ариунбилэг'),($1,NULL)", [shopId]);
            await db.query("INSERT INTO property_viewings(shop_id,sales_manager_name) VALUES ($1,'Khongoroo'),($1,'Ариунбилэг')", [shopId]);
            await db.query("INSERT INTO property_contracts(shop_id,sales_manager) VALUES ($1,'Khongoroo'),($1,'Хонгорзул.Мөнхгэрэл'),($1,NULL)", [shopId]);
            await db.query("INSERT INTO customers(shop_id,sales_manager_name) VALUES ($1,'Khongoroo')", [shopId]);
            await db.query("INSERT INTO service_logs(shop_id,manager_name,assigned_to) VALUES ($1,'Khongoroo','Khongoroo')", [shopId]);
            await db.query(`INSERT INTO daily_report_counts VALUES ($1,'2026-10-20','Khongoroo','call.l1.new',3,'Khongoroo'),
                ($1,'2026-10-21','Khongoroo','chat.c1',2,'Ариунбилэг'),($1,'2026-10-21','Ариунбилэг','chat.c1',1,'Ариунбилэг')`, [shopId]);
            await db.query(`INSERT INTO daily_report_settings VALUES ($1, $2::jsonb)`, [shopId, JSON.stringify({ title: null, lines: [], chats: [], managers: [
                { name: 'Ариунбилэг', short: 'Ари' }, { name: 'Хонгорзул.Мөнхгэрэл', short: 'Хуу' }, { name: 'Khongoroo', short: 'Хон' },
            ] })]);
            await db.query("INSERT INTO daily_report_changes(shop_id,manager_name,changed_by_name) VALUES ($1,'Khongoroo','Khongoroo')", [shopId]);
            await db.query("INSERT INTO property_units(shop_id,sales_manager) VALUES ($1,'Khongoroo'),($1,'Чанцалдулам.Раднаа')", [shopId]);
            await db.query("INSERT INTO lead_activities(shop_id,created_by_name) VALUES ($1,'Khongoroo')", [shopId]);
        }
        await db.query("UPDATE leads SET sales_handoff_at = '2026-10-01T00:00:00Z' WHERE id = (SELECT min(id) FROM leads WHERE shop_id = $1)", [shop]);
        await db.exec('ALTER TABLE leads ENABLE TRIGGER leads_stamp_sales_handoff');
    }
    const names = async (sql: string, shopId = shop) => (await db.query<{ name: string | null }>(sql, [shopId])).rows.map(item => item.name);

    it('moves every key column of this shop in one go, keeps display stamps and history, and audits the counts', async () => {
        await seed();
        await db.exec('SET ROLE service_role');
        const { result } = (await rename('Khongoroo', 'Хонгорзул.Мөнхгэрэл')).rows[0];
        await db.exec('RESET ROLE');
        const counts = { sales_manager_projects: 1, sales_kpi_months: 2, leads: 2, property_viewings: 1, property_contracts: 1, customers: 1,
            service_logs: 1, daily_report_counts: 2, daily_report_settings: 1, property_units: 1 };
        expect(result).toEqual({ old_name: 'Khongoroo', new_name: 'Хонгорзул.Мөнхгэрэл', counts });

        expect(await names('SELECT name FROM sales_managers WHERE shop_id = $1 ORDER BY name')).toEqual(['Ариунбилэг', 'Хонгорзул.Мөнхгэрэл']);
        expect((await db.query('SELECT user_id FROM sales_managers WHERE shop_id = $1 AND name = $2', [shop, 'Хонгорзул.Мөнхгэрэл'])).rows).toEqual([{ user_id: actor }]);
        expect(await names('SELECT manager_name AS name FROM sales_manager_projects WHERE shop_id = $1 ORDER BY 1')).toEqual(['Ариунбилэг', 'Хонгорзул.Мөнхгэрэл']);
        expect(await names('SELECT DISTINCT manager_name AS name FROM sales_kpi_months WHERE shop_id = $1')).toEqual(['Хонгорзул.Мөнхгэрэл']);
        expect(await names('SELECT sales_manager_name AS name FROM leads WHERE shop_id = $1 ORDER BY id')).toEqual(['Хонгорзул.Мөнхгэрэл', 'Хонгорзул.Мөнхгэрэл', 'Ариунбилэг', null]);
        expect(await names('SELECT sales_manager AS name FROM property_contracts WHERE shop_id = $1 ORDER BY id')).toEqual(['Хонгорзул.Мөнхгэрэл', 'Хонгорзул.Мөнхгэрэл', null]);
        expect(await names('SELECT sales_manager_name AS name FROM property_viewings WHERE shop_id = $1 ORDER BY id')).toEqual(['Хонгорзул.Мөнхгэрэл', 'Ариунбилэг']);
        expect(await names('SELECT sales_manager_name AS name FROM customers WHERE shop_id = $1')).toEqual(['Хонгорзул.Мөнхгэрэл']);
        expect((await db.query('SELECT manager_name, assigned_to FROM service_logs WHERE shop_id = $1', [shop])).rows)
            .toEqual([{ manager_name: 'Хонгорзул.Мөнхгэрэл', assigned_to: 'Khongoroo' }]);
        expect((await db.query('SELECT manager_name, updated_by_name FROM daily_report_counts WHERE shop_id = $1 ORDER BY report_date, manager_name', [shop])).rows).toEqual([
            { manager_name: 'Хонгорзул.Мөнхгэрэл', updated_by_name: 'Khongoroo' },
            { manager_name: 'Ариунбилэг', updated_by_name: 'Ариунбилэг' },
            { manager_name: 'Хонгорзул.Мөнхгэрэл', updated_by_name: 'Ариунбилэг' },
        ]);
        // Баганын дараалал, товчлол хадгалагдана; бүртгэлгүй хуучирсан шинэ нэрийн мөр давхардахгүй.
        expect((await db.query<{ config: { managers: unknown } }>('SELECT config FROM daily_report_settings WHERE shop_id = $1', [shop])).rows[0].config.managers)
            .toEqual([{ name: 'Ариунбилэг', short: 'Ари' }, { name: 'Хонгорзул.Мөнхгэрэл', short: 'Хон' }]);
        expect(await names('SELECT sales_manager AS name FROM property_units WHERE shop_id = $1 ORDER BY id')).toEqual(['Хонгорзул.Мөнхгэрэл', 'Чанцалдулам.Раднаа']);
        // Түүх, тамга хэвээр.
        expect(await names('SELECT manager_name AS name FROM daily_report_changes WHERE shop_id = $1')).toEqual(['Khongoroo']);
        expect(await names('SELECT created_by_name AS name FROM lead_activities WHERE shop_id = $1')).toEqual(['Khongoroo']);
        // Нэр солих нь шинэ хариуцуулалт биш: тамгагүй лид тамгагүй, тамгатай нь хэвээр.
        expect((await db.query<{ stamped: boolean }>('SELECT sales_handoff_at IS NOT NULL AS stamped FROM leads WHERE shop_id = $1 ORDER BY id', [shop])).rows.map(item => item.stamped))
            .toEqual([true, false, false, false]);

        // Өөр төсөл огт өөрчлөгдөөгүй.
        expect(await names('SELECT name FROM sales_managers WHERE shop_id = $1 ORDER BY name', otherShop)).toEqual(['Khongoroo', 'Ариунбилэг']);
        expect(await names("SELECT sales_manager_name AS name FROM leads WHERE shop_id = $1 AND sales_manager_name = 'Khongoroo'", otherShop)).toHaveLength(2);
        expect(await names("SELECT manager_name AS name FROM daily_report_counts WHERE shop_id = $1 AND manager_name = 'Khongoroo'", otherShop)).toHaveLength(2);
        expect(await names("SELECT manager_name AS name FROM sales_kpi_months WHERE shop_id = $1 AND manager_name = 'Khongoroo'", otherShop)).toHaveLength(2);
        expect((await db.query<{ config: { managers: Array<{ name: string }> } }>('SELECT config FROM daily_report_settings WHERE shop_id = $1', [otherShop])).rows[0]
            .config.managers.map(item => item.name)).toEqual(['Ариунбилэг', 'Хонгорзул.Мөнхгэрэл', 'Khongoroo']);

        const audit = (await db.query<{ action: string; actor_id: string; meta: Record<string, unknown> }>('SELECT action, actor_id, meta FROM admin_audit_log')).rows;
        expect(audit).toEqual([{ action: 'sales.manager.rename', actor_id: actor, meta: { shop_id: shop, old_name: 'Khongoroo', new_name: 'Хонгорзул.Мөнхгэрэл', counts } }]);
    });

    it('does not leak the rename flag: a later assignment in the same transaction still stamps the handoff', async () => {
        await seed();
        await db.exec('BEGIN');
        await rename('Ариунбилэг', 'Ариунбилэг.Нямхүү');
        await db.query("UPDATE leads SET sales_manager_name = 'Ариунбилэг.Нямхүү' WHERE shop_id = $1 AND sales_manager_name IS NULL", [shop]);
        await db.exec('COMMIT');
        expect((await db.query<{ stamped: boolean }>("SELECT sales_handoff_at IS NOT NULL AS stamped FROM leads WHERE shop_id = $1 AND sales_manager_name = 'Ариунбилэг.Нямхүү' ORDER BY id", [shop]))
            .rows.map(item => item.stamped)).toEqual([false, true]);
        await db.query("INSERT INTO leads(shop_id,sales_manager_name) VALUES ($1,'Ариунбилэг.Нямхүү')", [shop]);
        expect((await db.query('SELECT sales_handoff_at IS NOT NULL AS stamped FROM leads ORDER BY id DESC LIMIT 1')).rows).toEqual([{ stamped: true }]);
    });

    it('renames an inactive roster entry and the legacy per-manager targets table when it exists', async () => {
        await seed();
        await db.exec(`CREATE TABLE sales_targets (id serial PRIMARY KEY, shop_id uuid NOT NULL, sales_manager text NOT NULL, year int, month int,
            UNIQUE (shop_id, sales_manager, year, month)); GRANT SELECT, UPDATE ON sales_targets TO service_role;`);
        await db.query("INSERT INTO sales_targets(shop_id,sales_manager,year,month) VALUES ($1,'Ариунбилэг',2026,10)", [shop]);
        await db.query("UPDATE sales_managers SET is_active = false WHERE name = 'Ариунбилэг'");
        const { result } = (await rename('Ариунбилэг', 'Ариунбилэг.Нямхүү')).rows[0];
        expect(result.counts).toMatchObject({ leads: 1, sales_targets: 1, sales_manager_projects: 1, daily_report_counts: 1 });
        expect((await db.query('SELECT is_active FROM sales_managers WHERE shop_id = $1 AND name = $2', [shop, 'Ариунбилэг.Нямхүү'])).rows).toEqual([{ is_active: false }]);
    });

    it('refuses invalid names, unknown or duplicate roster names, other projects and non-super-admins without writing', async () => {
        await seed();
        await expect(rename('Байхгүй', 'Шинэ')).rejects.toMatchObject({ code: 'P0002' });
        await expect(rename('Khongoroo', 'Ариунбилэг')).rejects.toMatchObject({ code: '23505' });
        for (const name of ['', ' Хонгорзул', 'Хонгорзул ', 'Khongoroo', 'х'.repeat(121)]) {
            await expect(rename('Khongoroo', name)).rejects.toMatchObject({ code: '22023' });
        }
        await expect(rename('Khongoroo', 'Шинэ', actor, '20000000-0000-4000-8000-000000000009')).rejects.toMatchObject({ code: '42501' });
        await db.query("UPDATE user_roles SET role = 'admin'");
        await expect(rename('Khongoroo', 'Шинэ')).rejects.toMatchObject({ code: '42501' });
        expect(await names('SELECT name FROM sales_managers WHERE shop_id = $1 ORDER BY name')).toEqual(['Khongoroo', 'Ариунбилэг']);
        expect((await db.query('SELECT count(*)::int AS count FROM admin_audit_log')).rows).toEqual([{ count: 0 }]);
    });

    it('rolls everything back when the new name already owns a clashing daily-report cell', async () => {
        await seed();
        await db.query("INSERT INTO daily_report_counts VALUES ($1,'2026-10-20','Хонгорзул.Мөнхгэрэл','call.l1.new',1,NULL)", [shop]);
        await expect(rename('Khongoroo', 'Хонгорзул.Мөнхгэрэл')).rejects.toMatchObject({ code: '23505' });
        expect(await names('SELECT name FROM sales_managers WHERE shop_id = $1 ORDER BY name')).toEqual(['Khongoroo', 'Ариунбилэг']);
        expect(await names("SELECT sales_manager_name AS name FROM leads WHERE shop_id = $1 AND sales_manager_name = 'Khongoroo'")).toHaveLength(2);
        expect(await names("SELECT manager_name AS name FROM sales_manager_projects WHERE shop_id = $1 AND manager_name = 'Khongoroo'")).toHaveLength(1);
        expect((await db.query('SELECT count(*)::int AS count FROM admin_audit_log')).rows).toEqual([{ count: 0 }]);
    });
});

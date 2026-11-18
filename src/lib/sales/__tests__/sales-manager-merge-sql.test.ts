// @vitest-environment node
import { readFileSync } from 'node:fs';
import { migrationVerifyQuery } from '@/test/migration-verify';
import { PGlite } from '@electric-sql/pglite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

/**
 * merge_sales_managers (20261118120000): ижил хүний хоёр бүртгэлийг (акаунтын латин нэр ↔ гэрээний кирилл «Нэр.Овог»)
 * нэг гүйлгээнд нэгтгэнэ. Production-ий жинхэнэ trigger-ууд (лидийн хуваарилалтын хамгаалалт, хариуцуулалтын ба байрны
 * тамга)-тай ажиллуулна.
 */
const shop = '20000000-0000-4000-8000-000000000001';
const otherShop = '20000000-0000-4000-8000-000000000002';
const actor = '10000000-0000-4000-8000-000000000001';
const nomin = '10000000-0000-4000-8000-000000000002';
const other = '10000000-0000-4000-8000-000000000003';
const project = '30000000-0000-4000-8000-000000000001';
const secondProject = '30000000-0000-4000-8000-000000000003';
const otherProject = '30000000-0000-4000-8000-000000000002';
let db: PGlite;
const read = (name: string) => readFileSync(`supabase/migrations/${name}`, 'utf8');
const slice = (source: string, from: string, through: string) => {
    const start = source.indexOf(from);
    const end = source.indexOf(through, start);
    if (start < 0 || end < 0) throw new Error(`migration section not found: ${from}`);
    return source.slice(start, end + through.length);
};
const leadAssignmentTrigger = slice(read('20261001131000_sales_lead_scope.sql'),
    'CREATE OR REPLACE FUNCTION private.enforce_sales_lead_assignment()', 'EXECUTE FUNCTION private.enforce_sales_lead_assignment();');
const propertyTimestamp = slice(read('20260128210000_add_real_estate_tables.sql'),
    'CREATE OR REPLACE FUNCTION update_property_timestamp()', '$$ LANGUAGE plpgsql;');
const unitTimestampTrigger = slice(read('20260624120000_add_property_units.sql'),
    'DROP TRIGGER IF EXISTS property_units_updated_at', 'EXECUTE FUNCTION update_property_timestamp();');
const mergeMigration = read('20261118120000_merge_sales_managers.sql');

type MergeResult = { source_name: string; target_name: string; counts: Record<string, number>; user_linked: boolean; is_active: boolean };
const merge = (source: string, target: string, user = actor, shopId = shop) => db.query<{ result: MergeResult }>(
    'SELECT merge_sales_managers($1,$2,$3,$4) AS result', [shopId, source, target, user],
);
const names = async (sql: string, shopId = shop) => (await db.query<{ name: string | null }>(sql, [shopId])).rows.map(item => item.name);
const auditCount = async () => (await db.query<{ count: number }>('SELECT count(*)::int AS count FROM admin_audit_log')).rows[0].count;

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
        CREATE TABLE projects (id uuid PRIMARY KEY, shop_id uuid NOT NULL, UNIQUE (shop_id, id));
        CREATE TABLE sales_managers (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), shop_id uuid NOT NULL REFERENCES shops(id),
            name text NOT NULL, user_id uuid, is_active boolean NOT NULL DEFAULT true, UNIQUE (shop_id, name));
        CREATE TABLE sales_manager_projects (shop_id uuid NOT NULL, manager_name text NOT NULL, project_id uuid NOT NULL,
            PRIMARY KEY (shop_id, manager_name, project_id),
            FOREIGN KEY (shop_id, manager_name) REFERENCES sales_managers (shop_id, name) ON UPDATE CASCADE ON DELETE CASCADE);
        CREATE TABLE sales_kpi_months (shop_id uuid NOT NULL, year integer NOT NULL, month integer NOT NULL, manager_name text NOT NULL,
            PRIMARY KEY (shop_id, year, month, manager_name),
            FOREIGN KEY (shop_id, manager_name) REFERENCES sales_managers (shop_id, name) ON UPDATE CASCADE ON DELETE CASCADE);
        CREATE TABLE sales_work_plan_items (id serial PRIMARY KEY, shop_id uuid NOT NULL, assignee_ids uuid[] NOT NULL DEFAULT '{}');
        CREATE TABLE leads (id serial PRIMARY KEY, shop_id uuid, project_id uuid, sales_manager_name text, sales_handoff_at timestamptz, deleted_at timestamptz);
        CREATE TABLE property_viewings (id serial PRIMARY KEY, shop_id uuid, sales_manager_name text);
        CREATE TABLE property_contracts (id serial PRIMARY KEY, shop_id uuid, sales_manager text);
        CREATE TABLE customers (id serial PRIMARY KEY, shop_id uuid, sales_manager_name text);
        CREATE TABLE service_logs (id serial PRIMARY KEY, shop_id uuid, manager_name text, assigned_to text);
        CREATE TABLE daily_report_counts (shop_id uuid NOT NULL, report_date date NOT NULL, manager_name text NOT NULL, metric text NOT NULL,
            value integer, updated_by_name text, PRIMARY KEY (shop_id, report_date, manager_name, metric));
        CREATE TABLE daily_report_settings (shop_id uuid PRIMARY KEY, config jsonb NOT NULL DEFAULT '{}'::jsonb);
        CREATE TABLE daily_report_changes (id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, shop_id uuid, manager_name text, changed_by_name text);
        CREATE TABLE property_units (id serial PRIMARY KEY, shop_id uuid, sales_manager text, status text, updated_at timestamptz DEFAULT now());
        CREATE TABLE lead_activities (id serial PRIMARY KEY, shop_id uuid, created_by_name text);
        GRANT USAGE ON SCHEMA public TO service_role, authenticated;
        GRANT SELECT, UPDATE ON shops TO service_role;
        GRANT SELECT ON user_roles, shop_members TO service_role;
        GRANT INSERT ON admin_audit_log TO service_role;
        GRANT SELECT, INSERT, UPDATE, DELETE ON projects, sales_managers, sales_manager_projects, sales_kpi_months, leads, property_viewings,
            property_contracts, customers, service_logs, daily_report_counts, daily_report_settings, property_units, lead_activities TO service_role;
        -- Production шиг: ажлын төлөвлөгөөг service_role ч устгахгүй.
        GRANT SELECT, INSERT, UPDATE ON sales_work_plan_items TO service_role;
        GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO service_role;
        GRANT SELECT, INSERT ON daily_report_changes TO service_role;
        CREATE SCHEMA IF NOT EXISTS private;
        GRANT USAGE ON SCHEMA private TO authenticated, service_role;
    `);
    await db.exec(leadAssignmentTrigger);
    await db.exec(propertyTimestamp);
    await db.exec(unitTimestampTrigger);
    // Нэр солих тэмдгийг хүндэтгэдэг trigger-уудын сүүлийн body (20261023150000).
    await db.exec(read('20261023150000_sales_targets_stretch_activity.sql'));
    await db.exec(`CREATE TRIGGER leads_stamp_sales_handoff BEFORE INSERT OR UPDATE ON leads FOR EACH ROW EXECUTE FUNCTION stamp_sales_handoff();`);
    await db.exec(mergeMigration);
    await db.exec(mergeMigration); // Дахин ажиллуулж болно.
    await db.query('INSERT INTO shops VALUES ($1,$2),($3,$2)', [shop, actor, otherShop]);
    await db.query("INSERT INTO user_roles VALUES ($1,'super_admin')", [actor]);
});
afterEach(async () => { await db.close(); });

/**
 * Mandala Garden-ий тохиолдол: «Номин.Одончимэг» (гэрээтэй, акаунтгүй, төслийн харьяалалгүй) ба «Nomin» (акаунттай,
 * идэвхтэй, 7-р сарын лид, уулзалт, өнөөдрийн өдрийн тайлан). «Ариунбилэг» — хамааралгүй өөр менежер.
 */
async function seed() {
    await db.exec('ALTER TABLE leads DISABLE TRIGGER USER');
    await db.query('INSERT INTO projects VALUES ($1,$2),($3,$2),($4,$5)', [project, shop, secondProject, otherProject, otherShop]);
    for (const shopId of [shop, otherShop]) {
        const projectId = shopId === shop ? project : otherProject;
        await db.query(`INSERT INTO sales_managers(shop_id,name,user_id,is_active) VALUES ($1,'Nomin',$2,true),
            ($1,'Номин.Одончимэг',NULL,false),($1,'Ариунбилэг',NULL,true)`, [shopId, nomin]);
        await db.query("INSERT INTO sales_manager_projects VALUES ($1,'Nomin',$2),($1,'Ариунбилэг',$2)", [shopId, projectId]);
        await db.query("INSERT INTO sales_kpi_months VALUES ($1,2026,7,'Nomin'),($1,2026,6,'Номин.Одончимэг')", [shopId]);
        await db.query(`INSERT INTO leads(shop_id,project_id,sales_manager_name) VALUES ($1,$2,'Nomin'),($1,$2,'Nomin'),
            ($1,$2,'Номин.Одончимэг'),($1,$2,'Ариунбилэг'),($1,$2,NULL)`, [shopId, projectId]);
        await db.query("INSERT INTO property_viewings(shop_id,sales_manager_name) VALUES ($1,'Nomin'),($1,'Ариунбилэг')", [shopId]);
        await db.query("INSERT INTO property_contracts(shop_id,sales_manager) VALUES ($1,'Номин.Одончимэг'),($1,'Номин.Одончимэг'),($1,'Nomin')", [shopId]);
        await db.query("INSERT INTO customers(shop_id,sales_manager_name) VALUES ($1,'Nomin')", [shopId]);
        await db.query("INSERT INTO service_logs(shop_id,manager_name,assigned_to) VALUES ($1,'Nomin','Nomin')", [shopId]);
        await db.query(`INSERT INTO daily_report_counts VALUES ($1,'2026-11-18','Nomin','call.l1.total',6,'Nomin'),
            ($1,'2026-11-18','Nomin','chat.page',2,'Nomin'),($1,'2026-11-17','Номин.Одончимэг','call.l1.total',4,'Ариунбилэг')`, [shopId]);
        await db.query('INSERT INTO daily_report_settings VALUES ($1, $2::jsonb)', [shopId, JSON.stringify({ title: null, lines: [], chats: [], managers: [
            { name: 'Ариунбилэг', short: 'Ари' }, { name: 'Номин.Одончимэг', short: 'Ном' }, { name: 'Nomin', short: 'Nom' },
        ] })]);
        await db.query("INSERT INTO daily_report_changes(shop_id,manager_name,changed_by_name) VALUES ($1,'Nomin','Nomin')", [shopId]);
        await db.query("INSERT INTO property_units(shop_id,sales_manager,updated_at) VALUES ($1,'Nomin',$2),($1,'Номин.Одончимэг',$2)", [shopId, '2026-10-01T00:00:00Z']);
        await db.query("INSERT INTO lead_activities(shop_id,created_by_name) VALUES ($1,'Nomin')", [shopId]);
    }
    // Эхний лид өмнө нь хариуцуулалтын тамгатай; бусад нь тамгагүй (хуучин өгөгдөл).
    await db.query("UPDATE leads SET sales_handoff_at = '2026-07-29T00:00:00Z' WHERE id = (SELECT min(id) FROM leads WHERE shop_id = $1)", [shop]);
    await db.exec('ALTER TABLE leads ENABLE TRIGGER USER');
    const ids = Object.fromEntries((await db.query<{ name: string; id: string }>('SELECT name, id FROM sales_managers WHERE shop_id = $1', [shop])).rows
        .map(row => [row.name, row.id]));
    await db.query('INSERT INTO sales_work_plan_items(shop_id,assignee_ids) VALUES ($1,$2),($1,$3),($1,$4)',
        [shop, [ids['Nomin'], ids['Ариунбилэг']], [ids['Номин.Одончимэг'], ids['Nomin']], [ids['Ариунбилэг']]]);
    return ids;
}

describe('apply-migrations VERIFY', () => {
    it('passes on the migrated schema', async () => {
        expect((await db.query<{ ok: boolean }>(migrationVerifyQuery('20261118120000'))).rows[0].ok).toBe(true);
    });
});

describe('merge_sales_managers', () => {
    it('moves every key column into the existing name, carries the account, activation and projects, and audits', async () => {
        const ids = await seed();
        await db.exec('SET ROLE service_role');
        const { result } = (await merge('Nomin', 'Номин.Одончимэг')).rows[0];
        await db.exec('RESET ROLE');
        const counts = { sales_manager_projects: 1, sales_kpi_months: 1, sales_work_plan_items: 2, leads: 2, property_viewings: 1,
            property_contracts: 1, customers: 1, service_logs: 1, daily_report_counts: 2, daily_report_settings: 1, property_units: 1 };
        expect(result).toEqual({ source_name: 'Nomin', target_name: 'Номин.Одончимэг', counts, user_linked: true, is_active: true });

        // Нэг мөр үлдэнэ: target-ийн id, source-ийн акаунт, идэвхтэй, source-ийн төсөл.
        expect((await db.query('SELECT id, name, user_id, is_active FROM sales_managers WHERE shop_id = $1 ORDER BY name', [shop])).rows).toEqual([
            { id: ids['Ариунбилэг'], name: 'Ариунбилэг', user_id: null, is_active: true },
            { id: ids['Номин.Одончимэг'], name: 'Номин.Одончимэг', user_id: nomin, is_active: true },
        ]);
        expect((await db.query('SELECT manager_name, project_id FROM sales_manager_projects WHERE shop_id = $1 ORDER BY 1', [shop])).rows).toEqual([
            { manager_name: 'Ариунбилэг', project_id: project }, { manager_name: 'Номин.Одончимэг', project_id: project },
        ]);
        expect((await db.query('SELECT year, month, manager_name FROM sales_kpi_months WHERE shop_id = $1 ORDER BY month', [shop])).rows).toEqual([
            { year: 2026, month: 6, manager_name: 'Номин.Одончимэг' }, { year: 2026, month: 7, manager_name: 'Номин.Одончимэг' },
        ]);
        expect((await db.query<{ assignee_ids: string[] }>('SELECT assignee_ids FROM sales_work_plan_items WHERE shop_id = $1 ORDER BY id', [shop])).rows
            .map(row => row.assignee_ids)).toEqual([[ids['Номин.Одончимэг'], ids['Ариунбилэг']], [ids['Номин.Одончимэг']], [ids['Ариунбилэг']]]);
        expect(await names('SELECT sales_manager_name AS name FROM leads WHERE shop_id = $1 ORDER BY id'))
            .toEqual(['Номин.Одончимэг', 'Номин.Одончимэг', 'Номин.Одончимэг', 'Ариунбилэг', null]);
        expect(await names('SELECT sales_manager_name AS name FROM property_viewings WHERE shop_id = $1 ORDER BY id')).toEqual(['Номин.Одончимэг', 'Ариунбилэг']);
        expect(await names('SELECT sales_manager AS name FROM property_contracts WHERE shop_id = $1 ORDER BY id'))
            .toEqual(['Номин.Одончимэг', 'Номин.Одончимэг', 'Номин.Одончимэг']);
        expect(await names('SELECT sales_manager_name AS name FROM customers WHERE shop_id = $1')).toEqual(['Номин.Одончимэг']);
        expect((await db.query('SELECT manager_name, assigned_to FROM service_logs WHERE shop_id = $1', [shop])).rows)
            .toEqual([{ manager_name: 'Номин.Одончимэг', assigned_to: 'Nomin' }]);
        expect((await db.query('SELECT report_date::text, manager_name, metric, value, updated_by_name FROM daily_report_counts WHERE shop_id = $1 ORDER BY 1, 3', [shop])).rows).toEqual([
            { report_date: '2026-11-17', manager_name: 'Номин.Одончимэг', metric: 'call.l1.total', value: 4, updated_by_name: 'Ариунбилэг' },
            { report_date: '2026-11-18', manager_name: 'Номин.Одончимэг', metric: 'call.l1.total', value: 6, updated_by_name: 'Nomin' },
            { report_date: '2026-11-18', manager_name: 'Номин.Одончимэг', metric: 'chat.page', value: 2, updated_by_name: 'Nomin' },
        ]);
        // Target-ийн багана (байрлал, товчлол) үлдэж source-ийн багана хасагдана.
        expect((await db.query<{ config: { managers: unknown } }>('SELECT config FROM daily_report_settings WHERE shop_id = $1', [shop])).rows[0].config.managers)
            .toEqual([{ name: 'Ариунбилэг', short: 'Ари' }, { name: 'Номин.Одончимэг', short: 'Ном' }]);
        expect(await names('SELECT sales_manager AS name FROM property_units WHERE shop_id = $1 ORDER BY id')).toEqual(['Номин.Одончимэг', 'Номин.Одончимэг']);
        // Байрны огноо, хариуцуулалтын тамга шинээр зохиогдохгүй; түүх, «хэн оруулсан» хуучин нэрээрээ.
        expect((await db.query<{ kept: boolean }>("SELECT updated_at = '2026-10-01T00:00:00Z'::timestamptz AS kept FROM property_units WHERE shop_id = $1", [shop])).rows
            .every(row => row.kept)).toBe(true);
        expect((await db.query<{ stamped: boolean }>('SELECT sales_handoff_at IS NOT NULL AS stamped FROM leads WHERE shop_id = $1 ORDER BY id', [shop])).rows
            .map(row => row.stamped)).toEqual([true, false, false, false, false]);
        expect(await names('SELECT manager_name AS name FROM daily_report_changes WHERE shop_id = $1')).toEqual(['Nomin']);
        expect(await names('SELECT created_by_name AS name FROM lead_activities WHERE shop_id = $1')).toEqual(['Nomin']);

        // Өөр төсөл огт өөрчлөгдөөгүй.
        expect(await names('SELECT name FROM sales_managers WHERE shop_id = $1 ORDER BY name', otherShop)).toEqual(['Nomin', 'Ариунбилэг', 'Номин.Одончимэг']);
        expect(await names("SELECT sales_manager_name AS name FROM leads WHERE shop_id = $1 AND sales_manager_name = 'Nomin'", otherShop)).toHaveLength(2);
        expect(await names("SELECT manager_name AS name FROM daily_report_counts WHERE shop_id = $1 AND manager_name = 'Nomin'", otherShop)).toHaveLength(2);

        const audit = (await db.query<{ action: string; actor_id: string; target_id: string; meta: Record<string, unknown> }>(
            'SELECT action, actor_id, target_id, meta FROM admin_audit_log')).rows;
        expect(audit).toEqual([{ action: 'sales.manager.merge', actor_id: actor, target_id: ids['Номин.Одончимэг'], meta: {
            shop_id: shop, source_name: 'Nomin', target_name: 'Номин.Одончимэг', source_id: ids['Nomin'], user_linked: true, is_active: true, counts,
        } }]);
    });

    it('keeps the target account and activation, and a new real assignment in the same transaction is still guarded and stamped', async () => {
        await seed();
        await db.query("UPDATE sales_managers SET user_id = $2 WHERE shop_id = $1 AND name = 'Ариунбилэг'", [shop, other]);
        await db.query("UPDATE sales_managers SET user_id = NULL, is_active = false WHERE shop_id = $1 AND name = 'Nomin'", [shop]);
        await db.exec('BEGIN');
        const { result } = (await merge('Nomin', 'Ариунбилэг')).rows[0];
        expect(result).toMatchObject({ user_linked: false, is_active: true });
        // Тэмдэг гүйлгээний дотор унтарсан: жинхэнэ хуваарилалт хуучин дүрмээр тамгалагдана.
        await db.query("UPDATE leads SET sales_manager_name = 'Ариунбилэг' WHERE shop_id = $1 AND sales_manager_name IS NULL", [shop]);
        await db.exec('COMMIT');
        expect((await db.query('SELECT user_id, is_active FROM sales_managers WHERE shop_id = $1 AND name = $2', [shop, 'Ариунбилэг'])).rows)
            .toEqual([{ user_id: other, is_active: true }]);
        expect((await db.query<{ stamped: boolean }>("SELECT sales_handoff_at IS NOT NULL AS stamped FROM leads WHERE shop_id = $1 AND sales_manager_name = 'Ариунбилэг' ORDER BY id", [shop]))
            .rows.map(row => row.stamped)).toEqual([true, false, false, true]);
        // Идэвхгүй, төсөлгүй менежерт шинэ хуваарилалт тэмдэггүй үед татгалзана.
        await expect(db.query("UPDATE leads SET sales_manager_name = 'Номин.Одончимэг' WHERE shop_id = $1 AND sales_manager_name = 'Ариунбилэг'", [shop]))
            .rejects.toMatchObject({ code: '23514' });
    });

    it('refuses two different accounts, clashing daily-report cells or KPI months, and writes nothing', async () => {
        await seed();
        await db.query("UPDATE sales_managers SET user_id = $2 WHERE shop_id = $1 AND name = 'Номин.Одончимэг'", [shop, other]);
        await expect(merge('Nomin', 'Номин.Одончимэг')).rejects.toMatchObject({ code: '23505', message: expect.stringContaining('өөр өөр акаунттай') });
        await db.query("UPDATE sales_managers SET user_id = NULL WHERE shop_id = $1 AND name = 'Номин.Одончимэг'", [shop]);

        await db.query("INSERT INTO daily_report_counts VALUES ($1,'2026-11-18','Номин.Одончимэг','chat.page',1,NULL)", [shop]);
        await expect(merge('Nomin', 'Номин.Одончимэг')).rejects.toMatchObject({ code: '23505', message: expect.stringContaining('2026-11-18') });
        await db.query("DELETE FROM daily_report_counts WHERE shop_id = $1 AND manager_name = 'Номин.Одончимэг' AND report_date = '2026-11-18'", [shop]);

        await db.query("INSERT INTO sales_kpi_months VALUES ($1,2026,7,'Номин.Одончимэг')", [shop]);
        await expect(merge('Nomin', 'Номин.Одончимэг')).rejects.toMatchObject({ code: '23505', message: expect.stringContaining('2026-07') });

        expect(await names('SELECT name FROM sales_managers WHERE shop_id = $1 ORDER BY name')).toEqual(['Nomin', 'Ариунбилэг', 'Номин.Одончимэг']);
        expect(await names("SELECT sales_manager_name AS name FROM leads WHERE shop_id = $1 AND sales_manager_name = 'Nomin'")).toHaveLength(2);
        expect(await auditCount()).toBe(0);
    });

    it('rolls everything back when a table check refuses the target name, naming the table in Mongolian', async () => {
        await seed();
        await db.exec('ALTER TABLE customers ADD CONSTRAINT customers_manager_short CHECK (char_length(sales_manager_name) <= 6)');
        await expect(merge('Nomin', 'Номин.Одончимэг')).rejects.toMatchObject({ code: '23514', message: expect.stringContaining('харилцагч') });
        expect(await names('SELECT name FROM sales_managers WHERE shop_id = $1 ORDER BY name')).toEqual(['Nomin', 'Ариунбилэг', 'Номин.Одончимэг']);
        expect(await names("SELECT manager_name AS name FROM sales_manager_projects WHERE shop_id = $1 AND manager_name = 'Nomin'")).toHaveLength(1);
        expect(await names("SELECT manager_name AS name FROM sales_kpi_months WHERE shop_id = $1 AND manager_name = 'Nomin'")).toHaveLength(1);
        expect(await auditCount()).toBe(0);
    });

    it('refuses unknown or identical names, other projects, non-super-admins and browser roles without writing', async () => {
        await seed();
        await expect(merge('Байхгүй', 'Номин.Одончимэг')).rejects.toMatchObject({ code: 'P0002' });
        await expect(merge('Nomin', 'Байхгүй')).rejects.toMatchObject({ code: 'P0002' });
        await expect(merge('Nomin', 'Nomin')).rejects.toMatchObject({ code: '22023' });
        await expect(merge('Nomin', 'Номин.Одончимэг', actor, '20000000-0000-4000-8000-000000000009')).rejects.toMatchObject({ code: '42501' });
        await db.query("UPDATE user_roles SET role = 'admin'");
        await expect(merge('Nomin', 'Номин.Одончимэг')).rejects.toMatchObject({ code: '42501' });
        await db.exec('SET ROLE authenticated');
        await expect(merge('Nomin', 'Номин.Одончимэг')).rejects.toMatchObject({ code: '42501' });
        await db.exec('RESET ROLE');
        expect(await names('SELECT name FROM sales_managers WHERE shop_id = $1 ORDER BY name')).toEqual(['Nomin', 'Ариунбилэг', 'Номин.Одончимэг']);
        expect(await auditCount()).toBe(0);
        const grants = (await db.query<{ grantee: string }>(`SELECT grantee FROM information_schema.routine_privileges
            WHERE routine_name = 'merge_sales_managers' AND grantee IN ('PUBLIC', 'anon', 'authenticated', 'service_role')`)).rows;
        expect(grants).toEqual([{ grantee: 'service_role' }]);
    });

    it('works where the work-plan table is missing', async () => {
        await seed();
        await db.exec('DROP TABLE sales_work_plan_items');
        const { result } = (await merge('Nomin', 'Номин.Одончимэг')).rows[0];
        expect(result.counts).not.toHaveProperty('sales_work_plan_items');
        expect(result.counts.leads).toBe(2);
    });
});

// @vitest-environment node
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { expect, it } from 'vitest';
import { applyProjectShopSplit, planProjectShopSplit } from '../../../../../scripts/lib/project-shop-split.mjs';

type SplitPlan = { migrationReady: boolean; steps: Array<{ split: string; skip?: string; tables?: Record<string, number> }>; keep: unknown[] };

const legacy = '20000000-0000-4000-8000-000000000001';
const garden = '30000000-0000-4000-8000-000000000001';
const elysium = '30000000-0000-4000-8000-000000000002';
const tower = '30000000-0000-4000-8000-000000000003';
const director = '10000000-0000-4000-8000-000000000001';
const marketer = '10000000-0000-4000-8000-000000000002';
const seller = '10000000-0000-4000-8000-000000000003';

it('splits sub-projects into their own shops and links the remaining shop inventory in one transaction', async () => {
    const db = new PGlite();
    // pg Client-тэй ижил интерфейс: { rows, rowCount }.
    const client = { query: async (sql: string, params: unknown[] = []) => {
        const result = await db.query<Record<string, unknown>>(sql, params);
        return { rows: result.rows, rowCount: result.affectedRows ?? result.rows.length };
    } };
    try {
        await db.exec(`
            CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
            CREATE SCHEMA private;
            CREATE TABLE shops (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL, is_active boolean, setup_completed boolean);
            CREATE TABLE projects (id uuid PRIMARY KEY, shop_id uuid NOT NULL REFERENCES shops(id), name text NOT NULL,
                location text, district text, description text, status text, created_at timestamptz DEFAULT now(), updated_at timestamptz);
            CREATE TABLE user_roles (user_id uuid PRIMARY KEY, role text NOT NULL);
            CREATE TABLE user_profiles (id uuid PRIMARY KEY, email text, full_name text);
            CREATE TABLE shop_members (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), shop_id uuid NOT NULL, user_id uuid NOT NULL,
                role text NOT NULL DEFAULT 'member', UNIQUE (shop_id, user_id));
            CREATE TABLE admin_audit_log (id bigserial PRIMARY KEY, actor_id uuid, action text, target_id text, meta jsonb);
            CREATE TABLE sales_manager_projects (shop_id uuid, manager_name text, project_id uuid);
            CREATE TABLE erp_imports (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), shop_id uuid NOT NULL, source text NOT NULL);
            CREATE TABLE shop_faqs (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), shop_id uuid NOT NULL, question text NOT NULL);
            CREATE TABLE leads (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), shop_id uuid NOT NULL, project_id uuid,
                customer_id uuid, sales_manager_name text);
        `);
        for (const table of ['property_units', 'property_contracts', 'properties', 'marketing_campaigns', 'marketing_spend_entries',
            'marketing_targets', 'marketing_project_budgets', 'newsletters', 'newsletter_project_settings', 'project_budgets',
            'finance_transactions', 'vendor_bills']) {
            await db.exec(`CREATE TABLE ${table} (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), shop_id uuid NOT NULL, project_id uuid)`);
        }
        for (const table of ['lead_activities', 'lead_attribution_events', 'property_viewings']) {
            await db.exec(`CREATE TABLE ${table} (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), shop_id uuid NOT NULL, lead_id uuid REFERENCES leads(id))`);
        }
        // Production-ийн лидийн trigger: лидийн төсөл тухайн shop-ынх байх ёстой.
        await db.exec(`
            CREATE FUNCTION lead_project_in_shop() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
                IF NEW.project_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM projects WHERE id = NEW.project_id AND shop_id = NEW.shop_id)
                THEN RAISE EXCEPTION 'Лидийн төсөл байгууллагад харьяалагдахгүй байна' USING ERRCODE = '23514'; END IF;
                RETURN NEW; END $$;
            CREATE TRIGGER lead_project_in_shop BEFORE INSERT OR UPDATE ON leads FOR EACH ROW EXECUTE FUNCTION lead_project_in_shop();
        `);
        await db.query('INSERT INTO shops (id, name) VALUES ($1, $2)', [legacy, 'Mandala Garden']);
        await db.query('INSERT INTO projects (id, shop_id, name) VALUES ($1,$4,$5),($2,$4,$6),($3,$4,$7)',
            [garden, elysium, tower, legacy, 'Mandala Garden', 'Elysium Residence', 'Mandala 360&365 Tower']);
        await db.exec(readFileSync('supabase/migrations/20261004130000_project_shops.sql', 'utf8'));
        await db.query(`INSERT INTO user_roles VALUES ($1,'super_admin'),($2,'marketing'),($3,'sales_manager')`, [director, marketer, seller]);
        await db.query(`INSERT INTO user_profiles (id, full_name) VALUES ($1,'Батаа'),($2,'Анужин'),($3,'Номин')`, [director, marketer, seller]);
        await db.query('INSERT INTO shop_members (shop_id, user_id) VALUES ($1,$2),($1,$3),($1,$4)', [legacy, director, marketer, seller]);
        const elysiumLead = (await db.query<{ id: string }>('INSERT INTO leads (shop_id, project_id) VALUES ($1,$2),($1,$2) RETURNING id', [legacy, elysium])).rows[0].id;
        await db.query('INSERT INTO leads (shop_id, project_id, sales_manager_name) VALUES ($1, NULL, $2)', [legacy, 'Khongoroo']);
        await db.query('INSERT INTO lead_activities (shop_id, lead_id) VALUES ($1,$2)', [legacy, elysiumLead]);
        await db.query(`INSERT INTO erp_imports (shop_id, source) VALUES ($1,'Elysium ERP'),($1,'Garden ERP')`, [legacy]);
        await db.query(`INSERT INTO shop_faqs (shop_id, question) VALUES ($1,'Elysium Урьдчилгаа хэд вэ?'),($1,'Mandala Garden хаана байрлах вэ?')`, [legacy]);
        await db.query('INSERT INTO property_units (shop_id) VALUES ($1),($1),($1)', [legacy]);
        await db.query('INSERT INTO property_contracts (shop_id) VALUES ($1),($1)', [legacy]);

        const dryRun = await planProjectShopSplit(client) as SplitPlan;
        expect(dryRun.migrationReady).toBe(true);
        expect(dryRun.steps.map(step => [step.split, step.tables?.leads, step.tables?.lead_activities]))
            .toEqual([['Elysium Residence', 2, 1], ['Mandala 360&365 Tower', 0, 0]]);
        expect(dryRun.keep).toMatchObject([{ project: { id: garden }, units: 3, contracts: 2, leadsWithoutProject: 1 }]);

        // Тоо зөрвөл бүх өөрчлөлт буцна.
        const tampered = structuredClone(dryRun);
        tampered.steps[0].tables!.leads = 99;
        await expect(applyProjectShopSplit(client, tampered as never)).rejects.toThrow(/leads 99/);
        expect((await db.query('SELECT count(*)::int AS n FROM shops')).rows).toEqual([{ n: 1 }]);
        expect((await db.query('SELECT DISTINCT shop_id FROM projects')).rows).toEqual([{ shop_id: legacy }]);

        const receipt = await applyProjectShopSplit(client, await planProjectShopSplit(client, { apply: true }));
        const shopOf = async (project: string) => (await db.query<{ shop_id: string }>('SELECT shop_id FROM projects WHERE id = $1', [project])).rows[0].shop_id;
        const elysiumShop = await shopOf(elysium);
        const towerShop = await shopOf(tower);
        expect(await shopOf(garden)).toBe(legacy);
        expect(new Set([legacy, elysiumShop, towerShop]).size).toBe(3);
        expect((await db.query('SELECT name FROM shops WHERE id = $1', [elysiumShop])).rows).toEqual([{ name: 'Elysium Residence' }]);
        expect((await db.query('SELECT count(*)::int AS n FROM leads WHERE shop_id = $1 AND project_id = $2', [elysiumShop, elysium])).rows).toEqual([{ n: 2 }]);
        expect((await db.query('SELECT shop_id FROM lead_activities')).rows).toEqual([{ shop_id: elysiumShop }]);
        expect((await db.query('SELECT source, shop_id = $1 AS moved FROM erp_imports ORDER BY source', [elysiumShop])).rows)
            .toEqual([{ source: 'Elysium ERP', moved: true }, { source: 'Garden ERP', moved: false }]);
        expect((await db.query('SELECT count(*)::int AS n FROM shop_faqs WHERE shop_id = $1', [elysiumShop])).rows).toEqual([{ n: 1 }]);
        // Удирдлага, маркетинг хуулагдана; борлуулалтын менежерийг админ тусад нь нэмнэ.
        expect((await db.query('SELECT user_id FROM shop_members WHERE shop_id = $1 ORDER BY user_id', [elysiumShop])).rows)
            .toEqual([{ user_id: director }, { user_id: marketer }]);
        expect((await db.query('SELECT count(*)::int AS n FROM property_units WHERE project_id = $1', [garden])).rows).toEqual([{ n: 3 }]);
        expect((await db.query('SELECT count(*)::int AS n FROM property_contracts WHERE project_id = $1', [garden])).rows).toEqual([{ n: 2 }]);
        // Төсөлгүй хуучин лидийн төслийг таахгүй.
        expect((await db.query('SELECT project_id FROM leads WHERE sales_manager_name = $1', ['Khongoroo'])).rows).toEqual([{ project_id: null }]);
        expect((await db.query(`SELECT count(*)::int AS n FROM admin_audit_log WHERE action = 'project.split_shop'`)).rows).toEqual([{ n: 2 }]);
        expect(receipt).toHaveLength(3);

        // Дахин ажиллуулахад юу ч өөрчлөгдөхгүй.
        const again = await planProjectShopSplit(client, { apply: true }) as SplitPlan;
        expect(again.steps.every(step => step.skip === 'Аль хэдийн тусдаа shop-той')).toBe(true);
    } finally { await db.close(); }
}, 30_000);

/** Disposable PostgreSQL lead ownership regression; never connects to production. */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

const db = new PGlite();
const ids = Object.fromEntries(['shop', 'foreignShop', 'mandala', 'elysium', 'foreignProject', 'sales', 'colleague', 'elysiumSales', 'admin', 'super', 'marketing', 'inactive', 'unlinked', 'legacyUser', 'ambiguous', 'own', 'colleagueLead', 'elysiumLead', 'unassigned', 'legacy', 'wrongProject', 'deleted', 'foreignLead', 'legacyLead'].map(key => [key, randomUUID()]));
const membershipMigration = await readFile(new URL('../supabase/migrations/20261001130000_sales_manager_projects.sql', import.meta.url), 'utf8');
const scopeMigration = await readFile(new URL('../supabase/migrations/20261001131000_sales_lead_scope.sql', import.meta.url), 'utf8');
let checks = 0;
async function check(name, fn) { await fn(); checks++; console.log(`✓ ${name}`); }
async function asUser(user, fn, role = 'authenticated') {
    await db.exec('BEGIN');
    try {
        await db.query("SELECT set_config('request.jwt.claim.sub', $1, true)", [ids[user]]);
        await db.exec(`SET LOCAL ROLE ${role}`);
        return await fn();
    } finally { await db.exec('ROLLBACK'); }
}
const visible = async table => (await db.query(`SELECT id FROM ${table} ORDER BY id`)).rows.map(row => row.id);
const permissionDenied = fn => assert.rejects(fn, error => error.code === '42501');
const assignmentDenied = fn => assert.rejects(fn, error => error.code === '23514');

try {
    await db.exec(`
        CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
        CREATE SCHEMA auth;
        GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;
        CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
            $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
        CREATE TABLE user_roles (user_id uuid PRIMARY KEY, role text NOT NULL);
        CREATE TABLE user_profiles (id uuid PRIMARY KEY, full_name text);
        CREATE TABLE shops (id uuid PRIMARY KEY, user_id uuid);
        CREATE TABLE shop_members (shop_id uuid, user_id uuid);
        CREATE TABLE projects (id uuid PRIMARY KEY, shop_id uuid NOT NULL, name text);
        CREATE TABLE sales_managers (shop_id uuid NOT NULL, name text NOT NULL, user_id uuid, is_active boolean NOT NULL, UNIQUE(shop_id, name));
        CREATE TABLE leads (id uuid PRIMARY KEY, shop_id uuid NOT NULL, project_id uuid, sales_manager_name text, deleted_at timestamptz, notes text);
        CREATE TABLE lead_activities (id uuid PRIMARY KEY, shop_id uuid NOT NULL, lead_id uuid NOT NULL);
        CREATE TABLE property_viewings (id uuid PRIMARY KEY, shop_id uuid NOT NULL, lead_id uuid, deleted_at timestamptz);
        CREATE TABLE ai_attachments (id uuid PRIMARY KEY, shop_id uuid NOT NULL, entity_type text NOT NULL, entity_id uuid);
        CREATE TABLE lead_attribution_events (id uuid PRIMARY KEY, shop_id uuid NOT NULL, lead_id uuid);
        CREATE FUNCTION public.get_user_shop_ids() RETURNS SETOF uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
            SELECT id FROM public.shops WHERE user_id = auth.uid()
            UNION SELECT shop_id FROM public.shop_members WHERE user_id = auth.uid()
        $$;
        GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role;
    `);
    await db.query('INSERT INTO shops VALUES ($1,$2),($3,$4)', [ids.shop, ids.admin, ids.foreignShop, ids.elysiumSales]);
    for (const user of ['sales', 'colleague', 'elysiumSales', 'admin', 'super', 'marketing', 'inactive', 'unlinked', 'legacyUser', 'ambiguous']) {
        await db.query('INSERT INTO shop_members VALUES ($1,$2)', [ids.shop, ids[user]]);
        const role = ['admin', 'super', 'marketing', 'ambiguous'].includes(user) ? ({ super: 'super_admin', ambiguous: 'custom' }[user] || user) : 'sales_manager';
        await db.query('INSERT INTO user_roles VALUES ($1,$2)', [ids[user], role]);
    }
    await db.query('INSERT INTO user_profiles VALUES ($1,$2),($3,$4),($5,$6)', [ids.sales, 'Canonical Changed', ids.unlinked, 'Манда', ids.legacyUser, 'Legacy']);
    for (const [name, user, active] of [['Манда', 'sales', true], ['Хамтрагч', 'colleague', true], ['Эли', 'elysiumSales', true], ['Inactive', 'inactive', false], ['Legacy', null, true], ['Duplicate A', 'ambiguous', true], ['Duplicate B', 'ambiguous', true]]) {
        await db.query('INSERT INTO sales_managers VALUES ($1,$2,$3,$4)', [ids.shop, name, user ? ids[user] : null, active]);
    }
    await db.query('INSERT INTO projects VALUES ($1,$2,$3),($4,$2,$5),($6,$7,$8)', [ids.mandala, ids.shop, 'Mandala Garden', ids.elysium, 'Elysium', ids.foreignProject, ids.foreignShop, 'Foreign']);
    await db.exec(membershipMigration);
    for (const [name, project] of [['Манда', 'mandala'], ['Хамтрагч', 'mandala'], ['Эли', 'elysium'], ['Inactive', 'mandala'], ['Legacy', 'mandala']]) {
        await db.query('INSERT INTO sales_manager_projects VALUES ($1,$2,$3)', [ids.shop, name, ids[project]]);
    }
    for (const [lead, project, manager, deleted] of [['own', 'mandala', 'Манда', null], ['colleagueLead', 'mandala', 'Хамтрагч', null], ['elysiumLead', 'elysium', 'Эли', null], ['unassigned', 'mandala', null, null], ['legacy', null, 'Манда', null], ['wrongProject', 'elysium', 'Манда', null], ['deleted', 'mandala', 'Манда', '2026-09-01'], ['legacyLead', 'mandala', 'Legacy', null]]) {
        await db.query('INSERT INTO leads VALUES ($1,$2,$3,$4,$5,$6)', [ids[lead], ids.shop, project ? ids[project] : null, manager, deleted, 'Preserved']);
        await db.query('INSERT INTO lead_activities VALUES ($1,$2,$3)', [ids[lead], ids.shop, ids[lead]]);
        await db.query('INSERT INTO property_viewings VALUES ($1,$2,$3,NULL)', [ids[lead], ids.shop, ids[lead]]);
        await db.query("INSERT INTO ai_attachments VALUES ($1,$2,'lead',$3)", [ids[lead], ids.shop, ids[lead]]);
        await db.query('INSERT INTO lead_attribution_events VALUES ($1,$2,$3)', [ids[lead], ids.shop, ids[lead]]);
    }
    await db.query('INSERT INTO leads VALUES ($1,$2,$3,NULL,NULL,NULL)', [ids.foreignLead, ids.foreignShop, ids.foreignProject]);
    await db.query('INSERT INTO property_viewings VALUES ($1,$2,NULL,NULL)', [randomUUID(), ids.shop]);
    for (const table of ['leads', 'lead_activities', 'property_viewings', 'ai_attachments', 'lead_attribution_events']) {
        await db.exec(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY;
            CREATE POLICY legacy_open_access ON ${table} FOR ALL TO authenticated USING (true) WITH CHECK (true);`);
    }
    await db.exec(scopeMigration);
    await check('manager sees only self-assigned Mandala leads, history, meetings and attachments', async () => {
        for (const table of ['leads', 'lead_activities', 'property_viewings', 'ai_attachments', 'lead_attribution_events']) {
            assert.deepEqual(await asUser('sales', () => visible(table)), [ids.own]);
        }
    });
    await check('Elysium and same-project colleague each see only their assigned leads', async () => {
        assert.deepEqual(await asUser('elysiumSales', () => visible('leads')), [ids.elysiumLead]);
        assert.deepEqual(await asUser('colleague', () => visible('leads')), [ids.colleagueLead]);
    });
    await check('admin, super_admin and organizational marketing retain shop-wide live leads', async () => {
        for (const user of ['admin', 'super', 'marketing']) assert.equal((await asUser(user, () => visible('leads'))).length, 7);
    });
    await check('shop boundary remains enforced for super_admin and permissive legacy policies', async () => {
        const result = await asUser('super', () => db.query('SELECT private.can_read_sales_lead($1,$2,NULL) AS allowed', [ids.foreignShop, ids.foreignProject]));
        assert.equal(result.rows[0].allowed, false);
    });
    await check('inactive, unlinked and ambiguous manager identities fail closed', async () => {
        for (const user of ['inactive', 'unlinked', 'ambiguous']) assert.deepEqual(await asUser(user, () => visible('leads')), []);
    });
    await check('profile names cannot grant lead access through an unlinked legacy roster', async () => {
        assert.deepEqual(await asUser('legacyUser', () => visible('leads')), []);
    });
    await check('browser business mutations stay denied for managers and application admins', async () => {
        for (const user of ['sales', 'admin', 'super']) {
            for (const table of ['leads', 'lead_activities', 'property_viewings', 'sales_managers', 'ai_attachments']) {
                await permissionDenied(() => asUser(user, () => db.exec(`UPDATE ${table} SET shop_id=shop_id`)));
                await permissionDenied(() => asUser(user, () => db.exec(`DELETE FROM ${table}`)));
            }
            await permissionDenied(() => asUser(user, () => db.query('INSERT INTO leads(id,shop_id) VALUES ($1,$2)', [randomUUID(), ids.shop])));
            await permissionDenied(() => asUser(user, () => db.query('INSERT INTO sales_managers(shop_id,name,user_id,is_active) VALUES ($1,$2,$3,true)', [ids.shop, 'Borrowed identity', ids.sales])));
            await permissionDenied(() => asUser(user, () => db.query("UPDATE ai_attachments SET entity_type='property' WHERE id=$1", [ids.elysiumLead])));
        }
    });
    await check('anonymous clients cannot read private lead, activity or viewing rows', async () => {
        for (const table of ['leads', 'lead_activities', 'property_viewings']) {
            await permissionDenied(() => asUser('sales', () => visible(table), 'anon'));
        }
    });
    await check('service-role cannot assign Mandala leads to an Elysium manager', async () => {
        await assignmentDenied(() => asUser('admin', () => db.query('UPDATE leads SET sales_manager_name=$1 WHERE id=$2', ['Эли', ids.own]), 'service_role'));
        await assignmentDenied(() => asUser('admin', () => db.query('INSERT INTO leads(id,shop_id,project_id,sales_manager_name) VALUES ($1,$2,$3,$4)', [randomUUID(), ids.shop, ids.elysium, 'Манда']), 'service_role'));
    });
    await check('assignment requires a project, active manager and matching project shop', async () => {
        for (const [project, manager] of [[null, 'Манда'], [ids.mandala, 'Inactive'], [ids.foreignProject, null]]) {
            await assignmentDenied(() => asUser('admin', () => db.query('INSERT INTO leads(id,shop_id,project_id,sales_manager_name) VALUES ($1,$2,$3,$4)', [randomUUID(), ids.shop, project, manager]), 'service_role'));
        }
    });
    await check('valid project assignment and explicit manager clearing are supported', async () => {
        await asUser('admin', () => db.query('UPDATE leads SET project_id=$1,sales_manager_name=$2 WHERE id=$3 RETURNING id', [ids.elysium, 'Эли', ids.own]), 'service_role');
        await asUser('admin', () => db.query('UPDATE leads SET sales_manager_name=NULL WHERE id=$1 RETURNING id', [ids.own]), 'service_role');
    });
    await check('legacy data stays unchanged and non-assignment edits remain valid', async () => {
        await asUser('admin', () => db.query('UPDATE leads SET notes=$1 WHERE id=$2', ['New note', ids.legacy]), 'service_role');
        await asUser('admin', () => db.query('UPDATE leads SET project_id=project_id,sales_manager_name=sales_manager_name WHERE id=$1', [ids.wrongProject]), 'service_role');
        const legacy = (await db.query('SELECT project_id,sales_manager_name,notes FROM leads WHERE id=$1', [ids.legacy])).rows[0];
        assert.deepEqual(legacy, { project_id: null, sales_manager_name: 'Манда', notes: 'Preserved' });
    });
    await check('revoking project membership removes existing lead access immediately', async () => {
        await db.query('DELETE FROM sales_manager_projects WHERE shop_id=$1 AND manager_name=$2', [ids.shop, 'Манда']);
        assert.deepEqual(await asUser('sales', () => visible('leads')), []);
    });
    console.log(`${checks} disposable PostgreSQL lead scope checks passed.`);
} finally { await db.close(); }

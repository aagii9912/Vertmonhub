/** Disposable PostgreSQL RBAC regression; never connects to a live database. */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';

const db = new PGlite();
const migration = await readFile(new URL('../supabase/migrations/20260928120000_rbac_api_boundary.sql', import.meta.url), 'utf8');
const ids = Object.fromEntries(['admin', 'sales', 'marketing', 'viewer', 'super', 'other', 'shop', 'otherShop', 'lead', 'property'].map(key => [key, randomUUID()]));
let checks = 0;
async function check(name, fn) { await fn(); checks++; console.log(`✓ ${name}`); }
async function asUser(key, fn, dbRole = 'authenticated') {
    await db.exec('BEGIN');
    try {
        await db.query("SELECT set_config('request.jwt.claim.sub', $1, true)", [ids[key]]);
        await db.exec(`SET LOCAL ROLE ${dbRole}`);
        return await fn();
    } finally { await db.exec('ROLLBACK'); }
}
const forbidden = fn => assert.rejects(fn, error => error.code === '42501');
const count = async table => Number((await db.query(`SELECT count(*) AS n FROM ${table}`)).rows[0].n);

try {
    await db.exec(`
        CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
        CREATE SCHEMA auth; CREATE SCHEMA storage;
        GRANT USAGE ON SCHEMA auth, storage TO anon, authenticated, service_role;
        CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
            $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
        CREATE TABLE user_roles (user_id uuid PRIMARY KEY, role text NOT NULL);
        CREATE TABLE roles (id text PRIMARY KEY, name text, can_write boolean, can_delete boolean);
        CREATE TABLE role_permissions (role_id text REFERENCES roles, module text);
        CREATE TABLE shops (id uuid PRIMARY KEY, user_id uuid, facebook_page_access_token text);
        CREATE TABLE shop_members (shop_id uuid, user_id uuid);
        CREATE TABLE leads (id uuid PRIMARY KEY, shop_id uuid);
        CREATE TABLE properties (id uuid PRIMARY KEY, shop_id uuid);
        CREATE TABLE customers (id uuid PRIMARY KEY, shop_id uuid);
        CREATE TABLE surveys (id uuid PRIMARY KEY, shop_id uuid);
        CREATE TABLE survey_responses (id uuid PRIMARY KEY, shop_id uuid);
        CREATE TABLE marketing_channels (id uuid PRIMARY KEY, shop_id uuid);
        CREATE TABLE channel_contracts (id uuid PRIMARY KEY, shop_id uuid);
        CREATE TABLE ai_messages (id uuid PRIMARY KEY);
        CREATE TABLE ai_attachments (id uuid PRIMARY KEY, shop_id uuid, entity_type text);
        CREATE TABLE user_tasks (id uuid PRIMARY KEY, user_id uuid, shop_id uuid);
        CREATE TABLE user_dashboard_prefs (user_id uuid PRIMARY KEY, shop_id uuid);
        CREATE TABLE user_profiles (id uuid PRIMARY KEY, full_name text);
        CREATE TABLE storage.objects (name text PRIMARY KEY, bucket_id text);
        CREATE FUNCTION public.get_user_shop_ids() RETURNS SETOF uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
            SELECT id FROM public.shops WHERE user_id=auth.uid()
            UNION SELECT shop_id FROM public.shop_members WHERE user_id=auth.uid()
        $$;
        CREATE FUNCTION public.is_active_admin() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
            SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id=auth.uid() AND role IN ('admin','super_admin'))
        $$;
        GRANT ALL ON ALL TABLES IN SCHEMA public, storage TO anon, authenticated, service_role;
        ALTER TABLE shops ENABLE ROW LEVEL SECURITY;
        CREATE POLICY shops_select_own ON shops FOR SELECT TO authenticated USING (user_id=auth.uid());
        ALTER TABLE user_roles ENABLE ROW LEVEL SECURITY;
        CREATE POLICY old_admin_all ON user_roles FOR ALL TO authenticated USING (is_active_admin()) WITH CHECK (is_active_admin());
        CREATE POLICY old_own_role ON user_roles FOR SELECT TO authenticated USING (user_id=auth.uid());
        ALTER TABLE user_tasks ENABLE ROW LEVEL SECURITY;
        CREATE POLICY personal_tasks ON user_tasks FOR ALL TO authenticated
            USING (user_id=auth.uid() AND shop_id IN (SELECT id FROM shops WHERE user_id=auth.uid() UNION SELECT shop_id FROM shop_members WHERE user_id=auth.uid()))
            WITH CHECK (user_id=auth.uid() AND shop_id IN (SELECT id FROM shops WHERE user_id=auth.uid() UNION SELECT shop_id FROM shop_members WHERE user_id=auth.uid()));
        ALTER TABLE user_dashboard_prefs ENABLE ROW LEVEL SECURITY;
        CREATE POLICY personal_prefs ON user_dashboard_prefs FOR ALL TO authenticated
            USING (user_id=auth.uid() AND shop_id IN (SELECT id FROM shops WHERE user_id=auth.uid() UNION SELECT shop_id FROM shop_members WHERE user_id=auth.uid()))
            WITH CHECK (user_id=auth.uid() AND shop_id IN (SELECT id FROM shops WHERE user_id=auth.uid() UNION SELECT shop_id FROM shop_members WHERE user_id=auth.uid()));
        ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
        CREATE POLICY personal_profile ON user_profiles FOR ALL TO authenticated USING (id=auth.uid()) WITH CHECK (id=auth.uid());
        ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
        CREATE POLICY legacy_storage ON storage.objects FOR ALL TO authenticated USING (true) WITH CHECK (true);
        CREATE POLICY public_images ON storage.objects FOR SELECT TO anon USING (bucket_id IN ('products','property-images'));
    `);
    for (const table of ['leads', 'properties', 'customers', 'surveys', 'survey_responses', 'marketing_channels', 'channel_contracts', 'ai_attachments']) {
        await db.exec(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY;
            CREATE POLICY old_shop_all ON ${table} FOR ALL TO authenticated
            USING (shop_id IN (SELECT get_user_shop_ids())) WITH CHECK (shop_id IN (SELECT get_user_shop_ids()));`);
    }
    // An extra permissive legacy read cannot defeat the new restrictive policy.
    await db.exec('CREATE POLICY legacy_open_read ON properties FOR SELECT TO authenticated USING (true)');
    for (const [key, role] of [['admin','admin'], ['sales','sales_manager'], ['marketing','marketing'], ['viewer','viewer'], ['super','super_admin'], ['other','sales_manager']]) {
        await db.query('INSERT INTO user_roles VALUES ($1,$2)', [ids[key],role]);
    }
    for (const [name, modules, write, del] of [
        ['admin', ['leads','properties','customers','surveys','marketing-roi'], true, true],
        ['sales_manager', ['leads','properties','customers','ai-assistant'], true, false],
        ['marketing', ['marketing-roi','surveys','customers'], true, false],
        ['viewer', ['dashboard','reports'], false, false],
    ]) {
        await db.query('INSERT INTO roles VALUES ($1,$1,$2,$3)',[name,write,del]);
        for (const moduleName of modules) await db.query('INSERT INTO role_permissions VALUES ($1,$2)',[name,moduleName]);
    }
    // super_admin deliberately has no roles row, matching the audited live DB.
    await db.query('INSERT INTO shops (id,user_id) VALUES ($1,$2),($3,$4)',[ids.shop,ids.admin,ids.otherShop,ids.other]);
    for(const key of ['sales','marketing','viewer','super']) await db.query('INSERT INTO shop_members VALUES ($1,$2)',[ids.shop,ids[key]]);
    await db.query('INSERT INTO leads VALUES ($1,$2)',[ids.lead,ids.shop]);
    await db.query('INSERT INTO customers VALUES ($1,$2)',[randomUUID(),ids.shop]);
    await db.query('INSERT INTO properties VALUES ($1,$2),($3,$4)',[ids.property,ids.shop,randomUUID(),ids.otherShop]);
    await db.query('INSERT INTO ai_attachments VALUES ($1,$2,$3)',[randomUUID(),ids.shop,'property']);
    await db.exec("INSERT INTO storage.objects VALUES ('fixture.png','property-images'),('other.png','other-bucket')");
    await db.exec(migration);
    await db.exec(migration);

    await check('admin cannot promote self or modify another user role', async () => {
        for (const userId of [ids.admin,ids.other]) await forbidden(() => asUser('admin', () => db.query("UPDATE user_roles SET role='super_admin' WHERE user_id=$1",[userId])));
    });
    await check('browser cannot insert/delete roles or edit permissions', async () => {
        await forbidden(() => asUser('admin', () => db.exec("INSERT INTO user_roles VALUES ('00000000-0000-4000-8000-000000000001','super_admin')")));
        await forbidden(() => asUser('admin', () => db.exec('DELETE FROM user_roles')));
        await forbidden(() => asUser('admin', () => db.exec('UPDATE roles SET can_delete=true')));
        await forbidden(() => asUser('admin', () => db.exec("INSERT INTO role_permissions VALUES ('marketing','properties')")));
    });
    await check('sales manager cannot delete leads; viewer cannot insert or update them', async () => {
        await forbidden(() => asUser('sales', () => db.exec('DELETE FROM leads')));
        await forbidden(() => asUser('viewer', () => db.query('INSERT INTO leads VALUES ($1,$2)',[randomUUID(),ids.shop])));
        await forbidden(() => asUser('viewer', () => db.exec('UPDATE leads SET shop_id=shop_id')));
    });
    await check('marketing cannot read properties, including through a permissive legacy policy', async () => {
        assert.equal(await asUser('marketing', () => count('properties')),0);
        assert.equal(await asUser('marketing', () => count('ai_attachments')),0);
    });
    await check('viewer cannot read customer or lead rows', async () => {
        assert.equal(await asUser('viewer', () => count('leads')),0);
        assert.equal(await asUser('viewer', () => count('customers')),0);
    });
    await check('authorized member reads remain scoped; other-shop rows stay hidden', async () => {
        assert.equal(await asUser('sales', () => count('properties')),1);
        assert.equal(await asUser('sales', () => count('leads')),1);
        assert.equal(await asUser('super', () => count('properties')),1);
        assert.equal(await asUser('other', () => count('leads')),0);
    });
    await check('non-super-admin only reads own role; super_admin can read assignments', async () => {
        assert.equal(await asUser('admin', () => count('user_roles')),1);
        assert.equal(await asUser('super', () => count('user_roles')),6);
    });
    await check('role revocation takes effect on the next query', async () => {
        await db.exec("DELETE FROM role_permissions WHERE role_id='sales_manager' AND module='properties'");
        assert.equal(await asUser('sales', () => count('properties')),0);
        await db.exec("INSERT INTO role_permissions VALUES ('sales_manager','properties')");
    });
    await check('membership revocation takes effect on the next query', async () => {
        await db.query('DELETE FROM shop_members WHERE user_id=$1',[ids.sales]);
        assert.equal(await asUser('sales', () => count('properties')),0);
        await db.query('INSERT INTO shop_members VALUES ($1,$2)',[ids.shop,ids.sales]);
    });
    await check('TRUNCATE cannot bypass RLS', async () => {
        await forbidden(() => asUser('admin', () => db.exec('TRUNCATE leads')));
        await forbidden(() => asUser('viewer', () => db.exec('TRUNCATE user_tasks')));
        await forbidden(() => asUser('viewer', () => db.exec('TRUNCATE storage.objects')));
    });
    await check('browser cannot retrieve shop integration tokens; identity reads remain available', async () => {
        await forbidden(() => asUser('admin', () => db.exec('SELECT facebook_page_access_token FROM shops')));
        assert.equal((await asUser('admin', () => db.query('SELECT id,user_id FROM shops'))).rows.length,1);
    });
    await check('app storage rejects browser upload, delete and cross-bucket update', async () => {
        await forbidden(() => asUser('viewer', () => db.exec("INSERT INTO storage.objects VALUES ('bad.png','products')")));
        assert.equal((await asUser('sales', () => db.query("DELETE FROM storage.objects WHERE bucket_id='property-images' RETURNING name"))).rows.length,0);
        await forbidden(() => asUser('admin', () => db.exec("UPDATE storage.objects SET bucket_id='products' WHERE bucket_id='other-bucket'")));
        assert.equal(await asUser('viewer', () => count('storage.objects'),'anon'),1);
    });
    await check('service_role retains API writes after migration', async () => {
        await asUser('admin', async () => {
            for (const table of ['leads','surveys','survey_responses','marketing_channels','channel_contracts']) {
                await db.query(`INSERT INTO ${table} VALUES ($1,$2)`,[randomUUID(),ids.shop]);
            }
            await db.exec("INSERT INTO storage.objects VALUES ('allowed.png','products')");
        },'service_role');
    });
    await check('viewer personal task edits remain permitted, but never another user task', async () => {
        await asUser('viewer', () => db.query('INSERT INTO user_tasks VALUES ($1,$2,$3)',[randomUUID(),ids.viewer,ids.shop]));
        await forbidden(() => asUser('viewer', () => db.query('INSERT INTO user_tasks VALUES ($1,$2,$3)',[randomUUID(),ids.sales,ids.shop])));
        await forbidden(() => asUser('viewer', () => db.query('INSERT INTO user_tasks VALUES ($1,$2,$3)',[randomUUID(),ids.viewer,ids.otherShop])));
    });
    await check('personal preferences and profiles retain self access only', async () => {
        await asUser('viewer', () => db.query('INSERT INTO user_dashboard_prefs VALUES ($1,$2)',[ids.viewer,ids.shop]));
        await forbidden(() => asUser('viewer', () => db.query('INSERT INTO user_dashboard_prefs VALUES ($1,$2)',[ids.sales,ids.shop])));
        await asUser('viewer', () => db.query('INSERT INTO user_profiles VALUES ($1,$2)',[ids.viewer,'Fixture']));
        await forbidden(() => asUser('viewer', () => db.query('INSERT INTO user_profiles VALUES ($1,$2)',[ids.sales,'Fixture'])));
    });
    console.log(`RBAC: ${checks} checks passed (disposable PostgreSQL)`);
} finally { await db.close(); }

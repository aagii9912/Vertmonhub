import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const db = new PGlite();
try {
    await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
        CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY); CREATE TABLE shops(id uuid PRIMARY KEY); CREATE TABLE projects(id uuid PRIMARY KEY, shop_id uuid REFERENCES shops(id));`);
    const migration = await readFile('supabase/migrations/20260929120000_newsletter_design.sql', 'utf8');
    await db.exec(migration); await db.exec(migration);
    for (const table of ['newsletters', 'newsletter_settings', 'newsletter_project_settings']) {
        const row = (await db.query(`SELECT relrowsecurity, has_table_privilege('authenticated','${table}','SELECT') AS can_read, has_table_privilege('authenticated','${table}','INSERT') AS can_write FROM pg_class WHERE oid='${table}'::regclass`)).rows[0];
        assert.deepEqual(row, { relrowsecurity: true, can_read: false, can_write: false });
    }
    await db.exec(`INSERT INTO auth.users VALUES ('00000000-0000-4000-8000-000000000001'); INSERT INTO shops VALUES ('00000000-0000-4000-8000-000000000002');
        INSERT INTO newsletters(id,shop_id,subject,body,created_by) VALUES ('00000000-0000-4000-8000-000000000003','00000000-0000-4000-8000-000000000002','Title','Body','00000000-0000-4000-8000-000000000001');`);
    assert.equal((await db.query('SELECT design FROM newsletters')).rows[0].design, null);
    await db.query('UPDATE newsletters SET design=$1', [JSON.stringify({ layout: 'newsletter' })]);
    await assert.rejects(db.query('UPDATE newsletters SET design=$1', ['[]']), error => error.code === '23514');
    console.log('Newsletter migration passed: standalone setup, repeat application, legacy drafts, design constraint and RLS.');
} finally { await db.close(); }

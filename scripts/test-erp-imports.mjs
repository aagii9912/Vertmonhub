import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

const db = new PGlite();
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
try {
    await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
      CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY);
      CREATE TABLE shops(id uuid PRIMARY KEY); CREATE TABLE roles(id uuid PRIMARY KEY, name text);
      CREATE TABLE role_permissions(role_id uuid REFERENCES roles, module text, UNIQUE(role_id,module));
      INSERT INTO shops VALUES ('${id(1)}'), ('${id(2)}'); INSERT INTO auth.users VALUES ('${id(3)}');
      INSERT INTO roles VALUES ('${id(4)}','sales_manager'), ('${id(5)}','marketing');`);
    const migration = await readFile('supabase/migrations/20260929130000_erp_imports.sql', 'utf8');
    await db.exec(migration); await db.exec(migration);
    const commit = (importId, previous, hash = 'hash', date = '2026-09-22') => db.query('SELECT commit_erp_import($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) AS id', [importId, id(1), 'ERP', date, 'export.csv', hash, id(3), previous, '[]', '{}']);
    assert.equal((await commit(id(10), null)).rows[0].id, id(10));
    assert.equal((await commit(id(10), null)).rows[0].id, id(10));
    assert.equal((await commit(id(11), id(10))).rows[0].id, id(10));
    await assert.rejects(commit(id(12), null, 'new'), e => e.code === '40001');
    await assert.rejects(commit(id(12), id(10), 'new', '2026-09-21'), e => e.code === '23514');
    assert.equal((await commit(id(12), id(10), 'new', '2026-09-29')).rows[0].id, id(12));
    await assert.rejects(commit(id(10), id(12), 'different'), e => e.code === '23514');
    const history = (await db.query('SELECT id,previous_id FROM erp_imports ORDER BY sequence')).rows;
    assert.deepEqual(history, [{ id: id(10), previous_id: null }, { id: id(12), previous_id: id(10) }]);
    for (const table of ['erp_imports']) {
        const rights = (await db.query(`SELECT has_table_privilege('authenticated','${table}','SELECT') AS browser_read, has_table_privilege('authenticated','${table}','INSERT') AS browser_write, relrowsecurity FROM pg_class WHERE oid='${table}'::regclass`)).rows[0];
        assert.deepEqual(rights, { browser_read: false, browser_write: false, relrowsecurity: true });
    }
    assert.equal((await db.query("SELECT has_function_privilege('authenticated','commit_erp_import(uuid,uuid,text,date,text,text,uuid,uuid,jsonb,jsonb)','EXECUTE') AS allowed")).rows[0].allowed, false);
    assert.deepEqual((await db.query('SELECT module FROM role_permissions WHERE role_id=$1', [id(4)])).rows, [{ module: 'erp-imports' }]);
    assert.equal((await db.query('SELECT * FROM role_permissions WHERE role_id=$1', [id(5)])).rows.length, 0);
    console.log('ERP SQL passed: immutable history, retry dedupe, stale preview rejection, chronological imports, RLS, RPC permissions.');
} finally { await db.close(); }

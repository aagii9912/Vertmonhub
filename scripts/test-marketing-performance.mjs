import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

const db = new PGlite();
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
try {
    await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
        CREATE TABLE shops (id uuid PRIMARY KEY);
        CREATE TABLE projects (id uuid PRIMARY KEY, shop_id uuid REFERENCES shops);
        CREATE TABLE marketing_campaigns (id uuid PRIMARY KEY, shop_id uuid REFERENCES shops, name text);
        CREATE TABLE marketing_spend_entries (id uuid PRIMARY KEY, shop_id uuid REFERENCES shops);
        CREATE TABLE leads (id uuid PRIMARY KEY, shop_id uuid REFERENCES shops, project_id uuid REFERENCES projects, sales_manager_name text, facebook_campaign_id text);
        INSERT INTO shops VALUES ('${id(1)}'), ('${id(2)}');
        INSERT INTO projects VALUES ('${id(3)}','${id(1)}'), ('${id(4)}','${id(2)}');
        INSERT INTO leads VALUES ('${id(5)}','${id(1)}','${id(3)}','Legacy Manager', NULL);`);
    const migration = await readFile('supabase/migrations/20260921120000_marketing_performance.sql', 'utf8');
    await db.exec(migration);
    await db.exec(migration);
    assert.equal((await db.query('SELECT sales_handoff_at FROM leads')).rows[0].sales_handoff_at, null);
    await db.query('INSERT INTO marketing_campaigns(id,shop_id,project_id) VALUES ($1,$2,$3)', [id(6), id(1), id(3)]);
    await assert.rejects(db.query('INSERT INTO marketing_campaigns(id,shop_id,project_id) VALUES ($1,$2,$3)', [id(7), id(1), id(4)]), e => e.code === '23514');
    await db.query('UPDATE leads SET marketing_campaign_id=$1 WHERE id=$2', [id(6), id(5)]);
    await assert.rejects(db.query('UPDATE marketing_campaigns SET project_id=$1 WHERE id=$2', [null, id(6)]), e => e.code === '23514');
    await assert.rejects(db.query('INSERT INTO leads(id,shop_id,project_id,marketing_campaign_id) VALUES ($1,$2,$3,$4)', [id(8), id(2), id(4), id(6)]), e => e.code === '23514');
    await assert.rejects(db.query('INSERT INTO marketing_targets(shop_id,project_id,marketing_owner_name,month,lead_target,deal_target,budget) VALUES ($1,$2,$3,$4,1,1,1)', [id(1), id(4), 'Owner', '2026-09-01']), e => e.code === '23514');
    await db.query('UPDATE leads SET sales_handoff_at=$1 WHERE id=$2', ['2020-01-01', id(5)]);
    const first = (await db.query('SELECT sales_handoff_at::text AS stamp FROM leads WHERE id=$1', [id(5)])).rows[0].stamp;
    assert.ok(!first.startsWith('2020'));
    await db.query('UPDATE leads SET sales_manager_name=$1,sales_handoff_at=NULL WHERE id=$2', ['New Manager', id(5)]);
    assert.equal((await db.query('SELECT sales_handoff_at::text AS stamp FROM leads WHERE id=$1', [id(5)])).rows[0].stamp, first);
    await db.query('INSERT INTO leads(id,shop_id,project_id,sales_manager_name) VALUES ($1,$2,$3,$4)', [id(9), id(1), id(3), 'New Manager']);
    assert.ok((await db.query('SELECT sales_handoff_at FROM leads WHERE id=$1', [id(9)])).rows[0].sales_handoff_at);
    await db.query('INSERT INTO leads(id,shop_id,project_id) VALUES ($1,$2,$3)', [id(10), id(1), id(3)]);
    await db.query('UPDATE leads SET sales_manager_name=$1 WHERE id=$2', ['Claim Manager', id(10)]);
    assert.ok((await db.query('SELECT sales_handoff_at FROM leads WHERE id=$1', [id(10)])).rows[0].sales_handoff_at);
    const rights = (await db.query("SELECT has_table_privilege('authenticated','marketing_targets','INSERT') AS browser_write, relrowsecurity FROM pg_class WHERE oid='marketing_targets'::regclass")).rows[0];
    assert.deepEqual(rights, { browser_write: false, relrowsecurity: true });
    await db.query("UPDATE marketing_campaigns SET external_campaign_id='12345', marketing_owner_name='Owner', channel='meta_ads' WHERE id=$1", [id(6)]);
    await db.query('INSERT INTO leads(id,shop_id,facebook_campaign_id) VALUES ($1,$2,$3)', [id(11), id(1), '12345']);
    assert.deepEqual((await db.query('SELECT project_id,marketing_campaign_id,marketing_owner_name,marketing_channel FROM leads WHERE id=$1', [id(11)])).rows[0], {
        project_id: id(3), marketing_campaign_id: id(6), marketing_owner_name: 'Owner', marketing_channel: 'meta_ads',
    });
    await db.query('INSERT INTO leads(id,shop_id,facebook_campaign_id) VALUES ($1,$2,$3)', [id(12), id(2), '12345']);
    assert.equal((await db.query('SELECT marketing_campaign_id FROM leads WHERE id=$1', [id(12)])).rows[0].marketing_campaign_id, null);
    console.log('Marketing SQL checks passed: rerun, no historical backfill, shop/project isolation, immutable first handoff, assignment paths and RLS.');
} finally { await db.close(); }

import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const db = new PGlite();
const shop = '00000000-0000-4000-8000-000000000001', other = '00000000-0000-4000-8000-000000000002';
try {
    await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role; CREATE TABLE shops(id uuid PRIMARY KEY, facebook_ad_account_id text);
        INSERT INTO shops VALUES ('${shop}','act_123'), ('${other}','456');`);
    const sql = await readFile('supabase/migrations/20260921140000_meta_daily_spend.sql', 'utf8');
    await db.exec(sql); await db.exec(sql);
    const row = { campaign_id: '789', campaign_name: 'Test', spent_at: '2026-09-10', native_amount: '12.50' };
    let tick = 0;
    async function save(rows, { rate = 3500, replace = false, account = 'act_123', tenant = shop, started = `2026-09-21T00:${String(tick++).padStart(2, '0')}:00Z` } = {}) {
        return db.query('SELECT save_meta_daily_spend($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)', [tenant, account, '2026-09-10','2026-09-11','USD','Asia/Ulaanbaatar',rate,replace,started,JSON.stringify(rows)]);
    }
    await save([row]); await save([row]);
    let rows = (await db.query('SELECT native_amount::text,amount_mnt::text FROM meta_daily_spend')).rows;
    assert.equal(rows.length, 1); assert.equal(rows[0].amount_mnt, '43750');
    assert.equal((await db.query('SELECT count(*) FROM meta_spend_coverage')).rows[0].count, 2);
    await save([{ ...row, native_amount: '10' }], { rate: 3600 });
    assert.equal((await db.query('SELECT amount_mnt::text FROM meta_daily_spend')).rows[0].amount_mnt, '35000');
    await save([{ ...row, native_amount: '10' }], { rate: 3600, replace: true });
    assert.equal((await db.query('SELECT amount_mnt::text FROM meta_daily_spend')).rows[0].amount_mnt, '36000');
    await assert.rejects(save([row], { started: '2026-09-20T00:00:00Z' }), e => e.code === '40001');
    await assert.rejects(save([{ ...row, spent_at: '2026-08-01' }]), e => e.code === '23514');
    await assert.rejects(save([row,row]), e => e.code === '21000');
    assert.equal((await db.query('SELECT amount_mnt::text FROM meta_daily_spend')).rows[0].amount_mnt, '36000');
    await assert.rejects(save([row], { account: 'act_456' }), e => e.code === '23514');
    await save([row], { account: 'act_456', tenant: other, rate: null });
    assert.equal((await db.query('SELECT amount_mnt FROM meta_daily_spend WHERE shop_id=$1', [other])).rows[0].amount_mnt, null);
    await save([]);
    assert.equal((await db.query('SELECT count(*) FROM meta_daily_spend WHERE shop_id=$1', [shop])).rows[0].count, 0);
    assert.equal((await db.query('SELECT count(*) FROM meta_daily_spend WHERE shop_id=$1', [other])).rows[0].count, 1);
    await db.query('SELECT record_meta_spend_failure($1,$2,$3,$4)', [shop,'act_123','2026-09-22T00:00:00Z','Meta unavailable']);
    const state = (await db.query('SELECT last_success_at,last_error FROM meta_spend_sync WHERE shop_id=$1', [shop])).rows[0];
    assert.ok(state.last_success_at); assert.equal(state.last_error, 'Meta unavailable');
    await db.query('SELECT record_meta_spend_failure($1,$2,$3,$4)', [shop,'act_123','2026-09-20T00:00:00Z','Old failure']);
    assert.equal((await db.query('SELECT last_error FROM meta_spend_sync WHERE shop_id=$1',[shop])).rows[0].last_error, 'Meta unavailable');
    for (const table of ['meta_daily_spend','meta_spend_sync','meta_spend_coverage']) {
        const rights = (await db.query(`SELECT has_table_privilege('authenticated','${table}','INSERT') AS can_write, relrowsecurity FROM pg_class WHERE oid='${table}'::regclass`)).rows[0];
        assert.deepEqual(rights, { can_write: false, relrowsecurity: true });
    }
    assert.equal((await db.query("SELECT has_function_privilege('authenticated','save_meta_daily_spend(uuid,text,date,date,text,text,numeric,boolean,timestamptz,jsonb)','EXECUTE') AS allowed")).rows[0].allowed, false);
    console.log('Meta SQL checks passed: rerunnable, idempotent, atomic rollback, currency/rate history, corrections, zero days, shop/account isolation, stale writes and service-role-only access.');
} finally { await db.close(); }

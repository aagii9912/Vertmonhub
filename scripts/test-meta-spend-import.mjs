import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';

const db = new PGlite();
const shop = randomUUID(), other = randomUUID(), user = randomUUID();
const row = { campaign_id: '987654321098765432', campaign_name: 'Elysium', spent_at: '2026-09-01', native_amount: '12.50' };
async function run(rows = [row], { id = randomUUID(), tenant = shop, account = 'act_123', rate = 3500, currency = 'USD', timezone = 'Asia/Ulaanbaatar', commit = false, expected = null } = {}) {
    const result = await db.query('SELECT import_meta_daily_spend($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) AS result',
        [tenant,user,id,'meta.csv',account,currency,timezone,rate,JSON.stringify(rows),commit,expected]);
    return result.rows[0].result;
}
async function commit(rows = [row], opts = {}) {
    const id = opts.id ?? randomUUID();
    const preview = await run(rows, { ...opts, id });
    return run(rows, { ...opts, id, commit: true, expected: preview.fingerprint });
}
async function ledger(tenant = shop) { return (await db.query('SELECT campaign_id,spent_at::text,native_amount::text,amount_mnt::text,ingestion_source,import_id FROM meta_daily_spend WHERE shop_id=$1 ORDER BY spent_at,campaign_id', [tenant])).rows; }
async function api(rows) {
    return db.query('SELECT save_meta_daily_spend($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)', [shop,'act_123','2026-09-01','2026-09-02','USD','Asia/Ulaanbaatar',3500,false,new Date().toISOString(),JSON.stringify(rows)]);
}
try {
    await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
        CREATE TABLE shops(id uuid PRIMARY KEY, facebook_ad_account_id text);
        CREATE TABLE marketing_spend_entries(shop_id uuid,spent_at date,channel text,deleted_at timestamptz);
        INSERT INTO shops VALUES('${shop}',NULL),('${other}',NULL);`);
    await db.exec(await readFile('supabase/migrations/20260921140000_meta_daily_spend.sql', 'utf8'));
    const migration = await readFile('supabase/migrations/20260928153000_meta_spend_file_import.sql', 'utf8');
    await db.exec(migration); await db.exec(migration);

    const id = randomUUID();
    const preview = await run([row], { id });
    assert.equal(preview.added, 1); assert.equal(preview.savedMnt, '43750');
    assert.equal((await ledger()).length, 0);
    assert.equal((await db.query('SELECT count(*) FROM meta_spend_imports')).rows[0].count, 0);
    await run([row], { id, commit: true, expected: preview.fingerprint });
    assert.deepEqual((await ledger())[0], { campaign_id: row.campaign_id, spent_at: row.spent_at, native_amount: '12.500000', amount_mnt: '43750', ingestion_source: 'file', import_id: id });
    assert.equal((await db.query('SELECT count(*) FROM meta_spend_coverage')).rows[0].count, 0);
    assert.equal((await db.query('SELECT count(*) FROM meta_spend_sync')).rows[0].count, 0);
    assert.equal((await run()).unchanged, 1);
    await commit(); assert.equal((await ledger()).length, 1);

    const second = { ...row, campaign_id: '111', spent_at: '2026-09-02', native_amount: '1' };
    await commit([second]);
    const corrected = { ...row, native_amount: '8' };
    assert.equal((await run([corrected])).updated, 1);
    await commit([corrected]);
    assert.equal((await ledger()).length, 2); assert.equal((await ledger())[0].amount_mnt, '28000');
    // Lost-response retry returns the original receipt, without rolling back a later correction.
    assert.equal((await run([row], { id, commit: true, expected: preview.fingerprint })).id, id);
    assert.equal((await ledger())[0].amount_mnt, '28000');
    await assert.rejects(run([corrected], { id, commit: true }), e => e.code === '40001');
    await assert.rejects(run([row], { id, tenant: other }), e => e.code === '40001');
    const stale = await run([row]);
    await commit([{ ...row, native_amount: '9' }]);
    await assert.rejects(run([row], { commit: true, expected: stale.fingerprint }), e => e.code === '40001');

    const before = await ledger();
    for (const rows of [[row,row], [row,{ ...second, native_amount: '-1' }], [{ ...row, spent_at: '2099-01-01' }]])
        await assert.rejects(run(rows, { commit: true }), e => e.code === '23514');
    await assert.rejects(run([row], { currency: 'EUR' }), e => e.code === '23514');
    await assert.rejects(run([row], { timezone: 'UTC' }), e => e.code === '23514');
    assert.deepEqual(await ledger(), before);
    await db.query('INSERT INTO marketing_spend_entries VALUES($1,$2,$3,NULL)', [shop,'2026-09-01','facebook_ads']);
    assert.equal((await run()).manualOverlap, 1);
    await commit([row], { tenant: other });
    assert.equal((await ledger(other)).length, 1);
    assert.equal((await ledger())[0].amount_mnt, '31500');

    // API and files serialize under the same lock and retain a single canonical row.
    await db.query('UPDATE shops SET facebook_ad_account_id=$1 WHERE id=$2', ['act_123',shop]);
    const preApi = await run([row]);
    await api([{ ...row, native_amount: '10' }]);
    assert.equal((await ledger()).length, 1);
    assert.equal((await ledger())[0].ingestion_source, 'api'); assert.equal((await ledger())[0].import_id, null);
    await assert.rejects(run([row], { commit: true, expected: preApi.fingerprint }), e => e.code === '40001');
    assert.equal((await run([row])).skippedApi, 1);
    await commit([row]); assert.equal((await ledger())[0].amount_mnt, '35000');
    await api([]);
    assert.equal((await run([row, second])).skippedApi, 2);
    await commit([row,second]); assert.equal((await ledger()).length, 0); // Do not resurrect API-confirmed zero days.
    await commit([row], { account: 'act_999' });
    assert.equal((await ledger()).length, 1); // Other account's coverage cannot suppress this file.

    const rights = (await db.query("SELECT has_table_privilege('authenticated','meta_spend_imports','INSERT') AS can_write, relrowsecurity FROM pg_class WHERE oid='meta_spend_imports'::regclass")).rows[0];
    assert.deepEqual(rights, { can_write: false, relrowsecurity: true });
    assert.equal((await db.query("SELECT has_function_privilege('authenticated','import_meta_daily_spend(uuid,uuid,uuid,text,text,text,text,numeric,jsonb,boolean,text)','EXECUTE') AS allowed")).rows[0].allowed, false);
    assert.equal((await db.query("SELECT has_function_privilege('service_role','import_meta_daily_spend(uuid,uuid,uuid,text,text,text,text,numeric,jsonb,boolean,text)','EXECUTE') AS allowed")).rows[0].allowed, true);
    console.log('Meta file SQL passed: preview, no API configuration, exact FX, repeat/retry safety, corrections, partial-file preservation, stale previews, validation rollback, tenant isolation, API precedence including zero days, and RLS/RPC grants.');
} finally { await db.close(); }

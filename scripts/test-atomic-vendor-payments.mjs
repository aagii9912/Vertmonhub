/** Disposable PostgreSQL check. Never connects to DATABASE_URL or any live DB.
 * PGLITE_MODULE=/tmp/vertmon-payment-sql-check/node_modules/@electric-sql/pglite/dist/index.js node scripts/test-atomic-vendor-payments.mjs
 */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
const { PGlite } = await import(process.env.PGLITE_MODULE || '@electric-sql/pglite');
const db = new PGlite();
const sql = async file => readFile(new URL(`../supabase/migrations/${file}`, import.meta.url), 'utf8');
const table = (source, name) => source.match(new RegExp(`CREATE TABLE IF NOT EXISTS ${name} \\([\\s\\S]*?\\n\\);`))[0];
const migration = await sql('20260913170000_atomic_vendor_bill_payments.sql');
const shop = randomUUID(), otherShop = randomUUID(), bill = randomUUID(), otherBill = randomUUID();
let count = 0;
async function check(name, fn) { await fn(); count++; console.log(`✓ ${name}`); }
const pay = (payload, requestId = randomUUID(), billId = bill, shopId = shop) => db.query(
    'SELECT pay_vendor_bill_atomic($1::uuid, $2::uuid, $3::uuid, $4::jsonb) AS bill',
    [shopId, billId, requestId, JSON.stringify(payload)],
).then(result => result.rows[0].bill);
const snapshot = async () => (await db.query(`SELECT
    (SELECT paid_amount::float8 FROM vendor_bills WHERE id=$1) AS paid,
    (SELECT count(*)::int FROM finance_transactions) AS transactions,
    (SELECT count(*)::int FROM finance_audit_log) AS audits`, [bill])).rows[0];
try {
    await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
        CREATE TABLE shops (id uuid PRIMARY KEY); CREATE TABLE projects (id uuid PRIMARY KEY);
        CREATE TABLE vendors (id uuid PRIMARY KEY); CREATE TABLE chart_of_accounts (id uuid PRIMARY KEY);
        CREATE TABLE property_contracts (id uuid PRIMARY KEY); CREATE TABLE payment_schedules (id uuid PRIMARY KEY);`);
    await db.exec(table(await sql('20260608180000_erp_procurement.sql'), 'vendor_bills'));
    await db.exec(table(await sql('20260608170000_erp_finance_core.sql'), 'finance_transactions'));
    await db.exec(table(await sql('20260608200000_erp_finance_reports.sql'), 'finance_audit_log'));
    await db.query('INSERT INTO shops VALUES ($1),($2)', [shop, otherShop]);
    await db.query('INSERT INTO vendor_bills (id,shop_id,total_amount,paid_amount) VALUES ($1,$2,1000,100),($3,$2,1000,0)', [bill, shop, otherBill]);
    await db.exec(migration);
    await db.exec(migration);
    const payload = { amount: 100, method: 'bank', paid_date: '2026-09-13' };
    const request = randomUUID();
    let first;

    await check('additive rerunnable migration restricts execution to service_role', async () => {
        const { rows } = await db.query("SELECT role, has_function_privilege(role,'pay_vendor_bill_atomic(uuid,uuid,uuid,jsonb)','EXECUTE') AS allowed FROM (VALUES ('anon'),('authenticated'),('service_role')) AS roles(role)");
        assert.deepEqual(rows, [{ role: 'anon', allowed: false }, { role: 'authenticated', allowed: false }, { role: 'service_role', allowed: true }]);
        assert.deepEqual(await snapshot(), { paid: 100, transactions: 0, audits: 0 });
    });
    await check('payment commits balance, dated ledger and audit together, preserving prior balance', async () => {
        first = await pay(payload, request);
        assert.equal(Number(first.paid_amount), 200);
        assert.equal(first.status, 'partial');
        assert.deepEqual(await snapshot(), { paid: 200, transactions: 1, audits: 1 });
        const txn = (await db.query('SELECT amount::float8 AS amount, txn_date::text AS date, type, vendor_bill_id FROM finance_transactions')).rows[0];
        assert.deepEqual(txn, { amount: 100, date: '2026-09-13', type: 'disbursement', vendor_bill_id: bill });
    });
    await check('same request replay commits once and rejects changed amount/bill', async () => {
        assert.equal((await pay(payload, request)).transaction_id, first.transaction_id);
        await assert.rejects(pay({ ...payload, amount: 101 }, request), e => e.code === '23505');
        await assert.rejects(pay(payload, request, otherBill), e => e.code === '23505');
        assert.deepEqual(await snapshot(), { paid: 200, transactions: 1, audits: 1 });
    });
    await check('ledger failure cannot leave the bill paid; same request retry applies once', async () => {
        const retryId = randomUUID();
        await db.exec('ALTER TABLE finance_transactions ADD CONSTRAINT fail_receipt CHECK (amount < 200) NOT VALID');
        await assert.rejects(pay({ ...payload, amount: 200 }, retryId), e => e.code === '23514');
        assert.deepEqual(await snapshot(), { paid: 200, transactions: 1, audits: 1 });
        await db.exec('ALTER TABLE finance_transactions DROP CONSTRAINT fail_receipt');
        await pay({ ...payload, amount: 200 }, retryId);
        await pay({ ...payload, amount: 200 }, retryId);
        assert.deepEqual(await snapshot(), { paid: 400, transactions: 2, audits: 2 });
    });
    await check('bill update and audit failures each roll back every financial write', async () => {
        await db.exec('ALTER TABLE vendor_bills ADD CONSTRAINT fail_bill CHECK (paid_amount < 500) NOT VALID');
        await assert.rejects(pay(payload), e => e.code === '23514');
        await db.exec('ALTER TABLE vendor_bills DROP CONSTRAINT fail_bill');
        assert.deepEqual(await snapshot(), { paid: 400, transactions: 2, audits: 2 });
        await db.exec('ALTER TABLE finance_audit_log ADD CONSTRAINT fail_audit CHECK (amount < 100) NOT VALID');
        await assert.rejects(pay(payload), e => e.code === '23514');
        await db.exec('ALTER TABLE finance_audit_log DROP CONSTRAINT fail_audit');
        assert.deepEqual(await snapshot(), { paid: 400, transactions: 2, audits: 2 });
    });
    await check('tenant mismatch, cancelled bill, invalid inputs and overpayment do not write', async () => {
        await assert.rejects(pay(payload, randomUUID(), bill, otherShop), e => e.code === 'P0002');
        await db.query("UPDATE vendor_bills SET status='cancelled' WHERE id=$1", [bill]);
        await assert.rejects(pay(payload), e => e.code === '22023');
        await db.query("UPDATE vendor_bills SET status='partial' WHERE id=$1", [bill]);
        for (const bad of [{ amount: 0 }, { amount: -1 }, { amount: 601 }, { amount: 1.001 }, { amount: 'NaN' }, { paid_date: 'today' }, { method: 'invalid' }, { shop_id: otherShop }]) {
            await assert.rejects(pay({ ...payload, ...bad }), e => e.code === '22023');
        }
        await assert.rejects(pay(payload, null), e => e.code === '22023');
        assert.deepEqual(await snapshot(), { paid: 400, transactions: 2, audits: 2 });
    });
    await check('separate partial payments accumulate; final retry stays safe even when bill is paid', async () => {
        await pay({ amount: 200, method: 'barter' });
        const lastId = randomUUID();
        const lastPayload = { amount: 400, method: 'bank' };
        await pay(lastPayload, lastId);
        assert.equal((await pay(lastPayload, lastId)).status, 'paid');
        await assert.rejects(pay({ amount: 1, method: 'cash' }), e => e.code === '22023');
        assert.deepEqual(await snapshot(), { paid: 1000, transactions: 4, audits: 4 });
        const dates = (await db.query("SELECT txn_date::text AS date, (now() AT TIME ZONE 'Asia/Ulaanbaatar')::date::text AS today FROM finance_transactions WHERE client_request_id=$1", [lastId])).rows[0];
        assert.equal(dates.date, dates.today);
    });
    console.log(`${count} vendor payment checks passed (disposable in-memory PostgreSQL, no live writes).`);
} finally { await db.close(); }

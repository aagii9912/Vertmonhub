/**
 * Disposable PostgreSQL migration check; NEVER uses DATABASE_URL or a live database.
 * npm install --prefix /tmp/vertmon-payment-sql-check --no-save @electric-sql/pglite@0.3.14
 * PGLITE_MODULE=/tmp/vertmon-payment-sql-check/node_modules/@electric-sql/pglite/dist/index.js node scripts/test-atomic-payments.mjs
 */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
const { PGlite } = await import(process.env.PGLITE_MODULE || '@electric-sql/pglite');
const db = new PGlite();
const migration = await readFile(new URL('../supabase/migrations/20260913160000_atomic_contract_payments.sql', import.meta.url), 'utf8');
const paymentSchema = await readFile(new URL('../supabase/migrations/20260416_customer_service_tables.sql', import.meta.url), 'utf8');
const financeSchema = await readFile(new URL('../supabase/migrations/20260608170000_erp_finance_core.sql', import.meta.url), 'utf8');
const shop = randomUUID();
const contract = randomUUID();
const otherContract = randomUUID();
let tests = 0;
async function check(name, fn) { await fn(); tests++; console.log(`✓ ${name}`); }
const mutate = (paymentId, payload, requestId = null, contractId = contract, shopId = shop) => db.query(
    'SELECT mutate_contract_payment($1::uuid, $2::uuid, $3::uuid, $4::jsonb, $5::uuid) AS payment',
    [shopId, contractId, paymentId, JSON.stringify(payload), requestId],
).then(r => r.rows[0].payment);
const totals = async () => (await db.query('SELECT paid_amount::float8 AS paid, balance::float8 AS balance FROM property_contracts WHERE id = $1', [contract])).rows[0];
const receipts = async () => (await db.query('SELECT amount::float8 AS amount, txn_date::text AS date, method, receipt_kind FROM finance_transactions ORDER BY created_at, id')).rows;

try {
    await db.exec(`
        CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
        CREATE TABLE shops (id uuid PRIMARY KEY);
        CREATE TABLE projects (id uuid PRIMARY KEY);
        CREATE TABLE chart_of_accounts (id uuid PRIMARY KEY);
        CREATE TABLE property_contracts (id uuid PRIMARY KEY, shop_id uuid REFERENCES shops,
            total_price numeric, paid_amount numeric, balance numeric, contract_status text,
            project_id uuid REFERENCES projects, deleted_at timestamptz, updated_at timestamptz);
    `);
    await db.exec(paymentSchema.match(/CREATE TABLE IF NOT EXISTS payment_schedules \([\s\S]*?\n\);/)[0]);
    await db.exec(financeSchema.match(/CREATE TABLE IF NOT EXISTS finance_transactions \([\s\S]*?\n\);/)[0]);
    await db.exec('GRANT ALL ON payment_schedules TO authenticated');
    await db.query('INSERT INTO shops VALUES ($1)', [shop]);
    await db.query("INSERT INTO property_contracts (id, shop_id, total_price, paid_amount, balance, contract_status) VALUES ($1,$2,2000,500,1500,'active'),($3,$2,2000,0,2000,'active')", [contract, shop, otherContract]);
    await db.exec(migration);
    await db.exec(migration);
    const payload = { due_date: '2026-09-13', amount: 500, paid_amount: 100, paid_date: '2026-09-12', payment_method: 'bank_transfer', receipt_kind: 'advance', label: 'Урьдчилгаа' };
    const requestId = randomUUID();
    let payment;

    await check('migration is additive, rerunnable and executable only by service_role', async () => {
        const { rows } = await db.query("SELECT role, has_function_privilege(role, 'mutate_contract_payment(uuid,uuid,uuid,jsonb,uuid)', 'EXECUTE') AS allowed FROM (VALUES ('anon'),('authenticated'),('service_role')) AS r(role)");
        assert.deepEqual(rows, [{ role: 'anon', allowed: false }, { role: 'authenticated', allowed: false }, { role: 'service_role', allowed: true }]);
        const table = (await db.query("SELECT has_table_privilege('authenticated', 'payment_schedules', 'UPDATE') AS write, has_table_privilege('authenticated', 'payment_schedules', 'SELECT') AS read")).rows[0];
        assert.deepEqual(table, { write: false, read: true });
        assert.deepEqual(await totals(), { paid: 500, balance: 1500 });
    });
    await check('create posts one dated advance receipt and preserves imported paid balance', async () => {
        payment = await mutate(null, payload, requestId);
        assert.equal(payment.status, 'partial');
        assert.equal(payment.receipt_kind, 'advance');
        assert.deepEqual(await totals(), { paid: 600, balance: 1400 });
        assert.deepEqual(await receipts(), [{ amount: 100, date: '2026-09-12', method: 'bank', receipt_kind: 'advance' }]);
    });
    await check('creation replay cannot duplicate receipts or accept changed data/contract', async () => {
        assert.equal((await mutate(null, payload, requestId)).id, payment.id);
        assert.equal((await receipts()).length, 1);
        await assert.rejects(mutate(null, { ...payload, amount: 600 }, requestId), e => e.code === '23505');
        await assert.rejects(mutate(null, payload, requestId, otherContract), e => e.code === '23505');
    });
    await check('update always posts delta, replay is idempotent and omitted date means new UB day', async () => {
        await mutate(payment.id, { paid_amount: 150 });
        assert.deepEqual(await totals(), { paid: 650, balance: 1350 });
        const rows = await receipts();
        assert.equal(rows.length, 2);
        const today = (await db.query("SELECT (now() AT TIME ZONE 'Asia/Ulaanbaatar')::date::text AS date")).rows[0].date;
        assert.equal(rows.find(r => r.amount === 50).date, today);
        await mutate(payment.id, { paid_amount: 150 });
        assert.equal((await receipts()).length, 2);
    });
    await check('ledger insert failure rolls back schedule AND contract delta, retry applies once', async () => {
        await db.exec('ALTER TABLE finance_transactions ADD CONSTRAINT fail_test_receipt CHECK (amount < 150) NOT VALID');
        await assert.rejects(mutate(payment.id, { paid_amount: 350 }), e => e.code === '23514');
        assert.deepEqual(await totals(), { paid: 650, balance: 1350 });
        assert.equal(Number((await db.query('SELECT paid_amount FROM payment_schedules WHERE id=$1', [payment.id])).rows[0].paid_amount), 150);
        assert.equal((await receipts()).length, 2);
        await db.exec('ALTER TABLE finance_transactions DROP CONSTRAINT fail_test_receipt');
        await mutate(payment.id, { paid_amount: 350 });
        assert.equal((await receipts()).length, 3);
        assert.deepEqual(await totals(), { paid: 850, balance: 1150 });
    });
    await check('failed create leaves no schedule or receipt and same request can be retried', async () => {
        const id = randomUUID();
        await db.exec('ALTER TABLE finance_transactions ADD CONSTRAINT fail_test_receipt CHECK (amount < 100) NOT VALID');
        await assert.rejects(mutate(null, payload, id), e => e.code === '23514');
        assert.equal((await db.query('SELECT count(*)::int AS n FROM payment_schedules')).rows[0].n, 1);
        await db.exec('ALTER TABLE finance_transactions DROP CONSTRAINT fail_test_receipt');
        await mutate(null, payload, id);
        assert.equal((await db.query('SELECT count(*)::int AS n FROM payment_schedules')).rows[0].n, 2);
    });
    await check('contract update failure also rolls back the already inserted receipt', async () => {
        const before = await receipts();
        const balance = await totals();
        await db.exec('ALTER TABLE property_contracts ADD CONSTRAINT fail_test_balance CHECK (paid_amount < 1000) NOT VALID');
        await assert.rejects(mutate(payment.id, { paid_amount: 450 }), e => e.code === '23514');
        assert.deepEqual(await receipts(), before);
        assert.deepEqual(await totals(), balance);
        await db.exec('ALTER TABLE property_contracts DROP CONSTRAINT fail_test_balance');
    });
    await check('wrong shop/contract and deleted contracts cannot mutate payments', async () => {
        await assert.rejects(mutate(payment.id, { paid_amount: 400 }, null, contract, randomUUID()), e => e.code === 'P0002');
        await assert.rejects(mutate(payment.id, { paid_amount: 400 }, null, otherContract), e => e.code === 'P0002');
        await db.query('UPDATE property_contracts SET deleted_at=now() WHERE id=$1', [contract]);
        await assert.rejects(mutate(payment.id, { paid_amount: 400 }), e => e.code === 'P0002');
        await db.query('UPDATE property_contracts SET deleted_at=null WHERE id=$1', [contract]);
        await db.query("UPDATE property_contracts SET contract_status='cancelled' WHERE id=$1", [contract]);
        await assert.rejects(mutate(payment.id, { paid_amount: 400 }), e => e.code === '22023');
        await db.query("UPDATE property_contracts SET contract_status='active' WHERE id=$1", [contract]);
    });
    await check('negative corrections, misleading status and invalid classification fail without writes', async () => {
        const before = await receipts();
        await assert.rejects(mutate(payment.id, { paid_amount: 50 }), e => e.code === '22023');
        await assert.rejects(mutate(payment.id, { paid_amount: 501 }), e => e.code === '22023');
        await assert.rejects(mutate(payment.id, { paid_amount: 400, paid_date: 'infinity' }), e => e.code === '22023');
        await assert.rejects(mutate(payment.id, { due_date: 'today' }), e => e.code === '22023');
        await assert.rejects(mutate(payment.id, { status: 'paid' }), e => e.code === '22023');
        await assert.rejects(mutate(payment.id, { paid_amount: 400, receipt_kind: null }), e => e.code === '22023');
        await assert.rejects(mutate(payment.id, { paid_amount: 400, payment_method: null }), e => e.code === '22023');
        await assert.rejects(mutate(payment.id, { paid_date: '2026-01-01' }), e => e.code === '22023');
        await assert.rejects(mutate(payment.id, { shop_id: randomUUID() }), e => e.code === '22023');
        assert.deepEqual(await receipts(), before);
    });
    console.log(`${tests} atomic payment migration checks passed (disposable in-memory PostgreSQL, no live writes).`);
} finally { await db.close(); }

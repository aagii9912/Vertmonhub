// @vitest-environment node
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { planContractListImport, storedHubPaidRows, type ContractListContract, type ContractListUnit, type HubRow } from '../list-import';

const shop = '10000000-0000-4000-8000-000000000001';
const otherShop = '10000000-0000-4000-8000-000000000002';
const project = '20000000-0000-4000-8000-000000000001';
const otherProject = '20000000-0000-4000-8000-000000000002';
const actor = '30000000-0000-4000-8000-000000000001';
const contract = (n: number) => `40000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const HASH = 'a'.repeat(64);
const OTHER_HASH = 'b'.repeat(64);
const migrationFile = 'supabase/migrations/20261022140000_contract_list_import.sql';
const migration = readFileSync(migrationFile, 'utf8');
const SIGNATURE = 'import_contract_list(uuid,uuid,date,text,text,text,jsonb,jsonb,jsonb,boolean,uuid,text)';

function extract(file: string, pattern: RegExp) {
    const sql = readFileSync(file, 'utf8').match(pattern);
    if (!sql) throw new Error(`${file}: ${pattern} not found`);
    return sql[0];
}

/** scripts/apply-migrations.mjs-ийн оруулсны дараах шалгалт (файлыг ажиллуулахгүйгээр SQL-ийг нь уншина). */
function verifySql(version: string) {
    const text = readFileSync('scripts/apply-migrations.mjs', 'utf8');
    const match = text.match(new RegExp(`'${version}': \`([\\s\\S]*?)\`,`));
    if (!match) throw new Error(`VERIFY ${version} not found`);
    return match[1];
}

let db: PGlite;

interface CallArgs {
    shopId?: string; projectId?: string | null; reportDate?: string; fileName?: string | null; requestId?: string; planHash?: string;
    rows?: unknown; ops?: unknown; summary?: unknown; allowOlder?: boolean; actorId?: string | null; actorName?: string;
}
const call = (args: CallArgs = {}) => db.query<{ result: Record<string, unknown> }>(
    'SELECT public.import_contract_list($1,$2,$3::date,$4,$5,$6,$7::jsonb,$8::jsonb,$9::jsonb,$10,$11,$12) AS result',
    [
        args.shopId ?? shop, args.projectId === undefined ? project : args.projectId, args.reportDate ?? '2026-10-21',
        args.fileName === undefined ? 'Elysium HUB.xlsx' : args.fileName, args.requestId ?? 'req-1', args.planHash ?? HASH,
        JSON.stringify(args.rows ?? [{ 'Тоот': 16 }, { 'Тоот': 19 }]), JSON.stringify(args.ops ?? []),
        JSON.stringify(args.summary ?? { counts: { update: 0 } }), args.allowOlder ?? false,
        args.actorId === undefined ? actor : args.actorId, args.actorName ?? ' Номин ',
    ],
).then(r => r.rows[0].result);

const snapshot = async () => ({
    contracts: (await db.query(`SELECT id, contract_status, order_date::text, contract_date::text, total_price::float8 AS total_price,
        prepayment_due::float8 AS prepayment_due, paid_amount::float8 AS paid_amount, balance::float8 AS balance,
        overdue_amount::float8 AS overdue_amount, overdue_as_of::text, customer_name, customer_first_name, customer_last_name,
        payment_condition, unit_label FROM property_contracts ORDER BY id`)).rows,
    audit: (await db.query('SELECT entity_id, action, changes FROM data_audit_log ORDER BY created_at, entity_id')).rows,
    admin: (await db.query('SELECT action FROM admin_audit_log')).rows,
    imports: (await db.query('SELECT request_id, report_date::text FROM contract_list_imports ORDER BY created_at')).rows,
});

beforeEach(async () => {
    db = new PGlite();
    await db.exec(`
        CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
        CREATE TABLE shops (id uuid PRIMARY KEY);
        CREATE TABLE projects (id uuid PRIMARY KEY, shop_id uuid REFERENCES shops(id));
        CREATE FUNCTION get_user_shop_id() RETURNS uuid LANGUAGE sql STABLE AS 'SELECT NULL::uuid';
        CREATE FUNCTION update_property_timestamp() RETURNS trigger LANGUAGE plpgsql AS 'BEGIN NEW.updated_at = now(); RETURN NEW; END';
    `);
    // Бодит DDL: үндсэн хүснэгт + Excel-ийн баганууд + өргөсгөсөн текст + хожим нэмэгдсэн баганууд/шалгалтууд.
    await db.exec(extract('supabase/migrations/20260312100000_add_property_contracts_and_ai_docs.sql', /CREATE TABLE IF NOT EXISTS property_contracts \([\s\S]*?\n\);/));
    await db.exec(extract('supabase/migrations/20260415120000_extend_property_contracts.sql', /ALTER TABLE property_contracts[\s\S]*?;/));
    await db.exec(extract('supabase/migrations/20260504110000_widen_property_contracts_columns.sql', /ALTER TABLE property_contracts[\s\S]*?;/));
    await db.exec(`
        ALTER TABLE property_contracts ADD COLUMN lead_id uuid, ADD COLUMN customer_id uuid,
            ADD COLUMN project_id uuid REFERENCES projects(id) ON DELETE SET NULL, ADD COLUMN deleted_at timestamptz, ADD COLUMN notes text;
        ALTER TABLE property_contracts ADD CONSTRAINT chk_contracts_total_price_nonneg CHECK (total_price IS NULL OR total_price >= 0) NOT VALID;
        ALTER TABLE property_contracts ADD CONSTRAINT chk_contracts_paid_amount_nonneg CHECK (paid_amount IS NULL OR paid_amount >= 0) NOT VALID;
        CREATE TABLE contract_transfers (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), shop_id uuid NOT NULL, contract_id uuid NOT NULL);
        CREATE TABLE finance_transactions (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), shop_id uuid NOT NULL, contract_id uuid, amount numeric(18,2));
        CREATE TABLE data_audit_log (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), shop_id uuid, actor_id uuid, entity varchar(48) NOT NULL,
            entity_id text, action varchar(24) NOT NULL, changes jsonb DEFAULT '{}'::jsonb, created_at timestamptz NOT NULL DEFAULT clock_timestamp());
    `);
    await db.exec(extract('supabase/migrations/20260416_customer_service_tables.sql', /CREATE TABLE IF NOT EXISTS payment_schedules \([\s\S]*?\n\);/));
    await db.exec(readFileSync('supabase/migrations/20260608250000_admin_audit_log.sql', 'utf8'));
    await db.exec(readFileSync('supabase/migrations/20260624120000_add_property_units.sql', 'utf8'));
    await db.exec(`
        ALTER VIEW property_units_with_buyer SET (security_invoker = on);
        GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
        GRANT ALL ON shops, projects, property_contracts, payment_schedules, contract_transfers, finance_transactions, data_audit_log, admin_audit_log, property_units TO service_role;
        GRANT SELECT ON property_units_with_buyer TO anon, authenticated, service_role;
    `);
    await db.query('INSERT INTO shops VALUES ($1), ($2)', [shop, otherShop]);
    await db.query('INSERT INTO projects VALUES ($1, $2), ($3, $4)', [project, shop, otherProject, otherShop]);
    await db.query(`INSERT INTO property_contracts (id, shop_id, project_id, product_type, block_name, floor, unit_label, legacy_unit_number,
        contract_status, order_date, contract_date, total_price, prepayment_due, prepayment_condition, paid_amount, balance,
        customer_name, customer_first_name, customer_last_name, payment_condition, contract_number, sales_manager) VALUES
        ($1, $9, $10, 'residential', 'Б1', '05', 'Б1-16', '16', 'active', NULL, NULL, 439503120, 219751560, '50%', NULL, NULL, 'Тест.Хэрэглэгч', NULL, NULL, NULL, NULL, NULL),
        ($2, $9, $10, 'parking', 'Б1', 'B1', 'Б1-19 (B1)', '19', 'active', '2026-09-03', '2026-09-03', 79700000, 79700000, '100%', NULL, NULL, 'Зогсоол.Эзэн', NULL, NULL, 'Энгийн', NULL, NULL),
        ($3, $9, $10, 'residential', 'Б2', '10', 'Б2-152', '152', 'active', '2026-10-04', '2026-10-04', 384675000, 115402500, '30%', 1000, 384674000, 'Мэдэгдэх.Төлөлт', NULL, NULL, 'Тусгай', 'MG-1', 'Номин'),
        ($4, $9, $10, 'residential', 'Б2', '11', 'Б2-123', '123', 'active', NULL, NULL, 300000000, 90000000, '30%', NULL, NULL, 'Графиктай.Гэрээ', NULL, NULL, NULL, NULL, NULL),
        ($5, $9, $10, 'residential', 'Б1', '09', 'Б1-96', '96', 'transferred', NULL, NULL, 200000000, NULL, NULL, NULL, NULL, 'Тоот.Шилжсэн', NULL, NULL, NULL, NULL, NULL),
        ($6, $9, $10, 'residential', 'Б1', '07', 'Б1-50', '50', 'cancelled', '2026-07-01', '2026-07-01', 250000000, NULL, NULL, NULL, NULL, 'Цуцалсан.Хүн', NULL, NULL, NULL, NULL, NULL),
        ($7, $9, $10, 'residential', 'Б1', '08', 'Б1-70', '70', 'active', NULL, NULL, 260000000, NULL, NULL, NULL, NULL, 'Устгасан.Гэрээ', NULL, NULL, NULL, NULL, NULL),
        ($8, $9, $10, 'parking', 'Б1', '01', 'Б1-17 (01)', '17', 'active', NULL, NULL, 70000000, NULL, NULL, NULL, NULL, 'Шилжүүлсэн.Эзэн', NULL, NULL, NULL, NULL, NULL)`,
    [contract(1), contract(2), contract(3), contract(4), contract(5), contract(6), contract(7), contract(8), shop, project]);
    await db.query('UPDATE property_contracts SET deleted_at = now() WHERE id = $1', [contract(7)]);
    await db.query(`INSERT INTO payment_schedules (contract_id, shop_id, due_date, amount) VALUES ($1, $2, '2026-11-01', 1000)`, [contract(4), shop]);
    await db.query('INSERT INTO contract_transfers (shop_id, contract_id) VALUES ($1, $2)', [shop, contract(8)]);
    await db.query(`INSERT INTO property_units (shop_id, project_id, phase, block, code, category, status) VALUES
        ($1, $2, 'Elysium', 'Б1', 'Б1-16', 'residential', 'sold'), ($1, $2, 'Elysium', 'Б1', 'Б1-50', 'residential', 'available'),
        ($1, $2, 'Elysium', 'Б1', 'Б1-70', 'residential', 'available')`, [shop, project]);
    await db.exec(migration);
    await db.exec(migration); // Дахин ажиллуулж болно.
    await db.exec('SET ROLE service_role');
});
afterEach(async () => { await db.close(); });

describe('20261022140000 migration', () => {
    it('adds the overdue columns, a server-only import log and keeps the unit view invoker-secured, granted and cancelled-free', async () => {
        await db.exec('RESET ROLE');
        expect((await db.query<{ ok: boolean }>(verifySql('20261022140000'))).rows[0].ok).toBe(true);
        const privileges = (await db.query<Record<string, boolean>>(`SELECT
            has_function_privilege('authenticated', '${SIGNATURE}', 'EXECUTE') AS auth_exec,
            has_function_privilege('service_role', '${SIGNATURE}', 'EXECUTE') AS service_exec,
            has_table_privilege('service_role', 'contract_list_imports', 'INSERT') AS service_insert,
            has_table_privilege('service_role', 'contract_list_imports', 'UPDATE') AS service_update,
            has_table_privilege('service_role', 'contract_list_imports', 'DELETE') AS service_delete,
            has_table_privilege('authenticated', 'property_units_with_buyer', 'SELECT') AS view_grant_kept`)).rows[0];
        expect(privileges).toEqual({ auth_exec: false, service_exec: true, service_insert: true, service_update: false, service_delete: false, view_grant_kept: true });
        // Цуцалсан (Б1-50), устгасан (Б1-70) гэрээний худалдан авагч нэгжид харагдахгүй.
        const units = (await db.query('SELECT code, buyer_name, contract_status FROM property_units_with_buyer ORDER BY code')).rows;
        expect(units).toEqual([
            { code: 'Б1-16', buyer_name: 'Тест.Хэрэглэгч', contract_status: 'active' },
            { code: 'Б1-50', buyer_name: null, contract_status: null },
            { code: 'Б1-70', buyer_name: null, contract_status: null },
        ]);
        await expect(db.query("INSERT INTO property_contracts (shop_id, overdue_amount) VALUES ($1, -1)", [shop])).rejects.toMatchObject({ code: '23514' });
        await db.exec('SET ROLE authenticated');
        await expect(call()).rejects.toMatchObject({ code: '42501' });
    });
});

describe('import_contract_list', () => {
    it('rejects malformed calls and programming errors without writing anything', async () => {
        const before = await snapshot();
        const update = (set: Record<string, unknown>, expect: Record<string, unknown> = Object.fromEntries(Object.keys(set).map(key => [key, null]))) =>
            [{ op: 'update', id: contract(1), set, expect, label: 'Б1-16' }];
        const insert = (fields: Record<string, unknown>) => [{ op: 'insert', fields: { product_type: 'residential', unit_label: 'Б1-60', contract_status: 'active', order_date: '2026-10-01', ...fields }, label: 'Б1-60' }];
        const cases: CallArgs[] = [
            { actorId: null },
            { projectId: otherProject },
            { projectId: null },
            { reportDate: '2999-01-01' },
            { planHash: 'not-a-hash' },
            { rows: { not: 'array' } },
            { ops: update({ paid_amount: 1 }) },
            { ops: update({ balance: null }) },
            { ops: update({ customer_name: 'Өөр' }) },
            { ops: update({ order_date: '2026-09-01' }, {}) },
            { ops: update({ customer_first_name: 'Сараа' }) },
            { ops: update({ contract_status: 'transferred' }, { contract_status: 'active' }) },
            { ops: update({ total_price: -5 }, { total_price: 439503120 }) },
            { ops: update({ order_date: 20260901 }) },
            { ops: [...update({ order_date: '2026-09-01' }), ...update({ contract_date: '2026-09-01' })] },
            { ops: insert({ balance: 0 }) },
            { ops: insert({ paid_amount: null }) },
            { ops: insert({ order_date: null }) },
            { ops: insert({ product_type: 'office' }) },
            { ops: [{ op: 'delete', id: contract(1) }] },
        ];
        for (const args of cases) await expect(call(args), JSON.stringify(args)).rejects.toMatchObject({ code: '22023' });
        expect(await snapshot()).toEqual(before);
    });

    it('returns every conflict and writes nothing when any check fails', async () => {
        const before = await snapshot();
        const result = await call({ ops: [
            // Өөр хүн энэ хооронд огноо оруулсан гэж үзсэн хуучин төлөвлөгөө.
            { op: 'update', id: contract(1), set: { order_date: '2026-09-01' }, expect: { order_date: '2026-08-01' }, label: 'Б1-16' },
            { op: 'update', id: contract(3), set: { total_price: 380000000 }, expect: { total_price: 384675000 }, label: 'Б2-152' },
            { op: 'update', id: contract(4), set: { contract_status: 'cancelled' }, expect: { contract_status: 'active' }, label: 'Б2-123' },
            { op: 'update', id: contract(5), set: { contract_status: 'active' }, expect: { contract_status: 'transferred' }, label: 'Б1-96' },
            { op: 'update', id: contract(7), set: { order_date: '2026-09-01' }, expect: { order_date: null }, label: 'Б1-70' },
            { op: 'update', id: contract(8), set: { customer_first_name: 'Эзэн' }, expect: { customer_first_name: null, customer_name: 'Шилжүүлсэн.Эзэн' }, label: 'Б1-17 (01)' },
            { op: 'update', id: contract(2), set: { contract_number: 'X-1' }, expect: { contract_number: null }, label: 'Б1-19 (B1)' },
            { op: 'insert', fields: { product_type: 'residential', unit_label: 'Б1-16', contract_status: 'active', order_date: '2026-10-01' }, label: 'Б1-16 шинэ' },
        ] });
        expect(result.ok).toBe(false);
        expect((result.conflicts as Array<Record<string, unknown>>).map(c => [c.label, c.code])).toEqual([
            ['Б1-16', 'changed'], ['Б2-152', 'paid_known'], ['Б2-123', 'has_payments'], ['Б1-96', 'transferred'],
            ['Б1-70', 'missing'], ['Б1-17 (01)', 'holder_transferred'], ['Б1-16 шинэ', 'unit_taken'],
        ]);
        expect((result.conflicts as Array<Record<string, unknown>>)[0]).toMatchObject({ id: contract(1), field: 'order_date', current: null, expected: '2026-08-01' });
        expect((result.conflicts as Array<Record<string, unknown>>)[6]).toMatchObject({ id: null, existing_id: contract(1) });
        expect(await snapshot()).toEqual(before);

        // Цуцалсан гэрээг сэргээхэд байранд өөр амьд гэрээ байвал.
        await db.exec('RESET ROLE');
        await db.query(`INSERT INTO property_contracts (id, shop_id, product_type, block_name, unit_label, contract_status) VALUES ($1, $2, 'residential', 'Б1', 'Б1-50', 'active')`, [contract(9), shop]);
        await db.exec('SET ROLE service_role');
        const revive = await call({ ops: [{ op: 'update', id: contract(6), set: { contract_status: 'active' }, expect: { contract_status: 'cancelled' }, label: 'Б1-50' }] });
        expect(revive).toMatchObject({ ok: false, conflicts: [{ code: 'unit_taken', existing_id: contract(9) }] });
    });

    it('applies updates and inserts atomically with NULL paid amounts, PATCH-shaped audit and an import record', async () => {
        const ops = [
            { op: 'update', id: contract(1), label: 'Б1-16',
                set: { order_date: '2026-09-15', contract_date: '2026-09-15', payment_condition: 'Тусгай', overdue_amount: 20010000, overdue_as_of: '2026-10-21', customer_first_name: 'Тест', customer_last_name: 'Хэрэглэгч' },
                expect: { order_date: null, contract_date: null, payment_condition: null, overdue_amount: null, overdue_as_of: null, customer_first_name: null, customer_last_name: null, customer_name: 'Тест.Хэрэглэгч' } },
            { op: 'update', id: contract(2), label: 'Б1-19 (B1)', review: true,
                set: { contract_status: 'closed', total_price: 86600000, overdue_amount: 0, overdue_as_of: '2026-10-21' },
                expect: { contract_status: 'active', total_price: '79700000.00', overdue_amount: null, overdue_as_of: null } },
            { op: 'insert', label: 'Б1-60', fields: {
                product_type: 'residential', block_name: 'Б1', floor: '12', unit_number: null, legacy_unit_number: '60', model: 'E3', unit_label: 'Б1-60',
                contracted_area: 58.1, price_per_sqm: 6500000, total_price: 377650000, prepayment_condition: '30%', prepayment_due: 113295000,
                payment_condition: 'Энгийн', order_date: '2026-10-10', contract_date: '2026-10-10', contract_status: 'active',
                customer_name: 'Шинэ.Худалдан', customer_first_name: 'Шинэ', customer_last_name: 'Худалдан', overdue_amount: 0, overdue_as_of: '2026-10-21',
                notes: 'Гэрээний жагсаалт «Elysium HUB.xlsx» (2026-10-21)-аас импортолсон.' } },
            // Амьд гэрээтэй байранд цуцалсан бүртгэл нэмж болно.
            { op: 'insert', label: 'Б1-16 (цуцалсан)', fields: { product_type: 'residential', block_name: 'Б1', unit_label: 'Б1-16', contract_status: 'cancelled', order_date: '2026-07-29', total_price: 400000000 } },
        ];
        const result = await call({ ops, summary: { counts: { update: 2, insert: 2 }, fileTotals: { active: 1 } } });
        expect(result).toMatchObject({ ok: true, replayed: false, inserted: 2, updated: 2 });
        const importId = result.import_id as string;
        expect(result.summary).toEqual({ counts: { update: 2, insert: 2 }, fileTotals: { active: 1 }, inserted: 2, updated: 2 });

        await db.exec('RESET ROLE');
        const updated = (await db.query<Record<string, unknown>>(`SELECT order_date::text, contract_date::text, payment_condition, overdue_amount::float8 AS overdue_amount,
            overdue_as_of::text, customer_first_name, customer_last_name, customer_name, paid_amount, balance FROM property_contracts WHERE id = $1`, [contract(1)])).rows[0];
        expect(updated).toEqual({ order_date: '2026-09-15', contract_date: '2026-09-15', payment_condition: 'Тусгай', overdue_amount: 20010000,
            overdue_as_of: '2026-10-21', customer_first_name: 'Тест', customer_last_name: 'Хэрэглэгч', customer_name: 'Тест.Хэрэглэгч', paid_amount: null, balance: null });
        const inserted = (await db.query<Record<string, unknown>>(`SELECT shop_id, project_id, contract_status, total_price::float8 AS total_price, paid_amount, balance,
            penalty_amount, overdue_days, overdue_amount::float8 AS overdue_amount, legacy_unit_number, unit_number FROM property_contracts WHERE unit_label = 'Б1-60'`)).rows;
        expect(inserted).toEqual([{ shop_id: shop, project_id: project, contract_status: 'active', total_price: 377650000, paid_amount: null, balance: null,
            penalty_amount: null, overdue_days: null, overdue_amount: 0, legacy_unit_number: '60', unit_number: null }]);
        expect((await db.query("SELECT count(*)::int AS n FROM property_contracts WHERE unit_label = 'Б1-16'")).rows).toEqual([{ n: 2 }]);

        const audit = (await db.query<{ entity_id: string; action: string; changes: Record<string, unknown>; actor_id: string; shop_id: string }>(
            "SELECT entity_id, action, changes, actor_id, shop_id FROM data_audit_log WHERE entity = 'contract' ORDER BY action DESC, entity_id")).rows;
        expect(audit).toHaveLength(4);
        const meta = { source: 'contract_list_import', import_id: importId, report_date: '2026-10-21' };
        expect(audit[0]).toMatchObject({ entity_id: contract(1), action: 'update', actor_id: actor, shop_id: shop });
        expect(audit[0].changes).toEqual({
            order_date: { from: null, to: '2026-09-15' }, contract_date: { from: null, to: '2026-09-15' },
            payment_condition: { from: null, to: 'Тусгай' }, overdue_amount: { from: null, to: 20010000.00 },
            overdue_as_of: { from: null, to: '2026-10-21' }, customer_first_name: { from: null, to: 'Тест' },
            customer_last_name: { from: null, to: 'Хэрэглэгч' }, _meta: { ...meta, label: 'Б1-16', review: false },
        });
        expect(audit[1].changes).toEqual({
            contract_status: { from: 'active', to: 'closed' }, total_price: { from: 79700000, to: 86600000 },
            overdue_amount: { from: null, to: 0 }, overdue_as_of: { from: null, to: '2026-10-21' }, _meta: { ...meta, label: 'Б1-19 (B1)', review: true },
        });
        const created = audit.filter(row => row.action === 'create').map(row => row.changes);
        expect(created).toEqual(expect.arrayContaining([
            expect.objectContaining({ name: 'Б1-60', total_price: 377650000, customer_name: 'Шинэ.Худалдан', _meta: { ...meta, label: 'Б1-60', review: false } }),
            expect.objectContaining({ name: 'Б1-16', contract_status: 'cancelled' }),
        ]));
        expect(created.every(changes => !('unit_label' in changes) && !('paid_amount' in changes))).toBe(true);

        const admin = (await db.query<{ actor_id: string; action: string; target_id: string; meta: Record<string, unknown> }>('SELECT actor_id, action, target_id, meta FROM admin_audit_log')).rows;
        expect(admin).toEqual([{ actor_id: actor, action: 'contracts.list_import', target_id: importId, meta: {
            shop_id: shop, project_id: project, report_date: '2026-10-21', file_name: 'Elysium HUB.xlsx', request_id: 'req-1', summary: result.summary,
        } }]);
        const record = (await db.query<Record<string, unknown>>(`SELECT id, shop_id, project_id, request_id, plan_hash, report_date::text, file_name, row_count,
            summary, rows, created_by, created_by_name FROM contract_list_imports`)).rows;
        expect(record).toEqual([{ id: importId, shop_id: shop, project_id: project, request_id: 'req-1', plan_hash: HASH, report_date: '2026-10-21',
            file_name: 'Elysium HUB.xlsx', row_count: 2, summary: result.summary, rows: [{ 'Тоот': 16 }, { 'Тоот': 19 }], created_by: actor, created_by_name: 'Номин' }]);

        // Давтан илгээлт: ижил төлөвлөгөө → хадгалсан үр дүн, шинэ бичилтгүй; өөр төлөвлөгөө → 23505.
        await db.exec('SET ROLE service_role');
        const before = await snapshot();
        expect(await call({ ops, summary: { other: true } })).toEqual({ ok: true, replayed: true, import_id: importId, inserted: 2, updated: 2, summary: result.summary });
        await expect(call({ ops, planHash: OTHER_HASH })).rejects.toMatchObject({ code: '23505', hint: 'request_reused' });
        expect(await snapshot()).toEqual(before);
    });

    it('a contract cancelled in the same import frees its unit for a new live contract; zero-op imports are recorded', async () => {
        const result = await call({ ops: [
            { op: 'insert', label: 'Б1-16', fields: { product_type: 'residential', unit_label: 'Б1-16', contract_status: 'active', order_date: '2026-10-15' } },
            { op: 'update', id: contract(1), label: 'Б1-16', review: true, set: { contract_status: 'cancelled' }, expect: { contract_status: 'active' } },
        ] });
        expect(result).toMatchObject({ ok: true, inserted: 1, updated: 1 });
        expect((await db.query("SELECT contract_status FROM property_contracts WHERE unit_label = 'Б1-16' ORDER BY contract_status")).rows)
            .toEqual([{ contract_status: 'active' }, { contract_status: 'cancelled' }]);
        expect(await call({ requestId: 'req-2', ops: [], reportDate: '2026-10-21' })).toMatchObject({ ok: true, inserted: 0, updated: 0 });
    });

    it('refuses an older file unless explicitly allowed', async () => {
        expect(await call({ requestId: 'req-new', reportDate: '2026-10-21' })).toMatchObject({ ok: true });
        const before = await snapshot();
        expect(await call({ requestId: 'req-old', reportDate: '2026-10-14' })).toEqual({ ok: false, code: 'older_file', latest: '2026-10-21' });
        expect(await snapshot()).toEqual(before);
        expect(await call({ requestId: 'req-old', reportDate: '2026-10-14', allowOlder: true })).toMatchObject({ ok: true, summary: { older_than: '2026-10-21' } });
    });

    it('rolls every write back when the audit cannot be stored', async () => {
        await db.exec('RESET ROLE; ALTER TABLE data_audit_log ADD CONSTRAINT fail_audit CHECK (false) NOT VALID; SET ROLE service_role');
        const before = await snapshot();
        await expect(call({ ops: [{ op: 'update', id: contract(1), set: { order_date: '2026-09-15' }, expect: { order_date: null }, label: 'Б1-16' }] }))
            .rejects.toMatchObject({ code: '23514' });
        expect(await snapshot()).toEqual(before);
    });
});

describe('import_contract_list with the planner (lib/contracts/list-import)', () => {
    /** Сервис PostgREST-ээр уншдагтай ижил хэлбэр: огноо текстээр, numeric тоогоор. */
    const readState = async () => ({
        contracts: (await db.query<ContractListContract>(`SELECT id, product_type, unit_label, block_name, unit_number, legacy_unit_number, contract_status,
            order_date::text, contract_date::text, total_price::float8 AS total_price, price_per_sqm::float8 AS price_per_sqm,
            contracted_area::float8 AS contracted_area, prepayment_condition, prepayment_due::float8 AS prepayment_due, payment_condition,
            overdue_amount::float8 AS overdue_amount, overdue_as_of::text, customer_name, customer_first_name, customer_last_name,
            contract_number, sales_manager, paid_amount::float8 AS paid_amount
            FROM property_contracts WHERE shop_id = $1 AND deleted_at IS NULL ORDER BY id`, [shop])).rows,
        units: (await db.query<ContractListUnit>('SELECT code, category, block, floor, model, unit_number, legacy_unit_number, status FROM property_units WHERE shop_id = $1', [shop])).rows,
    });
    const hubRow = (overrides: Partial<HubRow>): HubRow => ({
        row: 2, productType: 'residential', block: 'Б1', unitNumber: '16', floor: '05', model: null, area: null, prepaymentCondition: null,
        pricePerSqm: null, total: 439503120, prepaymentDue: null, overdue: 0, orderDate: '2026-09-15', status: 'active',
        firstName: null, lastName: null, paymentCondition: null, contractNumber: null, salesManager: null, paidTotal: null, ...overrides,
    });

    it('refuses to cancel a contract with cash-ledger payments', async () => {
        await db.exec('RESET ROLE');
        await db.query('INSERT INTO finance_transactions (shop_id, contract_id, amount) VALUES ($1, $2, 1000)', [shop, contract(1)]);
        await db.exec('SET ROLE service_role');
        const result = await call({ ops: [{ op: 'update', id: contract(1), set: { contract_status: 'cancelled' }, expect: { contract_status: 'active' }, label: 'Б1-16' }] });
        expect(result).toMatchObject({ ok: false, conflicts: [{ code: 'has_payments' }] });
    });

    it('applies a planned import (fills, closed status, new and cancelled rows) and re-planning the same file yields zero ops', async () => {
        await db.exec('RESET ROLE');
        await db.query(`INSERT INTO property_units (shop_id, project_id, phase, block, code, category, status, floor, model, unit_number, legacy_unit_number) VALUES
            ($1, $2, 'Elysium', 'Б1', 'Б1-19 (B1)', 'parking', 'sold', 'B1', 'P', '19', '19'),
            ($1, $2, 'Elysium', 'Б1', 'Б1-19 (01)', 'parking', 'available', '01', 'P', '19', '19'),
            ($1, $2, 'Elysium', 'Б1', 'Б1-60', 'residential', 'available', '12', 'E3', '0', '60')`, [shop, project]);
        await db.query("UPDATE property_units SET floor = '05', legacy_unit_number = '16', unit_number = '0' WHERE code = 'Б1-16'");
        await db.query("UPDATE property_units SET floor = '07', legacy_unit_number = '50', unit_number = '0' WHERE code = 'Б1-50'");
        await db.exec('SET ROLE service_role');
        const rows = [
            hubRow({ firstName: 'Тест', lastName: 'Хэрэглэгч', area: 58.1, pricePerSqm: 7564598, prepaymentCondition: '50%', prepaymentDue: 219751560,
                paymentCondition: 'Тусгай', overdue: 20010000 }),
            hubRow({ row: 3, productType: 'parking', unitNumber: '19', floor: 'B1', total: 79700000, pricePerSqm: 79700000, area: 12.5,
                orderDate: '2026-09-03', status: 'closed', firstName: 'Зогсоол', lastName: 'Эзэн', paymentCondition: 'Энгийн' }),
            hubRow({ row: 4, unitNumber: '60', floor: '12', total: 377650000, area: 58.1, pricePerSqm: 6500000, prepaymentCondition: '30%',
                prepaymentDue: 113295000, orderDate: '2026-10-10', firstName: 'Шинэ', lastName: 'Худалдан' }),
            hubRow({ row: 5, unitNumber: '50', floor: '07', total: 250000000, orderDate: '2026-07-01', status: 'cancelled' }),
        ];
        const input = { rows, transferredIds: new Set<string>(), paymentContractIds: new Set<string>(), latestImportDate: null,
            reportDate: '2026-10-21', fileName: 'HUB.xlsx', today: '2026-10-21' };
        const planned = planContractListImport({ ...input, ...await readState() });
        expect(planned.errors).toEqual([]);
        expect(planned.blocking).toEqual([]);
        expect(planned.counts).toMatchObject({ insert: 1, insertCancelled: 0, update: 3, unchanged: 0 });
        const result = await call({ reportDate: '2026-10-21', planHash: createHash('sha256').update(planned.canonical).digest('hex'),
            ops: planned.ops, rows: planned.rows, summary: planned.summary });
        expect(result).toMatchObject({ ok: true, inserted: 1, updated: 3 });

        await db.exec('RESET ROLE');
        const after = (await db.query<Record<string, unknown>>(`SELECT unit_label, contract_status, order_date::text, contract_date::text,
            price_per_sqm::float8 AS price_per_sqm, overdue_amount::float8 AS overdue_amount, overdue_as_of::text, customer_first_name, paid_amount, balance
            FROM property_contracts WHERE unit_label IN ('Б1-16', 'Б1-19 (B1)', 'Б1-60') ORDER BY unit_label`)).rows;
        expect(after).toEqual([
            { unit_label: 'Б1-16', contract_status: 'active', order_date: '2026-09-15', contract_date: '2026-09-15', price_per_sqm: 7564598,
                overdue_amount: 20010000, overdue_as_of: '2026-10-21', customer_first_name: 'Тест', paid_amount: null, balance: null },
            { unit_label: 'Б1-19 (B1)', contract_status: 'closed', order_date: '2026-09-03', contract_date: '2026-09-03', price_per_sqm: null,
                overdue_amount: 0, overdue_as_of: '2026-10-21', customer_first_name: 'Зогсоол', paid_amount: null, balance: null },
            { unit_label: 'Б1-60', contract_status: 'active', order_date: '2026-10-10', contract_date: '2026-10-10', price_per_sqm: 6500000,
                overdue_amount: 0, overdue_as_of: '2026-10-21', customer_first_name: 'Шинэ', paid_amount: null, balance: null },
        ]);
        await db.exec('SET ROLE service_role');
        const replanned = planContractListImport({ ...input, latestImportDate: '2026-10-21', ...await readState() });
        expect(replanned.ops).toEqual([]);
        expect(replanned.counts).toMatchObject({ unchanged: 4 });
    });

    it('stores a same-date re-export whose only new data is «Нийт төлсөн дүн» as a zero-op import that becomes the paid source', async () => {
        /** Сервисийн уншилт: тэр огноонд сүүлд хийсэн импортын мөрүүд. */
        const sameDateRows = async () => (await db.query<{ rows: unknown }>(`SELECT rows FROM contract_list_imports
            WHERE shop_id = $1 AND report_date = '2026-10-21' ORDER BY created_at DESC LIMIT 1`, [shop])).rows[0]?.rows ?? null;
        const input = { transferredIds: new Set<string>(), paymentContractIds: new Set<string>(), reportDate: '2026-10-21', fileName: 'HUB.xlsx', today: '2026-10-21' };
        const commit = async (planned: ReturnType<typeof planContractListImport>, requestId: string) => call({ requestId, reportDate: '2026-10-21',
            planHash: createHash('sha256').update(planned.canonical).digest('hex'), ops: planned.ops, rows: planned.rows, summary: planned.summary });

        const first = planContractListImport({ ...input, rows: [hubRow({ paidTotal: 100_000_000 })], latestImportDate: null, ...await readState() });
        expect(first.ops.length).toBeGreaterThan(0);
        expect(await commit(first, 'req-1')).toMatchObject({ ok: true });

        const paidOnly = planContractListImport({ ...input, rows: [hubRow({ paidTotal: 150_000_000 })], latestImportDate: '2026-10-21',
            sameDateImportRows: await sameDateRows(), ...await readState() });
        expect(paidOnly).toMatchObject({ ops: [], errors: [], blocking: [], paidUpdate: { rows: 1, changed: 1, reimport: true } });
        const contractsBefore = (await snapshot()).contracts;
        expect(await commit(paidOnly, 'req-2')).toMatchObject({ ok: true, replayed: false, inserted: 0, updated: 0,
            summary: { paidUpdate: { rows: 1, changed: 1, reimport: true } } });
        expect((await snapshot()).contracts).toEqual(contractsBefore);
        // Хүсэлтийн давталт идемпотент.
        expect(await commit(paidOnly, 'req-2')).toMatchObject({ ok: true, replayed: true });

        // Төлсөн дүнгийн уншигчийн эрэмбэ (plan-performance-load): огноо, дараа нь сүүлд хийсэн нь.
        const latest = (await db.query<{ request_id: string; rows: unknown }>(`SELECT request_id, rows FROM contract_list_imports
            WHERE shop_id = $1 ORDER BY report_date DESC, created_at DESC LIMIT 1`, [shop])).rows[0];
        expect(latest.request_id).toBe('req-2');
        expect(storedHubPaidRows(latest.rows).map(row => row.paidTotal)).toEqual([150_000_000]);

        // Ижил файлыг дахин: өөрчлөх зүйлгүй.
        const again = planContractListImport({ ...input, rows: [hubRow({ paidTotal: 150_000_000 })], latestImportDate: '2026-10-21',
            sameDateImportRows: await sameDateRows(), ...await readState() });
        expect(again).toMatchObject({ ops: [], paidUpdate: null });
    });
});

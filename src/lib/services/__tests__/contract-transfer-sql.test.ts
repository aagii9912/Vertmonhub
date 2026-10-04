// @vitest-environment node
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { expect, it } from 'vitest';

const shop = '10000000-0000-4000-8000-000000000001';
const otherShop = '10000000-0000-4000-8000-000000000002';
const actor = '20000000-0000-4000-8000-000000000001';
const lead = '30000000-0000-4000-8000-000000000001';
const contract = '40000000-0000-4000-8000-000000000001';
const cancelled = '40000000-0000-4000-8000-000000000002';
const erpMoved = '40000000-0000-4000-8000-000000000003';
const deleted = '40000000-0000-4000-8000-000000000004';
const buyer = '50000000-0000-4000-8000-000000000001';
const existing = '50000000-0000-4000-8000-000000000002';
const request = (n: number) => `60000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

function extractTable(file: string, table: string) {
    const sql = readFileSync(file, 'utf8').match(new RegExp(`CREATE TABLE IF NOT EXISTS ${table} \\([\\s\\S]*?\\n\\);`));
    if (!sql) throw new Error(`${table} DDL not found`);
    return sql[0];
}

it('changes only the contract holder, keeps money/attribution and writes history atomically in disposable PostgreSQL', async () => {
    const db = new PGlite();
    const transfer = (contractId: string, payload: object, requestId: string, scopeManager: string | null = null, shopId = shop) => db.query<{ result: Record<string, unknown> }>(
        'SELECT public.transfer_contract($1::uuid,$2::uuid,$3::jsonb,$4::uuid,$5::uuid,$6::text,$7::text) AS result',
        [shopId, contractId, JSON.stringify(payload), requestId, actor, ' Номин ', scopeManager],
    ).then(r => r.rows[0].result);
    const snapshot = async () => ({
        contract: (await db.query<Record<string, unknown>>(`SELECT customer_name, customer_first_name, customer_last_name, customer_registration,
            customer_phone, customer_mobile, customer_id, total_price::float8 AS total_price, paid_amount::float8 AS paid_amount,
            balance::float8 AS balance, sales_manager, contract_date::text AS contract_date, lead_id, unit_label, contract_number,
            project_id, contract_status FROM property_contracts WHERE id = $1`, [contract])).rows[0],
        transfers: (await db.query<Record<string, unknown>>('SELECT kind, to_customer_name FROM contract_transfers ORDER BY created_at')).rows,
        customers: (await db.query<Record<string, unknown>>('SELECT id, name FROM customers ORDER BY created_at, id')).rows,
        activities: (await db.query<Record<string, unknown>>('SELECT content FROM lead_activities ORDER BY created_at')).rows,
        audit: (await db.query<Record<string, unknown>>('SELECT entity, action FROM data_audit_log ORDER BY created_at')).rows,
    });
    const today = async () => (await db.query<{ d: string }>("SELECT (now() AT TIME ZONE 'Asia/Ulaanbaatar')::date::text AS d")).rows[0].d;
    try {
        await db.exec(`
            CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
            CREATE TABLE shops (id uuid PRIMARY KEY);
            CREATE TABLE projects (id uuid PRIMARY KEY);
            CREATE TABLE chart_of_accounts (id uuid PRIMARY KEY);
            CREATE TABLE customers (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), shop_id uuid REFERENCES shops(id),
                name text, phone text, phone_normalized text, tags jsonb DEFAULT '[]'::jsonb, deleted_at timestamptz,
                created_at timestamptz DEFAULT clock_timestamp());
            CREATE TABLE leads (id uuid PRIMARY KEY, shop_id uuid);
            CREATE TABLE lead_activities (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), shop_id uuid NOT NULL, lead_id uuid NOT NULL REFERENCES leads(id),
                type text NOT NULL CHECK (type IN ('note','call','status','manager','meeting','contract','system')), content text,
                meta jsonb NOT NULL DEFAULT '{}'::jsonb, created_by uuid, created_by_name text, created_at timestamptz NOT NULL DEFAULT clock_timestamp());
            CREATE TABLE data_audit_log (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), shop_id uuid, actor_id uuid, entity varchar(48) NOT NULL,
                entity_id text, action varchar(24) NOT NULL, changes jsonb DEFAULT '{}'::jsonb, created_at timestamptz NOT NULL DEFAULT clock_timestamp());
            CREATE TABLE property_contracts (id uuid PRIMARY KEY, shop_id uuid REFERENCES shops(id), project_id uuid REFERENCES projects(id),
                contract_number text, contract_date date, contract_status varchar(20) DEFAULT 'active', unit_label text, sales_manager text,
                lead_id uuid REFERENCES leads(id), customer_id uuid REFERENCES customers(id),
                customer_name text, customer_first_name text, customer_last_name text, customer_registration text, customer_phone text, customer_mobile text,
                total_price numeric(18,2), paid_amount numeric(18,2) DEFAULT 0, balance numeric(18,2) DEFAULT 0,
                deleted_at timestamptz, updated_at timestamptz DEFAULT now());
        `);
        await db.exec(extractTable('supabase/migrations/20260416_customer_service_tables.sql', 'payment_schedules'));
        await db.exec(extractTable('supabase/migrations/20260608170000_erp_finance_core.sql', 'finance_transactions'));
        await db.exec(`
            GRANT USAGE ON SCHEMA public TO service_role;
            GRANT ALL ON shops, projects, customers, leads, lead_activities, data_audit_log, property_contracts, payment_schedules, finance_transactions TO service_role;
            GRANT SELECT ON customers, property_contracts TO authenticated;
        `);
        const project = '70000000-0000-4000-8000-000000000001';
        await db.query('INSERT INTO shops VALUES ($1), ($2)', [shop, otherShop]);
        await db.query('INSERT INTO projects VALUES ($1)', [project]);
        await db.query('INSERT INTO leads VALUES ($1, $2)', [lead, shop]);
        await db.query('INSERT INTO customers (id, shop_id, name, phone, phone_normalized) VALUES ($1,$2,$3,$4,$5)', [buyer, shop, 'Бат Болд', '99112233', '99112233']);
        await db.query(`INSERT INTO property_contracts (id, shop_id, project_id, contract_number, contract_date, contract_status, unit_label, sales_manager,
            lead_id, customer_id, customer_name, customer_first_name, customer_last_name, customer_registration, customer_phone, customer_mobile,
            total_price, paid_amount, balance) VALUES
            ($1,$2,$3,'MG-101','2026-01-15','active','A-101','Номин',$4,$5,'Бат Болд','Болд','Бат','УБ99010101','99112233',NULL,300000000,120000000,180000000),
            ($6,$2,$3,'MG-102','2026-01-15','cancelled','A-102','Номин',NULL,NULL,'Цуцалсан',NULL,NULL,NULL,NULL,NULL,100,0,100),
            ($7,$2,$3,'MG-103','2026-01-15','transferred','A-103','Номин',NULL,NULL,'Тоот шилжсэн',NULL,NULL,NULL,NULL,NULL,100,0,100),
            ($8,$2,$3,'MG-104','2026-01-15','active','A-104','Номин',NULL,NULL,'Устгасан',NULL,NULL,NULL,NULL,NULL,100,0,100)`,
        [contract, shop, project, lead, buyer, cancelled, erpMoved, deleted]);
        await db.query('UPDATE property_contracts SET deleted_at = now() WHERE id = $1', [deleted]);

        const migration = readFileSync('supabase/migrations/20261004160000_contract_transfers.sql', 'utf8');
        await db.exec(migration);
        await db.exec(migration);
        await db.exec(readFileSync('supabase/migrations/20260913160000_atomic_contract_payments.sql', 'utf8'));

        // Хөтчийн эрх: RPC дуудах, түүх унших боломжгүй; service_role зөвхөн уншиж/нэмнэ.
        const privileges = (await db.query<Record<string, boolean>>(`SELECT
            has_function_privilege('authenticated', 'transfer_contract(uuid,uuid,jsonb,uuid,uuid,text,text)', 'EXECUTE') AS auth_exec,
            has_function_privilege('anon', 'transfer_contract(uuid,uuid,jsonb,uuid,uuid,text,text)', 'EXECUTE') AS anon_exec,
            has_function_privilege('service_role', 'transfer_contract(uuid,uuid,jsonb,uuid,uuid,text,text)', 'EXECUTE') AS service_exec,
            has_function_privilege('authenticated', 'contract_registration_key(text)', 'EXECUTE') AS auth_key,
            has_table_privilege('authenticated', 'contract_transfers', 'SELECT') AS auth_read,
            has_table_privilege('service_role', 'contract_transfers', 'INSERT') AS service_insert,
            has_table_privilege('service_role', 'contract_transfers', 'DELETE') AS service_delete,
            has_column_privilege('service_role', 'contract_transfers', 'to_customer_name', 'UPDATE') AS service_rewrite,
            has_column_privilege('service_role', 'contract_transfers', 'to_customer_id', 'UPDATE') AS service_relink`)).rows[0];
        expect(privileges).toEqual({ auth_exec: false, anon_exec: false, service_exec: true, auth_key: false, auth_read: false,
            service_insert: true, service_delete: false, service_rewrite: false, service_relink: true });
        await db.exec('SET ROLE authenticated');
        await expect(transfer(contract, { kind: 'rename', customer_name: 'Бат-Болд' }, request(99))).rejects.toMatchObject({ code: '42501' });
        await db.exec('RESET ROLE; SET ROLE service_role');

        const before = await snapshot();
        const payload = {
            kind: 'transfer', customer_name: 'Дорж Сараа', customer_first_name: 'Сараа', customer_last_name: 'Дорж',
            customer_registration: 'ЧБ88020202', customer_phone: '8811 4455', customer_mobile: null, phone_normalized: '88114455',
            effective_date: '2026-06-01', reason: 'Худалдан авагч гэр бүлийн гишүүндээ шилжүүлэв', expected_customer_name: 'Бат Болд',
        };

        // Хүрээ, хуучирсан цонх, буруу өгөгдөл: юу ч бичигдэхгүй.
        await expect(transfer(contract, payload, request(1), 'Сараа')).rejects.toMatchObject({ code: '42501' });
        await expect(transfer(contract, { ...payload, expected_customer_name: 'Өөр хүн' }, request(1))).rejects.toMatchObject({ code: '40001' });
        await expect(transfer(contract, { ...payload, paid_amount: 0 }, request(1))).rejects.toMatchObject({ code: '22023' });
        await expect(transfer(contract, { ...payload, sales_manager: 'Сараа' }, request(1))).rejects.toMatchObject({ code: '22023' });
        await expect(transfer(contract, { ...payload, customer_name: 5 }, request(1))).rejects.toMatchObject({ code: '22023' });
        await expect(transfer(contract, { ...payload, customer_registration: null }, request(1))).rejects.toMatchObject({ code: '22023' });
        await expect(transfer(contract, { ...payload, reason: '  ' }, request(1))).rejects.toMatchObject({ code: '22023' });
        await expect(transfer(contract, { ...payload, customer_registration: 'уб99010101'.toUpperCase() }, request(1))).rejects.toMatchObject({ code: '22023' });
        await expect(transfer(contract, { ...payload, effective_date: '2025-12-31' }, request(1))).rejects.toMatchObject({ code: '22023' });
        await expect(transfer(contract, { ...payload, effective_date: '2999-01-01' }, request(1))).rejects.toMatchObject({ code: '22023' });
        await expect(transfer(contract, { ...payload, effective_date: '2026-02-31' }, request(1))).rejects.toMatchObject({ code: '22023' });
        await expect(transfer(contract, { ...payload, kind: 'gift' }, request(1))).rejects.toMatchObject({ code: '22023' });
        await expect(transfer(contract, payload, request(1), null, otherShop)).rejects.toMatchObject({ code: 'P0002' });
        for (const id of [cancelled, erpMoved]) {
            await expect(transfer(id, { ...payload, expected_customer_name: undefined }, request(2))).rejects.toMatchObject({ code: '22023' });
        }
        await expect(transfer(deleted, payload, request(2))).rejects.toMatchObject({ code: 'P0002' });
        expect(await snapshot()).toEqual(before);

        // Аудитын алдаа бүх бичилтийг (харилцагч, түүх, гэрээ, timeline) буцаана.
        await db.exec('RESET ROLE; ALTER TABLE data_audit_log ADD CONSTRAINT fail_audit CHECK (false) NOT VALID; SET ROLE service_role');
        await expect(transfer(contract, payload, request(1))).rejects.toMatchObject({ code: '23514' });
        expect(await snapshot()).toEqual(before);
        await db.exec('RESET ROLE; ALTER TABLE data_audit_log DROP CONSTRAINT fail_audit; SET ROLE service_role');

        const result = await transfer(contract, payload, request(1), 'Номин');
        expect(result).toMatchObject({
            kind: 'transfer', contract_id: contract, effective_date: '2026-06-01', replayed: false, customer_created: true,
            from_customer_id: buyer, from_customer_name: 'Бат Болд', from_registration: 'УБ99010101', from_phone: '99112233',
            to_customer_name: 'Дорж Сараа', to_registration: 'ЧБ88020202', to_phone: '8811 4455',
            total_price_at_transfer: 300000000, paid_amount_at_transfer: 120000000, balance_at_transfer: 180000000,
            created_by: actor, created_by_name: 'Номин',
        });
        const after = await snapshot();
        // Мөнгө, менежер, огноо, лид, тоот, дугаар, төсөл, төлөв хэвээр; зөвхөн эзэмшигч солигдоно.
        expect(after.contract).toEqual({
            ...before.contract,
            customer_name: 'Дорж Сараа', customer_first_name: 'Сараа', customer_last_name: 'Дорж', customer_registration: 'ЧБ88020202',
            customer_phone: '8811 4455', customer_mobile: null, customer_id: result.to_customer_id,
        });
        expect(after.customers).toEqual([{ id: buyer, name: 'Бат Болд' }, { id: result.to_customer_id, name: 'Дорж Сараа' }]);
        expect((await db.query('SELECT tags, phone_normalized FROM customers WHERE id = $1', [result.to_customer_id as string])).rows)
            .toEqual([{ tags: ['source:contract_transfer'], phone_normalized: '88114455' }]);
        expect((await db.query('SELECT type, content, meta, created_by, created_by_name FROM lead_activities')).rows).toEqual([{
            type: 'contract', content: 'Гэрээ MG-101 шилжүүлэв: Бат Болд → Дорж Сараа', created_by: actor, created_by_name: 'Номин',
            meta: { transfer_id: result.id, contract_id: contract, kind: 'transfer', from: 'Бат Болд', to: 'Дорж Сараа', effective_date: '2026-06-01' },
        }]);
        expect(after.audit).toEqual([{ entity: 'customer', action: 'create' }, { entity: 'contract', action: 'transfer' }]);

        // Давталт ижил мөрийг буцаана; өөр агуулга эсвэл өөр гэрээ 23505.
        expect(await transfer(contract, payload, request(1))).toMatchObject({ id: result.id, replayed: true });
        await expect(transfer(contract, { ...payload, customer_name: 'Өөр' }, request(1))).rejects.toMatchObject({ code: '23505' });
        await expect(transfer(cancelled, payload, request(1))).rejects.toMatchObject({ code: '23505' });
        expect(await snapshot()).toEqual(after);

        // Эзэмшигчийн дараалал: өмнөх өөрчлөлтийн огнооноос өмнө огноолохгүй (гэрээний огнооноос хойш ч гэсэн).
        await expect(transfer(contract, { kind: 'rename', customer_name: 'Дорж С.', effective_date: '2026-05-31' }, request(6)))
            .rejects.toMatchObject({ code: '22023', message: expect.stringContaining('2026-06-01') });
        // Нэр засвар регистрийг солихгүй — өөр хүн бол шалтгаантай шилжүүлэг (шинэ харилцагч).
        await expect(transfer(contract, { kind: 'rename', customer_name: 'Дорж С.', customer_registration: 'УБ11223344', customer_phone: '88000000' }, request(7)))
            .rejects.toMatchObject({ code: '22023', message: expect.stringContaining('Өөр хүнд шилжүүлэх') });
        await expect(transfer(contract, { kind: 'rename', customer_name: 'Дорж С.', customer_registration: null }, request(7)))
            .rejects.toMatchObject({ code: '22023' });
        expect(await snapshot()).toEqual(after);
        // Регистрийн түлхүүр locale-оос үл хамааран кирилл үсгийг томруулж, зайг хасна.
        expect((await db.query<{ key: string }>("SELECT contract_registration_key(' уб 99 0101өү ') AS key")).rows).toEqual([{ key: 'УБ990101ӨҮ' }]);

        // Шилжүүлсэн гэрээнд төлбөр хэвийн бүртгэгдэж, дүн нь нэг гэрээнд хуримтлагдана.
        await db.query('SELECT mutate_contract_payment($1::uuid,$2::uuid,NULL,$3::jsonb,$4::uuid)', [shop, contract, JSON.stringify({
            due_date: '2026-07-01', amount: 1000000, paid_amount: 1000000, payment_method: 'bank', receipt_kind: 'installment',
        }), request(50)]);
        expect((await db.query('SELECT paid_amount::float8 AS paid, balance::float8 AS balance FROM property_contracts WHERE id = $1', [contract])).rows)
            .toEqual([{ paid: 121000000, balance: 179000000 }]);

        // Утсаар таарсан харилцагчийг дахин үүсгэхгүй, холбоно; нэр засвар харилцагчийг хэвээр үлдээнэ.
        await db.query('INSERT INTO customers (id, shop_id, name, phone, phone_normalized) VALUES ($1,$2,$3,$4,$5)', [existing, shop, 'Ганаа', '+976 9900-1122', '99001122']);
        const back = await transfer(contract, {
            kind: 'transfer', customer_name: 'Ганаа Тулга', customer_registration: 'AB1234567', customer_phone: '99001122',
            phone_normalized: '99001122', reason: 'Дахин шилжүүлэв', expected_customer_name: 'Дорж Сараа',
        }, request(3));
        expect(back).toMatchObject({ to_customer_id: existing, customer_created: false, effective_date: await today(), to_first_name: null });
        await expect(transfer(contract, { kind: 'rename', customer_name: 'Ганаа Тулга' }, request(4))).rejects.toMatchObject({ code: '22023' });
        const renamed = await transfer(contract, { kind: 'rename', customer_name: 'Тулга Ганбаатар', customer_last_name: 'Ганбаатар' }, request(5));
        expect(renamed).toMatchObject({ kind: 'rename', to_customer_id: existing, to_registration: 'AB1234567', to_phone: '99001122', customer_created: false });
        expect((await db.query('SELECT content FROM lead_activities ORDER BY created_at DESC LIMIT 1')).rows)
            .toEqual([{ content: 'Гэрээ MG-101 эзэмшигчийн нэр засав: Ганаа Тулга → Тулга Ганбаатар' }]);
        expect((await db.query('SELECT name FROM customers WHERE id = $1', [existing])).rows).toEqual([{ name: 'Ганаа' }]);
        expect((await db.query('SELECT count(*)::int AS n FROM contract_transfers WHERE contract_id = $1', [contract])).rows).toEqual([{ n: 3 }]);
        expect((await db.query('SELECT count(*)::int AS n FROM customers')).rows).toEqual([{ n: 3 }]);

        // Түүхийг засах, устгах боломжгүй (append-only).
        await expect(db.query("UPDATE contract_transfers SET to_customer_name = 'X'")).rejects.toMatchObject({ code: '42501' });
        await expect(db.query('DELETE FROM contract_transfers')).rejects.toMatchObject({ code: '42501' });
    } finally { await db.close(); }
}, 30_000);

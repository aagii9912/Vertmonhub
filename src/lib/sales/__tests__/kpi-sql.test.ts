// @vitest-environment node
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { expect, it } from 'vitest';

it('stores KPI plans per roster manager and excludes cancelled contracts from manager views', async () => {
    const db = new PGlite();
    const shop = '20000000-0000-4000-8000-000000000001';
    try {
        await db.exec(`
            CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
            CREATE TABLE shops (id uuid PRIMARY KEY);
            CREATE TABLE sales_managers (shop_id uuid REFERENCES shops(id), name text NOT NULL, is_active boolean, UNIQUE (shop_id, name));
            CREATE TABLE property_contracts (id serial PRIMARY KEY, shop_id uuid, sales_manager text, contract_date date, contract_status text,
                total_price numeric, paid_amount numeric, balance numeric, customer_registration text, deleted_at timestamptz);
            GRANT USAGE ON SCHEMA public TO service_role, authenticated;
        `);
        await db.query('INSERT INTO shops VALUES ($1)', [shop]);
        await db.query(`INSERT INTO sales_managers VALUES ($1, 'Номин', true)`, [shop]);
        await db.query(`INSERT INTO property_contracts (shop_id, sales_manager, contract_date, contract_status, total_price, paid_amount, balance)
            VALUES ($1,'Номин','2026-10-03','active',100,40,60), ($1,'Номин','2026-10-04','cancelled',900,0,900),
                   ($1,'Номин','2026-10-05','closed',50,50,0), ($1,'Номин','2026-10-06','active',70,0,70)`, [shop]);
        await db.query(`UPDATE property_contracts SET deleted_at = now() WHERE total_price = 70`);
        for (const file of ['20261004145000_manager_views_exclude_cancelled.sql', '20261004150000_sales_kpi_months.sql']) {
            const sql = readFileSync(`supabase/migrations/${file}`, 'utf8');
            await db.exec(sql);
            await db.exec(sql);
        }
        expect((await db.query('SELECT contract_count::int, closed_count::int, total_sales::int FROM manager_performance')).rows)
            .toEqual([{ contract_count: 2, closed_count: 1, total_sales: 150 }]);
        expect((await db.query('SELECT year, month, actual_amount::int, contract_count::int FROM manager_monthly_sales')).rows)
            .toEqual([{ year: 2026, month: 10, actual_amount: 150, contract_count: 2 }]);

        await db.exec('SET ROLE authenticated');
        await expect(db.query('SELECT * FROM sales_kpi_months')).rejects.toMatchObject({ code: '42501' });
        await db.exec('RESET ROLE; SET ROLE service_role');
        await db.query(`INSERT INTO sales_kpi_months (shop_id, year, month, manager_name, plans) VALUES ($1, 2026, 10, 'Номин', '{"contract_amount": 900000000}')`, [shop]);
        await expect(db.query(`INSERT INTO sales_kpi_months (shop_id, year, month, manager_name) VALUES ($1, 2026, 10, 'Бүртгэлгүй')`, [shop]))
            .rejects.toMatchObject({ code: '23503' });
        await expect(db.query(`INSERT INTO sales_kpi_months (shop_id, year, month, manager_name, plans) VALUES ($1, 2026, 11, 'Номин', '[]')`, [shop]))
            .rejects.toMatchObject({ code: '23514' });
        await db.exec('RESET ROLE');
        // Менежерийн нэр солигдвол KPI мөр дагана.
        await db.query(`UPDATE sales_managers SET name = 'Номин.Од' WHERE name = 'Номин'`);
        expect((await db.query('SELECT manager_name, plans FROM sales_kpi_months')).rows).toEqual([{ manager_name: 'Номин.Од', plans: { contract_amount: 900000000 } }]);
    } finally { await db.close(); }
}, 20_000);

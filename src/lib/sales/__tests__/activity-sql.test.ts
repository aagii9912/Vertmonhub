// @vitest-environment node
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { expect, it } from 'vitest';

it('adds the daily activity columns idempotently without touching existing rows', async () => {
    const db = new PGlite();
    const shop = '20000000-0000-4000-8000-000000000001';
    try {
        await db.exec(`
            CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
            CREATE TABLE shops (id uuid PRIMARY KEY);
            CREATE TABLE sales_managers (shop_id uuid REFERENCES shops(id), name text NOT NULL, is_active boolean, UNIQUE (shop_id, name));
            CREATE TABLE service_logs (id serial PRIMARY KEY, shop_id uuid NOT NULL REFERENCES shops(id), subject text NOT NULL,
                status varchar(20) DEFAULT 'open', assigned_to varchar(255), resolved_at timestamptz, created_at timestamptz DEFAULT now());
            CREATE TABLE lead_activities (id serial PRIMARY KEY, shop_id uuid NOT NULL, lead_id uuid, type text NOT NULL,
                created_by uuid, created_by_name text, created_at timestamptz NOT NULL DEFAULT now());
            GRANT USAGE ON SCHEMA public TO service_role, authenticated;
        `);
        await db.query('INSERT INTO shops VALUES ($1)', [shop]);
        await db.query(`INSERT INTO sales_managers VALUES ($1, 'Номин', true)`, [shop]);
        await db.query(`INSERT INTO service_logs (shop_id, subject, assigned_to) VALUES ($1, 'Хуучин гомдол', 'Номин Бат')`, [shop]);
        await db.exec(readFileSync('supabase/migrations/20261004150000_sales_kpi_months.sql', 'utf8'));
        await db.query(`INSERT INTO sales_kpi_months (shop_id, year, month, manager_name, plans) VALUES ($1, 2026, 10, 'Номин', '{"new_meetings": 10}')`, [shop]);

        const sql = readFileSync('supabase/migrations/20261004163000_manager_activity_kpi.sql', 'utf8');
        await db.exec(sql);
        await db.exec(sql);

        // Хуучин мөр: хариуцагч хоосон, өдрийн зорилт хоосон объект (backfill хийхгүй).
        expect((await db.query('SELECT manager_name, resolved_by, assigned_to FROM service_logs')).rows)
            .toEqual([{ manager_name: null, resolved_by: null, assigned_to: 'Номин Бат' }]);
        expect((await db.query('SELECT daily FROM sales_kpi_months')).rows).toEqual([{ daily: {} }]);

        await db.query(`UPDATE service_logs SET manager_name = 'Номин'`);
        await expect(db.query(`UPDATE service_logs SET manager_name = ' Номин '`)).rejects.toMatchObject({ code: '23514' });
        await expect(db.query(`UPDATE service_logs SET manager_name = ''`)).rejects.toMatchObject({ code: '23514' });
        await db.query(`UPDATE sales_kpi_months SET daily = '{"calls": 20, "meetings": 2}'`);
        await expect(db.query(`UPDATE sales_kpi_months SET daily = '[]'`)).rejects.toMatchObject({ code: '23514' });

        const indexes = (await db.query<{ indexname: string; indexdef: string }>(
            `SELECT indexname, indexdef FROM pg_indexes WHERE indexname IN ('idx_lead_activities_shop_calls', 'idx_service_logs_shop_manager') ORDER BY indexname`)).rows;
        expect(indexes.map(row => row.indexname)).toEqual(['idx_lead_activities_shop_calls', 'idx_service_logs_shop_manager']);
        expect(indexes[0].indexdef).toContain(`WHERE (type = 'call'::text)`);
        expect((await db.query(`SELECT count(*)::int AS n FROM pg_constraint WHERE conname IN ('service_logs_manager_name_check', 'sales_kpi_months_daily_object')`)).rows)
            .toEqual([{ n: 2 }]);

        // Business бичилт серверийнх хэвээр: authenticated KPI хүснэгтийг уншихгүй.
        await db.exec('SET ROLE authenticated');
        await expect(db.query('SELECT daily FROM sales_kpi_months')).rejects.toMatchObject({ code: '42501' });
        await db.exec('RESET ROLE');
    } finally { await db.close(); }
}, 20_000);

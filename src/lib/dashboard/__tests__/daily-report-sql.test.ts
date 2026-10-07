// @vitest-environment node
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { expect, it } from 'vitest';

const shop = '40000000-0000-4000-8000-000000000001';
const migration = readFileSync('supabase/migrations/20261007120000_daily_reports.sql', 'utf8');

it('daily report tables are idempotent, service-role only and enforce one cell per day, manager and metric', async () => {
    const db = new PGlite();
    const insertCount = (manager: string, metric: string, value: number) => db.exec(`INSERT INTO public.daily_report_counts(shop_id,report_date,manager_name,metric,value)
        VALUES ('${shop}','2026-09-30','${manager}','${metric}',${value})`);
    try {
        await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
            GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
            ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
            CREATE TABLE public.shops(id uuid PRIMARY KEY);
            INSERT INTO public.shops VALUES ('${shop}');`);
        await db.exec(migration);
        await db.exec('SET ROLE service_role');
        await insertCount('Чанцалдулам.Раднаа', 'call.l1.new', 2);
        await db.exec('RESET ROLE');
        await db.exec(migration); // Дахин ажиллуулахад өгөгдөл хэвээр.
        expect((await db.query('SELECT count(*)::int AS n FROM public.daily_report_counts')).rows).toEqual([{ n: 1 }]);

        for (const role of ['anon', 'authenticated']) {
            await db.exec(`SET ROLE ${role}`);
            for (const table of ['daily_report_settings', 'daily_report_counts', 'daily_reports']) {
                await expect(db.exec(`SELECT * FROM public.${table}`)).rejects.toThrow(/permission denied/);
            }
            await db.exec('RESET ROLE');
        }

        await db.exec('SET ROLE service_role');
        await expect(insertCount('Чанцалдулам.Раднаа', 'call.l1.new', 3)).rejects.toThrow(/duplicate key/);
        await expect(insertCount('Чанцалдулам.Раднаа', 'meeting.new', 1)).rejects.toThrow(/check/);
        await expect(insertCount('Чанцалдулам.Раднаа', 'chat.page', -1)).rejects.toThrow(/check/);
        await expect(insertCount(' Чанцалдулам', 'chat.page', 1)).rejects.toThrow(/check/);
        await insertCount('Хонгорзул.Мөнхгэрэл', 'call.l2.total', 0);
        await insertCount('Хонгорзул.Мөнхгэрэл', 'chat.personal', 10000);
        await expect(db.exec(`INSERT INTO public.daily_reports(shop_id,report_date,notes) VALUES ('${shop}','2026-09-30','[]')`)).rejects.toThrow(/check/);
        await db.exec(`INSERT INTO public.daily_reports(shop_id,report_date,notes) VALUES ('${shop}','2026-09-30','{}')`);
        await db.exec(`INSERT INTO public.daily_report_settings(shop_id,config) VALUES ('${shop}','{"lines":[]}')`);
        await db.exec('RESET ROLE');
        // Төсөл устгахад тайлан хамт устна.
        await db.exec(`DELETE FROM public.shops WHERE id = '${shop}'`);
        expect((await db.query(`SELECT (SELECT count(*) FROM public.daily_report_counts)::int AS counts,
            (SELECT count(*) FROM public.daily_reports)::int AS reports, (SELECT count(*) FROM public.daily_report_settings)::int AS settings`)).rows)
            .toEqual([{ counts: 0, reports: 0, settings: 0 }]);
    } finally {
        await db.close();
    }
});

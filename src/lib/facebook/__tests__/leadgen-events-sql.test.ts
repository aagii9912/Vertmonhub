// @vitest-environment node
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { expect, it } from 'vitest';

it('meta_leadgen_events is idempotent, service-role only, PII-free and keeps one row per leadgen_id', async () => {
    const db = new PGlite();
    const shop = '40000000-0000-4000-8000-000000000001';
    const lead = '50000000-0000-4000-8000-000000000001';
    const insert = (values: string) => db.exec(`INSERT INTO public.meta_leadgen_events(leadgen_id,page_id,shop_id,lead_id,status,reason,origin) VALUES ${values}`);
    try {
        await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
            CREATE TABLE public.shops(id uuid PRIMARY KEY);
            CREATE TABLE public.leads(id uuid PRIMARY KEY, shop_id uuid REFERENCES public.shops(id));
            INSERT INTO public.shops VALUES ('${shop}');
            INSERT INTO public.leads VALUES ('${lead}', '${shop}');
            GRANT ALL ON public.shops, public.leads TO service_role;`);
        const migration = readFileSync('supabase/migrations/20261005160000_meta_leadgen_events.sql', 'utf8');
        await db.exec(migration);
        await db.exec('SET ROLE service_role');
        await insert(`('9001','1111','${shop}','${lead}','saved',NULL,'webhook'),('9002','1111',NULL,NULL,'skipped','page_not_connected','webhook')`);
        await db.exec('RESET ROLE');
        await db.exec(migration); // Дахин ажиллуулахад мөр хэвээр.
        expect((await db.query('SELECT count(*)::int AS n FROM public.meta_leadgen_events')).rows).toEqual([{ n: 2 }]);

        for (const role of ['anon', 'authenticated']) {
            await db.exec(`SET ROLE ${role}`);
            await expect(db.exec('SELECT * FROM public.meta_leadgen_events')).rejects.toThrow(/permission denied/);
            await expect(insert(`('9003','1111',NULL,NULL,'failed','db_error','webhook')`)).rejects.toThrow(/permission denied/);
            await db.exec('RESET ROLE');
        }

        await db.exec('SET ROLE service_role');
        // Webhook-ийн дахин илгээлт / backfill нь ижил leadgen_id-ийн мөрийг шинэчилнэ.
        await db.exec(`INSERT INTO public.meta_leadgen_events(leadgen_id,page_id,shop_id,status,reason,origin)
            VALUES ('9002','1111','${shop}','saved',NULL,'backfill')
            ON CONFLICT (leadgen_id) DO UPDATE SET shop_id = excluded.shop_id, status = excluded.status, reason = excluded.reason, origin = excluded.origin`);
        expect((await db.query(`SELECT status, origin FROM public.meta_leadgen_events WHERE leadgen_id = '9002'`)).rows).toEqual([{ status: 'saved', origin: 'backfill' }]);

        await expect(insert(`('abc','1111',NULL,NULL,'failed','db_error','webhook')`)).rejects.toThrow(/check constraint/);
        await expect(insert(`('9004','page-1',NULL,NULL,'failed','db_error','webhook')`)).rejects.toThrow(/check constraint/);
        await expect(insert(`('9005','1111',NULL,NULL,'saved','db_error','webhook')`)).rejects.toThrow(/status_reason_check/);
        await expect(insert(`('9006','1111',NULL,NULL,'failed',NULL,'webhook')`)).rejects.toThrow(/status_reason_check/);
        await expect(insert(`('9007','1111',NULL,NULL,'failed','Bad Reason!','webhook')`)).rejects.toThrow(/check constraint/);
        await expect(insert(`('9008','1111',NULL,NULL,'failed','db_error','cron')`)).rejects.toThrow(/check constraint/);
        // Харилцагчийн хувийн мэдээллийн багана байхгүй.
        const columns = (await db.query<{ column_name: string }>(`SELECT column_name FROM information_schema.columns WHERE table_name = 'meta_leadgen_events'`)).rows.map(r => r.column_name);
        expect(columns.some(c => /name|phone|email|field/.test(c))).toBe(false);

        await db.exec('RESET ROLE');
        await db.exec(`DELETE FROM public.leads WHERE id = '${lead}'`);
        expect((await db.query(`SELECT lead_id FROM public.meta_leadgen_events WHERE leadgen_id = '9001'`)).rows).toEqual([{ lead_id: null }]);
        await db.exec(`DELETE FROM public.shops WHERE id = '${shop}'`);
        expect((await db.query('SELECT count(*)::int AS n FROM public.meta_leadgen_events')).rows).toEqual([{ n: 0 }]);
    } finally {
        await db.close();
    }
});

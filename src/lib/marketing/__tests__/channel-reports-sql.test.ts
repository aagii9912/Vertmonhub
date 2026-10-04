// @vitest-environment node
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { expect, it } from 'vitest';

it('channel report tables are idempotent, service-role only and keep one report per shop, source and period', async () => {
    const db = new PGlite();
    const shop = '40000000-0000-4000-8000-000000000001';
    const otherShop = '40000000-0000-4000-8000-000000000002';
    const insert = (values: string) => db.exec(`INSERT INTO public.marketing_channel_reports(shop_id,source,period_from,period_to,totals,breakdown) VALUES ${values}`);
    try {
        await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
            CREATE TABLE public.shops(id uuid PRIMARY KEY);
            INSERT INTO public.shops VALUES ('${shop}'),('${otherShop}');
            GRANT ALL ON public.shops TO service_role;`);
        const migration = readFileSync('supabase/migrations/20261004140000_marketing_channel_reports.sql', 'utf8');
        await db.exec(migration);
        await db.exec('SET ROLE service_role');
        await insert(`('${shop}','meta_ads','2026-09-23','2026-09-29','{"reach":100,"currency":"USD"}','[]')`);
        await db.exec('RESET ROLE');
        await db.exec(migration); // Дахин ажиллуулахад хадгалсан тайлан хэвээр.
        expect((await db.query('SELECT count(*)::int AS n FROM public.marketing_channel_reports')).rows).toEqual([{ n: 1 }]);

        for (const role of ['anon', 'authenticated']) {
            await db.exec(`SET ROLE ${role}`);
            await expect(db.exec('SELECT * FROM public.marketing_channel_reports')).rejects.toThrow(/permission denied/);
            await expect(db.exec('SELECT * FROM public.marketing_channel_mappings')).rejects.toThrow(/permission denied/);
            await expect(insert(`('${shop}','sms','2026-09-23','2026-09-29','{}','[]')`)).rejects.toThrow(/permission denied/);
            await db.exec('RESET ROLE');
        }

        await db.exec('SET ROLE service_role');
        // Ижил хугацааг дахин импортлох нь upsert — мөр нэмэгдэхгүй, updated_at шинэчлэгдэнэ.
        const before = (await db.query<{ updated_at: string }>('SELECT updated_at FROM public.marketing_channel_reports')).rows[0].updated_at;
        await db.exec(`INSERT INTO public.marketing_channel_reports(shop_id,source,period_from,period_to,totals)
            VALUES ('${shop}','meta_ads','2026-09-23','2026-09-29','{"reach":250}')
            ON CONFLICT (shop_id,source,period_from,period_to) DO UPDATE SET totals = excluded.totals`);
        const rows = (await db.query<{ totals: { reach: number }; updated_at: string }>('SELECT totals,updated_at FROM public.marketing_channel_reports')).rows;
        expect(rows).toHaveLength(1);
        expect(rows[0].totals).toEqual({ reach: 250 });
        expect(new Date(rows[0].updated_at).getTime()).toBeGreaterThanOrEqual(new Date(before).getTime());
        await insert(`('${otherShop}','meta_ads','2026-09-23','2026-09-29','{}','[]'),('${shop}','callpro','2026-09-23','2026-09-29','{}','[]')`);

        await expect(insert(`('${shop}','tiktok','2026-09-23','2026-09-29','{}','[]')`)).rejects.toThrow(/check constraint/);
        await expect(insert(`('${shop}','sms','2026-09-29','2026-09-23','{}','[]')`)).rejects.toThrow(/period_check/);
        await expect(insert(`('${shop}','sms','2026-06-01','2026-09-02','{}','[]')`)).rejects.toThrow(/period_check/);
        await insert(`('${shop}','sms','2026-06-01','2026-09-01','{}','[]')`); // 92 хоногийн зөрүү зөвшөөрнө.
        await expect(insert(`('${shop}','facebook_page','2026-09-23','2026-09-29','[]','[]')`)).rejects.toThrow(/check constraint/);
        await expect(insert(`('${shop}','facebook_page','2026-09-23','2026-09-29','{}','{}')`)).rejects.toThrow(/check constraint/);
        const tooMany = JSON.stringify(Array.from({ length: 501 }, (_, i) => ({ kind: 'group', label: String(i), values: {} })));
        await expect(insert(`('${shop}','facebook_page','2026-09-23','2026-09-29','{}','${tooMany}')`)).rejects.toThrow(/check constraint/);
        await expect(db.exec(`INSERT INTO public.marketing_channel_reports(shop_id,source,period_from,period_to)
            VALUES ('40000000-0000-4000-8000-000000000009','sms','2026-09-23','2026-09-29')`)).rejects.toThrow(/foreign key/);

        await db.exec(`INSERT INTO public.marketing_channel_mappings(shop_id,source,mapping,header_signature)
            VALUES ('${shop}','callpro','{"Хариулсан":"answered"}','abc')
            ON CONFLICT (shop_id,source) DO UPDATE SET mapping = excluded.mapping`);
        await db.exec(`INSERT INTO public.marketing_channel_mappings(shop_id,source,mapping,header_signature)
            VALUES ('${shop}','callpro','{"Алдсан":"missed"}','def')
            ON CONFLICT (shop_id,source) DO UPDATE SET mapping = excluded.mapping, header_signature = excluded.header_signature`);
        expect((await db.query('SELECT mapping,header_signature FROM public.marketing_channel_mappings')).rows)
            .toEqual([{ mapping: { 'Алдсан': 'missed' }, header_signature: 'def' }]);
        await expect(db.exec(`INSERT INTO public.marketing_channel_mappings(shop_id,source,mapping) VALUES ('${shop}','sms','[]')`)).rejects.toThrow(/check constraint/);

        // Shop устгагдвал тайлан, холболт хамт устна.
        await db.exec('RESET ROLE');
        await db.exec(`DELETE FROM public.shops WHERE id = '${shop}'`);
        expect((await db.query('SELECT shop_id FROM public.marketing_channel_reports')).rows).toEqual([{ shop_id: otherShop }]);
        expect((await db.query('SELECT * FROM public.marketing_channel_mappings')).rows).toEqual([]);
        expect((await db.query<{ relrowsecurity: boolean }>(`SELECT relrowsecurity FROM pg_class WHERE relname IN ('marketing_channel_reports','marketing_channel_mappings')`)).rows)
            .toEqual([{ relrowsecurity: true }, { relrowsecurity: true }]);
    } finally { await db.close(); }
}, 20_000);

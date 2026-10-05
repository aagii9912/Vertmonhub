// @vitest-environment node
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { expect, it } from 'vitest';

const shop = '40000000-0000-4000-8000-000000000001';
const otherShop = '40000000-0000-4000-8000-000000000002';
const migration = (name: string) => readFileSync(`supabase/migrations/${name}.sql`, 'utf8');

/**
 * Supabase-тай адил орчин: anon/authenticated/service_role ба анхдагч эрх — postgres-ийн шинэ хүснэгт,
 * функцэд гурвуулаа бүрэн эрхтэй. Тиймээс anon-ийн «permission denied» нь миграцийн REVOKE-оос л хамаарна.
 */
async function supabaseLike(db: PGlite) {
    await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
        GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
        ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
        ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon, authenticated, service_role;
        CREATE TABLE public.shops(id uuid PRIMARY KEY);
        INSERT INTO public.shops VALUES ('${shop}'),('${otherShop}');`);
}

it('channel report tables are idempotent, service-role only and keep one report per shop, source and period', async () => {
    const db = new PGlite();
    const insert = (values: string) => db.exec(`INSERT INTO public.marketing_channel_reports(shop_id,source,period_from,period_to,totals,breakdown) VALUES ${values}`);
    try {
        await supabaseLike(db);
        // Анхдагч эрх идэвхтэй: REVOKE хийгээгүй хүснэгтэд anon хандана.
        expect((await db.query(`SELECT has_table_privilege('anon', 'public.shops', 'SELECT') AS anon`)).rows).toEqual([{ anon: true }]);
        const base = migration('20261004140000_marketing_channel_reports');
        await db.exec(base);
        await db.exec('SET ROLE service_role');
        await insert(`('${shop}','meta_ads','2026-09-23','2026-09-29','{"reach":100,"currency":"USD"}','[]')`);
        await db.exec('RESET ROLE');
        await db.exec(base); // Дахин ажиллуулахад хадгалсан тайлан хэвээр.
        expect((await db.query('SELECT count(*)::int AS n FROM public.marketing_channel_reports')).rows).toEqual([{ n: 1 }]);

        for (const role of ['anon', 'authenticated']) {
            await db.exec(`SET ROLE ${role}`);
            await expect(db.exec('SELECT * FROM public.marketing_channel_reports')).rejects.toThrow(/permission denied/);
            await expect(db.exec('SELECT * FROM public.marketing_channel_mappings')).rejects.toThrow(/permission denied/);
            await expect(insert(`('${shop}','sms','2026-09-23','2026-09-29','{}','[]')`)).rejects.toThrow(/permission denied/);
            await db.exec('RESET ROLE');
        }
        expect((await db.query(`SELECT has_table_privilege('authenticated', 'public.marketing_channel_reports', 'SELECT,INSERT,UPDATE,DELETE') AS reports,
            has_table_privilege('anon', 'public.marketing_channel_mappings', 'SELECT,INSERT,UPDATE,DELETE') AS mappings,
            has_function_privilege('anon', 'public.touch_marketing_channel_row()', 'EXECUTE') AS touch,
            has_table_privilege('service_role', 'public.marketing_channel_reports', 'SELECT,INSERT,UPDATE,DELETE') AS service`)).rows)
            .toEqual([{ reports: false, mappings: false, touch: false, service: true }]);

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

        // 20261005120000: эх сурвалж (file/api) ба өгөгдөл хамарсан өдрүүд — хуучин мөр 'file', хамралт тодорхойгүй.
        await db.exec('RESET ROLE');
        const origin = migration('20261005120000_channel_reports_origin');
        await db.exec(origin);
        await db.exec(origin);
        expect((await db.query(`SELECT origin, data_from, data_to FROM public.marketing_channel_reports WHERE shop_id = '${shop}' AND source = 'meta_ads'`)).rows)
            .toEqual([{ origin: 'file', data_from: null, data_to: null }]);
        await db.exec('SET ROLE service_role');
        const week = (values: string) => db.exec(`INSERT INTO public.marketing_channel_reports(shop_id,source,period_from,period_to,origin,data_from,data_to) VALUES ${values}`);
        // Хурлын долоо хоногоор хуваасан файл: долоо хоног бүр бүтэн хугацаатай, өгөгдөл 6/7 өдөр.
        await week(`('${shop}','meta_ads','2026-09-16','2026-09-22','file','2026-09-16','2026-09-22'),('${shop}','meta_ads','2026-09-30','2026-10-06','api','2026-09-30','2026-10-05')`);
        await expect(week(`('${shop}','meta_ads','2026-10-07','2026-10-13','csv',null,null)`)).rejects.toThrow(/origin_check/);
        await expect(week(`('${shop}','meta_ads','2026-10-07','2026-10-13','file','2026-10-06','2026-10-13')`)).rejects.toThrow(/data_range_check/);
        await expect(week(`('${shop}','meta_ads','2026-10-07','2026-10-13','file','2026-10-07','2026-10-14')`)).rejects.toThrow(/data_range_check/);
        await expect(week(`('${shop}','meta_ads','2026-10-07','2026-10-13','file','2026-10-09',null)`)).rejects.toThrow(/data_range_check/);
        await expect(week(`('${shop}','meta_ads','2026-10-07','2026-10-13','file','2026-10-10','2026-10-09')`)).rejects.toThrow(/data_range_check/);
        // ON CONFLICT нь хугацаагаар нэг мөр хэвээр.
        await db.exec(`INSERT INTO public.marketing_channel_reports(shop_id,source,period_from,period_to,origin,data_from,data_to)
            VALUES ('${shop}','meta_ads','2026-09-16','2026-09-22','file','2026-09-17','2026-09-22')
            ON CONFLICT (shop_id,source,period_from,period_to) DO UPDATE SET data_from = excluded.data_from, data_to = excluded.data_to`);
        expect((await db.query(`SELECT count(*)::int AS n, min(data_from)::text AS data_from FROM public.marketing_channel_reports WHERE period_from = '2026-09-16'`)).rows)
            .toEqual([{ n: 1, data_from: '2026-09-17' }]);

        // 20261005140000: API-ийн тайланг файлаар дарахыг өгөгдлийн сан ч татгалзана (route-ийн шалгалтын дараах race).
        await db.exec('RESET ROLE');
        const guard = migration('20261005140000_channel_reports_api_guard');
        await db.exec(guard);
        await db.exec(guard);
        expect((await db.query(`SELECT has_function_privilege('authenticated', 'public.keep_api_marketing_channel_report()', 'EXECUTE') AS guard`)).rows).toEqual([{ guard: false }]);
        await db.exec('SET ROLE service_role');
        const save = (origin: string, week: string, to: string) => `('${shop}','meta_ads','${week}','${to}','${origin}','${week}','${to}')`;
        const upsert = (values: string) => db.exec(`INSERT INTO public.marketing_channel_reports(shop_id,source,period_from,period_to,origin,data_from,data_to)
            VALUES ${values} ON CONFLICT (shop_id,source,period_from,period_to) DO UPDATE SET origin = excluded.origin, data_from = excluded.data_from, data_to = excluded.data_to`);
        // Файлын хоёр долоо хоногийн нэг нь API-ийнх бол бүх statement буцна — файлын долоо хоног ч өөрчлөгдөхгүй.
        await expect(upsert(`${save('file', '2026-09-16', '2026-09-22')},${save('file', '2026-09-30', '2026-10-06')}`)).rejects.toThrow(/channel_report_api_locked/);
        expect((await db.query(`SELECT period_from::text, origin, data_from::text FROM public.marketing_channel_reports WHERE shop_id = '${shop}' AND source = 'meta_ads' AND period_from IN ('2026-09-16','2026-09-30','2026-10-07') ORDER BY period_from`)).rows)
            .toEqual([{ period_from: '2026-09-16', origin: 'file', data_from: '2026-09-17' }, { period_from: '2026-09-30', origin: 'api', data_from: '2026-09-30' }]);
        await expect(db.exec(`UPDATE public.marketing_channel_reports SET origin = 'file' WHERE origin = 'api'`)).rejects.toThrow(/channel_report_api_locked/);
        // Хуучин кодын upsert (origin, data_from/data_to илгээдэггүй) origin-ийг 'api' хэвээр үлдээнэ — file_name,
        // content_hash-аар нь танина. Route-ийн isApiReportLockError таних код, мессеж.
        const legacy = (week: string, to: string) => db.exec(`INSERT INTO public.marketing_channel_reports(shop_id,source,period_from,period_to,file_name,content_hash,totals,breakdown,mapping,warnings,row_count,note,imported_by)
            VALUES ('${shop}','meta_ads','${week}','${to}','export.csv','${'a'.repeat(64)}','{"spend":1}','[]','{}','[]',1,null,null)
            ON CONFLICT (shop_id,source,period_from,period_to) DO UPDATE SET file_name = excluded.file_name, content_hash = excluded.content_hash, totals = excluded.totals,
                breakdown = excluded.breakdown, mapping = excluded.mapping, warnings = excluded.warnings, row_count = excluded.row_count, note = excluded.note, imported_by = excluded.imported_by`);
        await expect(legacy('2026-09-30', '2026-10-06')).rejects.toMatchObject({ code: '23514', message: expect.stringMatching(/^channel_report_api_locked: meta_ads 2026-09-30 – 2026-10-06/) });
        await expect(db.exec(`UPDATE public.marketing_channel_reports SET content_hash = '${'b'.repeat(64)}' WHERE origin = 'api'`)).rejects.toThrow(/channel_report_api_locked/);
        expect((await db.query(`SELECT origin, file_name, content_hash, totals FROM public.marketing_channel_reports WHERE shop_id = '${shop}' AND source = 'meta_ads' AND period_from = '2026-09-30'`)).rows)
            .toEqual([{ origin: 'api', file_name: null, content_hash: null, totals: {} }]);
        // API синк файлын тайланг орлож, өөрийгөө шинэчилж болно; файл файлаа шинэчилнэ.
        await upsert(`${save('api', '2026-09-16', '2026-09-22')},${save('api', '2026-09-30', '2026-10-06')}`);
        await upsert(save('file', '2026-10-07', '2026-10-13'));
        await upsert(save('file', '2026-10-07', '2026-10-13'));
        expect((await db.query(`SELECT period_from::text, origin FROM public.marketing_channel_reports WHERE shop_id = '${shop}' AND source = 'meta_ads' AND period_from IN ('2026-09-16','2026-09-30','2026-10-07') ORDER BY period_from`)).rows)
            .toEqual([{ period_from: '2026-09-16', origin: 'api' }, { period_from: '2026-09-30', origin: 'api' }, { period_from: '2026-10-07', origin: 'file' }]);
        // Хуучин код файлаа файлаар шинэчилнэ; API синк (file_name, content_hash = NULL) файлын тайланг орлоно.
        await legacy('2026-10-14', '2026-10-20');
        await legacy('2026-10-14', '2026-10-20');
        await db.exec(`INSERT INTO public.marketing_channel_reports(shop_id,source,period_from,period_to,origin,data_from,data_to,file_name,content_hash,mapping,imported_by,note,totals,breakdown,warnings,row_count)
            VALUES ('${shop}','meta_ads','2026-10-14','2026-10-20','api','2026-10-14','2026-10-16',null,null,'{}',null,null,'{"spend":7}','[]','[]',3)
            ON CONFLICT (shop_id,source,period_from,period_to) DO UPDATE SET origin = excluded.origin, data_from = excluded.data_from, data_to = excluded.data_to,
                file_name = excluded.file_name, content_hash = excluded.content_hash, mapping = excluded.mapping, imported_by = excluded.imported_by, note = excluded.note,
                totals = excluded.totals, breakdown = excluded.breakdown, warnings = excluded.warnings, row_count = excluded.row_count`);
        expect((await db.query(`SELECT origin, file_name, content_hash, totals FROM public.marketing_channel_reports WHERE shop_id = '${shop}' AND period_from = '2026-10-14'`)).rows)
            .toEqual([{ origin: 'api', file_name: null, content_hash: null, totals: { spend: 7 } }]);
        // Солих арга: хэрэглэгч API-ийн тайланг устгаад (DELETE-д trigger алга) файлаар оруулна.
        await db.exec(`DELETE FROM public.marketing_channel_reports WHERE period_from = '2026-09-30'`);
        await upsert(save('file', '2026-09-30', '2026-10-06'));
        await legacy('2026-09-30', '2026-10-06');
        expect((await db.query(`SELECT origin, file_name FROM public.marketing_channel_reports WHERE shop_id = '${shop}' AND period_from = '2026-09-30'`)).rows)
            .toEqual([{ origin: 'file', file_name: 'export.csv' }]);

        // Shop устгагдвал тайлан, холболт хамт устна.
        await db.exec('RESET ROLE');
        await db.exec(`DELETE FROM public.shops WHERE id = '${shop}'`);
        expect((await db.query('SELECT shop_id FROM public.marketing_channel_reports')).rows).toEqual([{ shop_id: otherShop }]);
        expect((await db.query('SELECT * FROM public.marketing_channel_mappings')).rows).toEqual([]);
        expect((await db.query<{ relrowsecurity: boolean }>(`SELECT relrowsecurity FROM pg_class WHERE relname IN ('marketing_channel_reports','marketing_channel_mappings')`)).rows)
            .toEqual([{ relrowsecurity: true }, { relrowsecurity: true }]);
    } finally { await db.close(); }
}, 20_000);

it('refuses to apply the API guard before the origin column exists', async () => {
    const db = new PGlite();
    try {
        await supabaseLike(db);
        await db.exec(migration('20261004140000_marketing_channel_reports'));
        // 20261005120000-гүйгээр trigger үүсвэл дараагийн upsert бүр «record "old" has no field "origin"»-оор унана — оронд нь шууд зогсоно.
        await expect(db.exec(migration('20261005140000_channel_reports_api_guard'))).rejects.toThrow(/20261005120000_channel_reports_origin\.sql/);
        expect((await db.query(`SELECT to_regprocedure('public.keep_api_marketing_channel_report()') IS NULL AS absent,
            (SELECT count(*)::int FROM pg_trigger WHERE tgname = 'marketing_channel_reports_keep_api') AS triggers`)).rows).toEqual([{ absent: true, triggers: 0 }]);
        await db.exec(migration('20261005120000_channel_reports_origin'));
        await db.exec(migration('20261005140000_channel_reports_api_guard'));
        expect((await db.query(`SELECT count(*)::int AS n FROM pg_trigger WHERE tgname = 'marketing_channel_reports_keep_api'`)).rows).toEqual([{ n: 1 }]);
    } finally { await db.close(); }
}, 20_000);

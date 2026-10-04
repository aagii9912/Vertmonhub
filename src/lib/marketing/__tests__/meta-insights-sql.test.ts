// @vitest-environment node
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { expect, it } from 'vitest';

const shop = '50000000-0000-4000-8000-000000000001';
const otherShop = '50000000-0000-4000-8000-000000000002';
const thirdShop = '50000000-0000-4000-8000-000000000003';
const insight = (patch: Record<string, unknown> = {}) => ({
    day: '2026-09-23', campaign_id: '11', campaign_name: 'Дуудлага', adset_id: '101', adset_name: 'A', objective: 'OUTCOME_ENGAGEMENT',
    optimization_goal: 'QUALITY_CALL', currency: 'USD', spend: 10.5, impressions: 1000, reach: 800, clicks: 40, inline_link_clicks: 25,
    landing_page_views: 7, calls_placed: 3, result_type: 'calls', result_indicator: 'click_to_call_native_call_placed', results: 3,
    result_source: 'results', actions: [{ action_type: 'click_to_call_native_call_placed', value: 3 }], cost_per_action_type: [], ...patch,
});

it('meta insights migration: one ad account per project, service-role-only daily table and window-replacing RPC', async () => {
    const db = new PGlite();
    const save = (rows: unknown[], options: { tenant?: string; account?: string; from?: string; to?: string } = {}) => db.query<{ n: number }>(
        'SELECT public.save_meta_ad_insights($1,$2,$3,$4,$5::jsonb) AS n',
        [options.tenant ?? shop, options.account ?? 'act_123', options.from ?? '2026-09-23', options.to ?? '2026-09-29', JSON.stringify(rows)]);
    const stored = async (tenant = shop) => (await db.query<{ day: string; adset_id: string; spend: string; results: string | null; result_source: string }>(
        `SELECT to_char(day,'YYYY-MM-DD') AS day, adset_id, spend::text AS spend, results::text AS results, result_source
         FROM public.meta_ad_insights_daily WHERE shop_id = $1 ORDER BY day, adset_id`, [tenant])).rows;
    try {
        await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
            CREATE TABLE public.shops(id uuid PRIMARY KEY, facebook_ad_account_id text);
            INSERT INTO public.shops VALUES ('${shop}','act_123'),('${otherShop}','456'),('${thirdShop}',NULL);
            GRANT USAGE ON SCHEMA public TO service_role;
            GRANT ALL ON public.shops TO service_role;`);
        const migration = readFileSync('supabase/migrations/20261005130000_meta_ad_insights.sql', 'utf8');
        await db.exec(migration);
        await db.exec(migration); // дахин ажиллуулж болно

        // Нэг зарын данс зөвхөн нэг төсөлд: 'act_456' ба '456' ижил данс.
        await expect(db.exec(`UPDATE public.shops SET facebook_ad_account_id = 'act_456' WHERE id = '${thirdShop}'`)).rejects.toMatchObject({ code: '23505' });
        await expect(db.exec(`UPDATE public.shops SET facebook_ad_account_id = '123' WHERE id = '${thirdShop}'`)).rejects.toMatchObject({ code: '23505' });
        await db.exec(`INSERT INTO public.shops VALUES ('50000000-0000-4000-8000-000000000004', NULL)`); // NULL олон байж болно
        await db.exec(`UPDATE public.shops SET facebook_ad_account_id = 'act_789' WHERE id = '${thirdShop}'`);

        for (const role of ['anon', 'authenticated']) {
            await db.exec(`SET ROLE ${role}`);
            await expect(db.exec('SELECT * FROM public.meta_ad_insights_daily')).rejects.toThrow(/permission denied/);
            await expect(db.exec('SELECT * FROM public.meta_insights_sync')).rejects.toThrow(/permission denied/);
            await expect(save([insight()])).rejects.toThrow(/permission denied/);
            await db.exec('RESET ROLE');
        }
        expect((await db.query<{ relname: string; relrowsecurity: boolean }>(
            `SELECT relname, relrowsecurity FROM pg_class WHERE relname IN ('meta_ad_insights_daily','meta_insights_sync') ORDER BY relname`)).rows)
            .toEqual([{ relname: 'meta_ad_insights_daily', relrowsecurity: true }, { relname: 'meta_insights_sync', relrowsecurity: true }]);
        expect((await db.query<{ definer: boolean }>(`SELECT prosecdef AS definer FROM pg_proc WHERE proname = 'save_meta_ad_insights'`)).rows).toEqual([{ definer: false }]);

        await db.exec('SET ROLE service_role');
        // Сонгосон данс биш бол бичихгүй.
        await expect(save([insight()], { account: 'act_456' })).rejects.toMatchObject({ code: '23514' });
        await expect(save([insight()], { tenant: otherShop })).rejects.toMatchObject({ code: '23514' });

        expect((await save([insight(), insight({ adset_id: '102', results: null, result_type: null, result_source: 'goal' }), insight({ day: '2026-09-30' })], { to: '2026-09-30' })).rows).toEqual([{ n: 3 }]);
        expect((await save([insight({ campaign_id: '77', adset_id: '701', currency: 'USD' })], { tenant: otherShop, account: 'act_456' })).rows).toEqual([{ n: 1 }]);
        expect(await stored()).toEqual([
            { day: '2026-09-23', adset_id: '101', spend: '10.500000', results: '3', result_source: 'results' },
            { day: '2026-09-23', adset_id: '102', spend: '10.500000', results: null, result_source: 'goal' },
            { day: '2026-09-30', adset_id: '101', spend: '10.500000', results: '3', result_source: 'results' },
        ]);

        // Цонхыг бүхэлд нь солино (Meta засварласан/арилсан мөр); цонхноос гадуурх, өөр shop-ийн мөр хэвээр.
        expect((await save([insight({ spend: 12, results: 4 })])).rows).toEqual([{ n: 1 }]);
        expect(await stored()).toEqual([
            { day: '2026-09-23', adset_id: '101', spend: '12.000000', results: '4', result_source: 'results' },
            { day: '2026-09-30', adset_id: '101', spend: '10.500000', results: '3', result_source: 'results' },
        ]);
        expect(await stored(otherShop)).toHaveLength(1);

        // Буруу мөр → бүх transaction буцна, өмнөх өгөгдөл хэвээр.
        for (const [rows, code] of [
            [[insight(), insight()], '23505'],
            [[insight({ day: '2026-10-01' })], '23514'],
            [[insight({ adset_id: '1x' })], '23514'],
            [[insight({ currency: 'usd' })], '23514'],
            [[insight({ spend: -1 })], '23514'],
            [[insight({ result_source: 'guess' })], '23514'],
            [[insight({ result_type: 'Calls!' })], '23514'],
            [[insight({ actions: { lead: 1 } })], '23514'],
        ] as const) {
            await expect(save([...rows])).rejects.toMatchObject({ code });
        }
        await expect(save([insight()], { from: '2026-06-01', to: '2026-09-29' })).rejects.toMatchObject({ code: '23514' });
        expect(await stored()).toHaveLength(2);
        expect((await save([])).rows).toEqual([{ n: 0 }]);
        expect(await stored()).toEqual([{ day: '2026-09-30', adset_id: '101', spend: '10.500000', results: '3', result_source: 'results' }]);

        await db.exec(`INSERT INTO public.meta_insights_sync(shop_id,account_id,last_attempt_at,last_error) VALUES ('${shop}','act_123',now(),'Meta unavailable')`);
        await db.exec(`INSERT INTO public.meta_insights_sync(shop_id,account_id,last_attempt_at,last_success_at,row_count,weeks,result_source,last_error)
            VALUES ('${shop}','act_123',now(),now(),12,5,'goal',NULL)
            ON CONFLICT (shop_id,account_id) DO UPDATE SET last_success_at = excluded.last_success_at, row_count = excluded.row_count, weeks = excluded.weeks,
                result_source = excluded.result_source, last_error = excluded.last_error`);
        expect((await db.query('SELECT row_count, weeks, result_source, last_error FROM public.meta_insights_sync')).rows)
            .toEqual([{ row_count: 12, weeks: 5, result_source: 'goal', last_error: null }]);
        await expect(db.exec(`INSERT INTO public.meta_insights_sync(shop_id,account_id,last_attempt_at) VALUES ('${shop}','123',now())`)).rejects.toThrow(/check constraint/);

        await db.exec('RESET ROLE');
        await db.exec(`DELETE FROM public.shops WHERE id = '${shop}'`);
        expect(await stored()).toEqual([]);
        expect((await db.query('SELECT count(*)::int AS n FROM public.meta_insights_sync')).rows).toEqual([{ n: 0 }]);
        expect(await stored(otherShop)).toHaveLength(1);
    } finally { await db.close(); }
}, 30_000);

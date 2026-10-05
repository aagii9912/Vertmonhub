// @vitest-environment node
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { expect, it } from 'vitest';

const shop = '60000000-0000-4000-8000-000000000001';
const user = '60000000-0000-4000-8000-0000000000aa';
/** Supabase-ийн анхдагч эрх: шинэ хүснэгтэд anon/authenticated бүх эрхтэй — миграци өөрөө REVOKE хийх ёстой. */
const SUPABASE_ROLES = `CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
    GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;`;
const MIGRATION = 'supabase/migrations/20261005150000_social_page_insights.sql';

it('social page insights migration: date-keyed service-role tables, unique synced posts, encrypted pending selection', async () => {
    const db = new PGlite();
    const row = (patch: Record<string, string> = {}) => {
        const r = { object_type: 'page', object_id: '42', page_id: '42', day: '2026-10-03', metric: 'page_media_view', value: '120', ...patch };
        return db.query(`INSERT INTO public.social_insights_daily(shop_id, platform, object_type, object_id, page_id, day, metric, value)
            VALUES ($1, 'facebook', $2, $3, $4, $5, $6, $7)
            ON CONFLICT (shop_id, platform, object_type, object_id, day, metric) DO UPDATE SET value = EXCLUDED.value`,
        [shop, r.object_type, r.object_id, r.page_id, r.day, r.metric, r.value]);
    };
    try {
        await db.exec(`${SUPABASE_ROLES}
            CREATE TABLE public.shops(id uuid PRIMARY KEY);
            CREATE TABLE public.social_posts(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), shop_id uuid NOT NULL, platform varchar(50) NOT NULL,
                content text, external_post_id text, likes integer DEFAULT 0, reach integer DEFAULT 0);
            CREATE TABLE public.social_insights(id uuid PRIMARY KEY DEFAULT gen_random_uuid());
            INSERT INTO public.shops VALUES ('${shop}');`);
        const migration = readFileSync(MIGRATION, 'utf8');
        await db.exec(migration);
        await db.exec(migration); // дахин ажиллуулж болно

        for (const role of ['anon', 'authenticated']) {
            await db.exec(`SET ROLE ${role}`);
            for (const table of ['social_insights_daily', 'social_insights_sync', 'meta_page_connect_pending']) {
                await expect(db.exec(`SELECT * FROM public.${table}`)).rejects.toThrow(/permission denied for table/);
            }
            await db.exec('RESET ROLE');
        }
        expect((await db.query<{ relname: string; relrowsecurity: boolean }>(
            `SELECT relname, relrowsecurity FROM pg_class WHERE relname IN ('social_insights_daily','social_insights_sync','meta_page_connect_pending') ORDER BY relname`)).rows)
            .toEqual([
                { relname: 'meta_page_connect_pending', relrowsecurity: true },
                { relname: 'social_insights_daily', relrowsecurity: true },
                { relname: 'social_insights_sync', relrowsecurity: true },
            ]);

        await db.exec('SET ROLE service_role');
        // Өдөр × метрикээр upsert: дахин синк утгыг шинэчилнэ, давхардуулахгүй.
        await row();
        await row({ value: '130' });
        await row({ object_type: 'post', object_id: '42_7', metric: 'post_total_media_view_unique', value: '800' });
        expect((await db.query<{ object_id: string; value: string }>(
            `SELECT object_id, value::text AS value FROM public.social_insights_daily ORDER BY object_id`)).rows)
            .toEqual([{ object_id: '42', value: '130' }, { object_id: '42_7', value: '800' }]);
        // Байхгүй утгыг 0 болгохгүй: NULL утга, буруу ID, буруу метрик нэрийг хүлээж авахгүй.
        await expect(db.query(`INSERT INTO public.social_insights_daily(shop_id, platform, object_type, object_id, page_id, day, metric, value)
            VALUES ($1, 'facebook', 'page', '42', '42', '2026-10-04', 'page_media_view', NULL)`, [shop])).rejects.toMatchObject({ code: '23502' });
        await expect(row({ object_id: '42/../me' })).rejects.toMatchObject({ code: '23514' });
        await expect(row({ metric: 'Page Impressions' })).rejects.toMatchObject({ code: '23514' });
        await expect(row({ object_type: 'story' })).rejects.toMatchObject({ code: '23514' });

        // Синк нийтлэлийг (shop, platform, external_post_id)-аар upsert хийнэ; гараар үүсгэсэн (ID-гүй) олон нийтлэл байж болно.
        const post = (reach: string | null) => db.query(`INSERT INTO public.social_posts(shop_id, platform, external_post_id, reach) VALUES ($1, 'facebook', '42_7', $2)
            ON CONFLICT (shop_id, platform, external_post_id) DO UPDATE SET reach = EXCLUDED.reach`, [shop, reach]);
        await post('10');
        await post(null);
        await db.query(`INSERT INTO public.social_posts(shop_id, platform) VALUES ($1, 'facebook'), ($1, 'facebook')`, [shop]);
        expect((await db.query<{ n: number; reach: number | null }>(
            `SELECT count(*)::int AS n, max(reach) AS reach FROM public.social_posts WHERE external_post_id = '42_7'`)).rows).toEqual([{ n: 1, reach: null }]);

        await db.query(`INSERT INTO public.social_insights_sync(shop_id, platform, page_id, last_attempt_at, unavailable_metrics)
            VALUES ($1, 'facebook', '42', now(), ARRAY['page_video_views'])`, [shop]);
        await expect(db.query(`INSERT INTO public.social_insights_sync(shop_id, platform, page_id, last_attempt_at, last_error)
            VALUES ($1, 'facebook', '43', now(), repeat('x', 501))`, [shop])).rejects.toMatchObject({ code: '23514' });

        // Pending сонголт: зөвхөн шифрлэгдсэн токен, хэрэглэгч × төсөл × урсгалд нэг мөр.
        const pending = (token: string, pages = '[{"id":"101","name":"Mandala"}]') => db.query(`INSERT INTO public.meta_page_connect_pending(user_id, shop_id, flow, user_token, pages, expires_at)
            VALUES ($1, $2, 'facebook', $3, $4::jsonb, now() + interval '30 minutes')
            ON CONFLICT (user_id, shop_id, flow) DO UPDATE SET user_token = EXCLUDED.user_token`, [user, shop, token, pages]);
        await pending('enc:v1:abc');
        await pending('enc:v1:def');
        await expect(pending('EAAB-plain-user-token')).rejects.toMatchObject({ code: '23514' });
        await expect(pending('enc:v1:x', '{"id":"101"}')).rejects.toMatchObject({ code: '23514' });
        expect((await db.query<{ n: number }>('SELECT count(*)::int AS n FROM public.meta_page_connect_pending')).rows).toEqual([{ n: 1 }]);

        // Төсөл устгавал бүх мөр цуг устна.
        await db.exec('RESET ROLE');
        await db.query('DELETE FROM public.shops WHERE id = $1', [shop]);
        for (const table of ['social_insights_daily', 'social_insights_sync', 'meta_page_connect_pending']) {
            expect((await db.query<{ n: number }>(`SELECT count(*)::int AS n FROM public.${table}`)).rows).toEqual([{ n: 0 }]);
        }
    } finally {
        await db.close();
    }
});

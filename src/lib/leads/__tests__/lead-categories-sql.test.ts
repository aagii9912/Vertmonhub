// @vitest-environment node
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { expect, it } from 'vitest';

it('lead categories are per shop, service-role only, capped and protected by the composite lead FK', async () => {
    const db = new PGlite();
    const shop = '50000000-0000-4000-8000-000000000001';
    const otherShop = '50000000-0000-4000-8000-000000000002';
    const fullShop = '50000000-0000-4000-8000-000000000003';
    const lead = '51000000-0000-4000-8000-000000000001';
    try {
        await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
            CREATE TABLE public.shops (id uuid PRIMARY KEY);
            CREATE TABLE public.leads (id uuid PRIMARY KEY, shop_id uuid NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE, customer_name text);
            INSERT INTO public.shops VALUES ('${shop}'), ('${otherShop}'), ('${fullShop}');
            INSERT INTO public.leads (id, shop_id, customer_name) VALUES ('${lead}', '${shop}', 'Бат');
            GRANT USAGE ON SCHEMA public TO service_role, authenticated, anon;
            GRANT SELECT, UPDATE ON public.leads TO service_role;`);
        const migration = readFileSync('supabase/migrations/20261004161000_lead_categories.sql', 'utf8');
        await db.exec(migration);
        await db.exec(migration); // Дахин ажиллуулж болно.

        for (const role of ['anon', 'authenticated']) {
            await db.exec(`SET ROLE ${role}`);
            await expect(db.query('SELECT * FROM public.lead_categories')).rejects.toMatchObject({ code: '42501' });
            await expect(db.query(`INSERT INTO public.lead_categories (shop_id, name) VALUES ('${shop}', 'Хакер')`)).rejects.toMatchObject({ code: '42501' });
            await db.exec('RESET ROLE');
        }

        await db.exec('SET ROLE service_role');
        const insert = (shopId: string, name: string, extra = '') =>
            db.query<{ id: string }>(`INSERT INTO public.lead_categories (shop_id, name${extra ? ', tone' : ''}) VALUES ($1, $2${extra ? ', $3' : ''}) RETURNING id`,
                extra ? [shopId, name, extra] : [shopId, name]);
        const buyer = (await insert(shop, 'Хөрөнгө оруулагч', 'success')).rows[0].id;
        const barter = (await insert(shop, 'Бартер')).rows[0].id;
        const foreign = (await insert(otherShop, 'Бартер')).rows[0].id; // Өөр төсөлд ижил нэр болно.

        // Нэр том/жижиг үсэг (кирилл, Ө/Ү) болон давхар зайгаар давхардахгүй.
        await expect(insert(shop, 'бартер')).rejects.toMatchObject({ code: '23505' });
        await expect(insert(shop, 'ХӨРӨНГӨ  ОРУУЛАГЧ')).rejects.toMatchObject({ code: '23505' });
        await expect(insert(shop, ' Түрээслэгч')).rejects.toMatchObject({ code: '23514' });
        await expect(insert(shop, '')).rejects.toMatchObject({ code: '23514' });
        await expect(insert(shop, 'Х'.repeat(61))).rejects.toMatchObject({ code: '23514' });
        await expect(insert(shop, 'Аюултай', 'danger')).rejects.toMatchObject({ code: '23514' });
        await expect(db.query(`INSERT INTO public.lead_categories (shop_id, name, description) VALUES ($1, 'Урт', $2)`, [shop, 'я'.repeat(301)]))
            .rejects.toMatchObject({ code: '23514' });
        await expect(db.query(`INSERT INTO public.lead_categories (shop_id, name, sort_order) VALUES ($1, 'Эрэмбэ', 1001)`, [shop]))
            .rejects.toMatchObject({ code: '23514' });
        await expect(insert('50000000-0000-4000-8000-000000000099', 'Байхгүй shop')).rejects.toMatchObject({ code: '23503' });

        // Лид зөвхөн өөрийн shop-ийн ангилалд холбогдоно; NULL = ангилалгүй.
        await db.query('UPDATE public.leads SET category_id = $1 WHERE id = $2', [buyer, lead]);
        await expect(db.query('UPDATE public.leads SET category_id = $1 WHERE id = $2', [foreign, lead])).rejects.toMatchObject({ code: '23503' });
        await db.query('UPDATE public.leads SET category_id = NULL WHERE id = $1', [lead]);
        await db.query('UPDATE public.leads SET category_id = $1 WHERE id = $2', [barter, lead]);

        // Ашиглагдсан ангиллыг устгахгүй — архивлана; ашиглагдаагүйг устгана.
        await expect(db.query('DELETE FROM public.lead_categories WHERE id = $1', [barter])).rejects.toMatchObject({ code: '23503' });
        const before = (await db.query<{ updated_at: string }>('SELECT updated_at FROM public.lead_categories WHERE id = $1', [barter])).rows[0].updated_at;
        await new Promise((resolve) => setTimeout(resolve, 5));
        await db.query('UPDATE public.lead_categories SET is_active = false WHERE id = $1', [barter]);
        const archived = (await db.query<{ is_active: boolean; updated_at: string }>('SELECT is_active, updated_at FROM public.lead_categories WHERE id = $1', [barter])).rows[0];
        expect(archived.is_active).toBe(false);
        expect(new Date(archived.updated_at).getTime()).toBeGreaterThan(new Date(before).getTime());
        await db.query('DELETE FROM public.lead_categories WHERE id = $1', [buyer]);

        // Төсөл бүрт 30 ангилал (архивласан нь орно); нэг statement-ийн олон мөр ч тоологдоно.
        await db.query(`INSERT INTO public.lead_categories (shop_id, name)
            SELECT $1, 'Ангилал ' || n FROM generate_series(1, 29) AS n`, [fullShop]);
        await expect(db.query(`INSERT INTO public.lead_categories (shop_id, name)
            SELECT $1, 'Илүү ' || n FROM generate_series(1, 2) AS n`, [fullShop])).rejects.toMatchObject({ code: '23514', message: 'lead_category_limit' });
        await insert(fullShop, 'Сүүлчийн');
        await expect(insert(fullShop, 'Хэтэрсэн')).rejects.toMatchObject({ code: '23514', message: 'lead_category_limit' });
        expect((await db.query<{ n: number }>('SELECT count(*)::int AS n FROM public.lead_categories WHERE shop_id = $1', [fullShop])).rows).toEqual([{ n: 30 }]);

        // Shop устгагдвал лид, ангилал хамт устна (FK шалгалт statement-ийн төгсгөлд).
        await db.exec('RESET ROLE');
        await db.exec(`DELETE FROM public.shops WHERE id = '${shop}'`);
        expect((await db.query('SELECT count(*)::int AS n FROM public.lead_categories WHERE shop_id = $1', [shop])).rows).toEqual([{ n: 0 }]);
        expect((await db.query<{ relrowsecurity: boolean }>(`SELECT relrowsecurity FROM pg_class WHERE relname = 'lead_categories'`)).rows)
            .toEqual([{ relrowsecurity: true }]);
        expect((await db.query<{ n: number }>(`SELECT count(*)::int AS n FROM pg_constraint WHERE conname = 'leads_category_same_shop_fkey'`)).rows)
            .toEqual([{ n: 1 }]);
    } finally { await db.close(); }
}, 30_000);

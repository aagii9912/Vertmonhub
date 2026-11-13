// @vitest-environment node
import { readFileSync } from 'node:fs';
import { migrationVerifyQuery } from '@/test/migration-verify';
import { PGlite } from '@electric-sql/pglite';
import { expect, it } from 'vitest';

const migration = readFileSync('supabase/migrations/20261113150000_sales_work_plan_items.sql', 'utf8');
const shop = '70000000-0000-4000-8000-000000000001';
const manager = '71000000-0000-4000-8000-000000000001';

it('20261113150000: a server-only, idempotent work plan table whose checks keep the month, title and done mark honest', async () => {
    const db = new PGlite();
    try {
        // Supabase-ийн default privilege (шинэ хүснэгт anon/authenticated-д нээлттэй) — migration өөрөө хаах ёстой.
        await db.exec(`
            CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
            GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
            ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
            CREATE TABLE public.shops(id uuid PRIMARY KEY);
            INSERT INTO public.shops VALUES ('${shop}');
        `);
        await db.exec(migration);
        await db.exec(migration); // Дахин ажиллуулж болно.
        expect((await db.query<{ ok: boolean }>(migrationVerifyQuery('20261113150000'))).rows[0].ok).toBe(true);

        await db.exec('SET ROLE service_role');
        const insert = (values: Record<string, unknown>) => db.query(
            `INSERT INTO public.sales_work_plan_items(shop_id, plan_month, title, assignee_ids, done_at, done_by_name)
             VALUES ($1, $2, $3, $4::uuid[], $5, $6) RETURNING id`,
            [shop, values.month ?? '2026-11', values.title ?? 'Showroom тохижуулах', values.assignees ?? [], values.doneAt ?? null, values.doneBy ?? null]);
        const id = ((await insert({ assignees: [manager] })).rows[0] as { id: string }).id;
        await insert({ title: 'Хийгдсэн ажил', doneAt: '2026-11-12T03:00:00Z', doneBy: 'Чанцал' });

        for (const bad of [{ month: '2026-13' }, { month: '2026-1' }, { month: '2026-11-01' }, { title: ' Showroom' }, { title: '' }, { title: 'а'.repeat(201) },
            // Хийгдээгүй мөрөнд «хэн тэмдэглэсэн» байж болохгүй.
            { doneBy: 'Чанцал' }, { assignees: Array.from({ length: 21 }, (_, index) => `71000000-0000-4000-8000-0000000001${String(index).padStart(2, '0')}`) }]) {
            await expect(insert(bad), JSON.stringify(bad).slice(0, 60)).rejects.toThrow();
        }
        // Чеклэх, буцаах, soft delete — UPDATE; жинхэнэ DELETE-ийг service_role ч хийж чадахгүй.
        await db.query(`UPDATE public.sales_work_plan_items SET done_at = now(), done_by_name = 'Хонгор' WHERE id = $1`, [id]);
        await db.query(`UPDATE public.sales_work_plan_items SET done_at = NULL, done_by = NULL, done_by_name = NULL, deleted_at = now() WHERE id = $1`, [id]);
        await expect(db.query('DELETE FROM public.sales_work_plan_items WHERE id = $1', [id])).rejects.toThrow(/permission denied/);
        for (const role of ['anon', 'authenticated']) {
            await db.exec(`RESET ROLE; SET ROLE ${role}`);
            await expect(db.query('SELECT 1 FROM public.sales_work_plan_items')).rejects.toThrow(/permission denied/);
        }
    } finally { await db.close(); }
});

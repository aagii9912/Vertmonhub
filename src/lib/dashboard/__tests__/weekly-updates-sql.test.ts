// @vitest-environment node
import { it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

it('weekly_updates SQL keeps browser roles out and enforces meeting, owner uniqueness and text limits', async () => {
    const db = new PGlite();
    try {
        await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
            CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY);
            CREATE TABLE public.shops(id uuid PRIMARY KEY);
            INSERT INTO auth.users VALUES ('00000000-0000-4000-8000-000000000001');
            INSERT INTO public.shops VALUES ('00000000-0000-4000-8000-000000000002');`);
        await db.exec(readFileSync('supabase/migrations/20260928150000_weekly_updates.sql', 'utf8'));
        const row = `'00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000001','2026-09-30','Номин','Дууссан'`;
        await db.exec('SET ROLE authenticated');
        await expect(db.exec('SELECT * FROM public.weekly_updates')).rejects.toThrow(/permission denied/);
        await expect(db.exec(`INSERT INTO public.weekly_updates(shop_id,user_id,meeting_date,author_name,achievements) VALUES (${row})`)).rejects.toThrow(/permission denied/);
        await db.exec('RESET ROLE; SET ROLE service_role');
        await db.exec(`INSERT INTO public.weekly_updates(shop_id,user_id,meeting_date,author_name,achievements) VALUES (${row})`);
        await expect(db.exec(`INSERT INTO public.weekly_updates(shop_id,user_id,meeting_date,author_name,achievements) VALUES (${row})`)).rejects.toThrow(/unique/);
        await expect(db.exec(`UPDATE public.weekly_updates SET meeting_date = '2026-09-29'`)).rejects.toThrow(/check constraint/);
        await expect(db.exec(`UPDATE public.weekly_updates SET achievements = repeat('x', 4001)`)).rejects.toThrow(/check constraint/);
        await expect(db.exec(`UPDATE public.weekly_updates SET achievements = ''`)).rejects.toThrow(/check constraint/);
        expect((await db.query('SELECT * FROM public.weekly_updates')).rows).toHaveLength(1);
    } finally { await db.close(); }
}, 20_000);

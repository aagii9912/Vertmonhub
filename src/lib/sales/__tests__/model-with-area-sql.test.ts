// @vitest-environment node
import { readFileSync } from 'node:fs';
import { migrationVerifyQuery } from '@/test/migration-verify';
import { PGlite } from '@electric-sql/pglite';
import { expect, it } from 'vitest';

const migration = readFileSync('supabase/migrations/20261127150000_project_model_with_area.sql', 'utf8');

it('20261127150000: an idempotent display switch that is off for every existing project', async () => {
    const db = new PGlite();
    try {
        await db.exec(`
            CREATE TABLE public.projects(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), shop_id uuid NOT NULL, name text NOT NULL);
            INSERT INTO public.projects(shop_id, name) VALUES (gen_random_uuid(), 'Mandala Garden'), (gen_random_uuid(), 'Elysium Residence');
        `);
        await db.exec(migration);
        await db.exec(migration); // Дахин ажиллуулж болно.
        expect((await db.query<{ ok: boolean }>(migrationVerifyQuery('20261127150000'))).rows[0].ok).toBe(true);
        expect((await db.query<{ name: string; model_with_area: boolean }>('SELECT name, model_with_area FROM public.projects ORDER BY name')).rows)
            .toEqual([{ name: 'Elysium Residence', model_with_area: false }, { name: 'Mandala Garden', model_with_area: false }]);
        // Turning it on for one project leaves the other untouched; a new project starts off.
        await db.exec(`UPDATE public.projects SET model_with_area = true WHERE name = 'Mandala Garden';
            INSERT INTO public.projects(shop_id, name) VALUES (gen_random_uuid(), 'Tower');`);
        expect((await db.query<{ name: string }>('SELECT name FROM public.projects WHERE model_with_area')).rows).toEqual([{ name: 'Mandala Garden' }]);
        await expect(db.exec(`UPDATE public.projects SET model_with_area = NULL`)).rejects.toThrow();
    } finally { await db.close(); }
});

// @vitest-environment node
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const shop = '20000000-0000-4000-8000-000000000001';
const otherShop = '20000000-0000-4000-8000-000000000002';
const file = '30000000-0000-4000-8000-000000000003';
const slidesMigration = readFileSync('supabase/migrations/20261013140000_weekly_report_slides.sql', 'utf8');
const migration = readFileSync('supabase/migrations/20261023152000_report_branding_photos.sql', 'utf8');
let db: PGlite;

const images = (count: number) => `{${Array.from({ length: count }, (_, index) => `"${shop}/${file}/${file.slice(0, -1)}${index}.jpg"`).join(',')}}`;
const slide = (section: string, imageCount: number, title = 'Гарчиг') => db.query(
    `INSERT INTO weekly_report_slides (shop_id, meeting_date, part, section, title, image_paths) VALUES ($1, '2026-10-21', 'sales', $2, $3, $4::text[])`,
    [shop, section, title, images(imageCount)],
);
const constraints = async () => (await db.query<{ conname: string }>(
    "SELECT conname FROM pg_constraint WHERE conrelid = 'public.weekly_report_slides'::regclass AND contype = 'c' ORDER BY conname",
)).rows.map(row => row.conname);

beforeEach(async () => {
    db = new PGlite();
    await db.exec(`
        CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
        CREATE TABLE shops (id uuid PRIMARY KEY);
        CREATE TABLE content_calendar (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), shop_id uuid, scheduled_date date);
        CREATE SCHEMA storage;
        CREATE TABLE storage.buckets (id text PRIMARY KEY, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
        CREATE TABLE storage.objects (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), bucket_id text, name text);
        ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
        GRANT USAGE ON SCHEMA public TO service_role, anon, authenticated;
    `);
    await db.query('INSERT INTO shops VALUES ($1), ($2)', [shop, otherShop]);
    await db.exec(slidesMigration);
    await db.query(`INSERT INTO weekly_report_slides (shop_id, meeting_date, part, section, title, image_paths) VALUES ($1, '2026-10-14', 'sales', 'event', 'Хуучин', $2::text[])`, [shop, images(6)]);
    await db.exec(migration);
    await db.exec(migration); // Дахин ажиллуулж болно.
});
afterEach(async () => { await db.close(); });

describe('meeting slide photos (W17)', () => {
    it('allows up to 9 images and the construction section, keeps old rows and the content rule', async () => {
        await slide('construction', 9, '');
        await expect(slide('construction', 10)).rejects.toThrow(/weekly_report_slides_image_paths_max/);
        await expect(slide('unknown', 1)).rejects.toThrow(/weekly_report_slides_section_allowed/);
        await expect(slide('plan', 0, '')).rejects.toThrow(/check constraint/);
        expect((await db.query<{ count: number }>('SELECT count(*)::int AS count FROM weekly_report_slides')).rows[0].count).toBe(2);
        // Хуучин автомат нэртэй CHECK-үүд солигдсон, давхардаагүй.
        expect(await constraints()).toEqual(expect.arrayContaining(['weekly_report_slides_image_paths_max', 'weekly_report_slides_section_allowed']));
        expect(await constraints()).not.toContain('weekly_report_slides_image_paths_check');
        expect(await constraints()).not.toContain('weekly_report_slides_section_check');
        const imageChecks = (await db.query<{ def: string }>(
            "SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint WHERE conrelid = 'public.weekly_report_slides'::regclass AND contype = 'c'",
        )).rows.filter(row => row.def.includes('<=') && row.def.includes('image_paths'));
        expect(imageChecks).toHaveLength(1);
    });
});

describe('report branding table', () => {
    const save = (values: Record<string, string | null>, shopId = shop) => db.query(
        'INSERT INTO report_branding (shop_id, display_name, footer_text, cover_image_path, logo_path) VALUES ($1, $2, $3, $4, $5)',
        [shopId, values.display_name ?? null, values.footer_text ?? null, values.cover_image_path ?? null, values.logo_path ?? null],
    );

    it('stores the display name, footer and this shop\'s branding image paths', async () => {
        await save({ display_name: 'ЭЛИЗИУМ', footer_text: 'ВЕРТМОН ПРОПЕРТИС', cover_image_path: `branding/${shop}/${file}.png`, logo_path: `branding/${shop}/${file}.jpg` });
        const row = (await db.query('SELECT display_name, footer_text, cover_image_path, logo_path, updated_at IS NOT NULL AS stamped FROM report_branding')).rows[0];
        expect(row).toEqual({ display_name: 'ЭЛИЗИУМ', footer_text: 'ВЕРТМОН ПРОПЕРТИС', cover_image_path: `branding/${shop}/${file}.png`, logo_path: `branding/${shop}/${file}.jpg`, stamped: true });
        await expect(save({ display_name: 'Давхар' })).rejects.toThrow(/duplicate key/);
    });

    it.each([
        ['another shop\'s image', { cover_image_path: `branding/${otherShop}/${file}.png` }],
        ['a slide image path', { logo_path: `${shop}/${file}/${file}.png` }],
        ['a gif', { logo_path: `branding/${shop}/${file}.gif` }],
        ['a path with ..', { cover_image_path: `branding/${shop}/../${file}.png` }],
        ['an untrimmed name', { display_name: ' ЭЛИЗИУМ ' }],
        ['an empty footer', { footer_text: '' }],
        ['a long name', { display_name: 'Э'.repeat(81) }],
    ])('rejects %s', async (_label, values) => {
        await expect(save(values)).rejects.toThrow(/check constraint/);
    });

    it('is server-only: RLS on, no anon/authenticated grants, service_role writes', async () => {
        const rls = (await db.query<{ relrowsecurity: boolean }>("SELECT relrowsecurity FROM pg_class WHERE oid = 'public.report_branding'::regclass")).rows[0];
        expect(rls.relrowsecurity).toBe(true);
        for (const role of ['anon', 'authenticated']) {
            for (const privilege of ['SELECT', 'INSERT', 'UPDATE', 'DELETE']) {
                const granted = (await db.query<{ ok: boolean }>('SELECT has_table_privilege($1, \'public.report_branding\', $2) AS ok', [role, privilege])).rows[0].ok;
                expect(granted, `${role} ${privilege}`).toBe(false);
            }
        }
        await db.exec('SET ROLE service_role');
        await save({ display_name: 'ЭЛИЗИУМ' });
        await db.query('UPDATE report_branding SET footer_text = $1 WHERE shop_id = $2', ['ВЕРТМОН ПРОПЕРТИС', shop]);
        await db.exec('RESET ROLE');
        expect((await db.query('SELECT footer_text FROM report_branding')).rows[0]).toEqual({ footer_text: 'ВЕРТМОН ПРОПЕРТИС' });
    });

    it('is removed with its shop', async () => {
        await save({ display_name: 'ЭЛИЗИУМ' });
        await db.query('DELETE FROM weekly_report_slides');
        await db.query('DELETE FROM shops WHERE id = $1', [shop]);
        expect((await db.query<{ count: number }>('SELECT count(*)::int AS count FROM report_branding')).rows[0].count).toBe(0);
    });
});

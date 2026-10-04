// @vitest-environment node
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { expect, it } from 'vitest';

it('stores the Elysium sync state and per-row ledger server-side only (disposable PostgreSQL)', async () => {
    const db = new PGlite();
    const shop = '20000000-0000-4000-8000-000000000001';
    const project = '30000000-0000-4000-8000-000000000001';
    const lead = '40000000-0000-4000-8000-000000000001';
    const row1 = '50000000-0000-4000-8000-000000000001';
    const row2 = '50000000-0000-4000-8000-000000000002';
    const record = (started: string, cursor: string | null, error: string | null, result: object = { imported: 1 }) => db.query<{ saved: boolean }>(
        'SELECT public.record_external_lead_sync($1, $2::timestamptz, $3::uuid, $4::uuid, $5::timestamptz, $6, $7::jsonb) AS saved',
        ['elysium', started, shop, project, cursor, error, JSON.stringify(result)]);
    try {
        await db.exec(`
            CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
            CREATE TABLE shops (id uuid PRIMARY KEY);
            CREATE TABLE projects (id uuid PRIMARY KEY, shop_id uuid NOT NULL REFERENCES shops(id));
            CREATE TABLE leads (id uuid PRIMARY KEY, shop_id uuid NOT NULL REFERENCES shops(id));
            GRANT USAGE ON SCHEMA public TO service_role, authenticated, anon;
        `);
        await db.query('INSERT INTO shops VALUES ($1)', [shop]);
        await db.query('INSERT INTO projects VALUES ($1, $2)', [project, shop]);
        await db.query('INSERT INTO leads VALUES ($1, $2)', [lead, shop]);

        const migration = readFileSync('supabase/migrations/20261004164000_external_lead_sync.sql', 'utf8');
        await db.exec(migration);
        await db.exec(migration);

        // Browser (anon/authenticated) хүснэгт, функцэд хандахгүй.
        for (const role of ['anon', 'authenticated']) {
            await db.exec(`SET ROLE ${role}`);
            await expect(db.query('SELECT * FROM external_lead_sync')).rejects.toMatchObject({ code: '42501' });
            await expect(db.query('SELECT * FROM external_lead_imports')).rejects.toMatchObject({ code: '42501' });
            await expect(record('2026-10-04T10:00:00Z', null, null)).rejects.toMatchObject({ code: '42501' });
            await db.exec('RESET ROLE');
        }

        await db.exec('SET ROLE service_role');
        // Анхдагчаар унтраалттай.
        await db.query(`INSERT INTO external_lead_sync (source) VALUES ('elysium')`);
        expect((await db.query('SELECT enabled, last_result FROM external_lead_sync')).rows).toEqual([{ enabled: false, last_result: {} }]);
        await expect(db.query(`INSERT INTO external_lead_sync (source) VALUES ('other')`)).rejects.toMatchObject({ code: '23514' });

        // Ledger: түлхүүр нэг удаа, invalid мөр лидгүй, үр дүнгийн толь хатуу.
        await db.query(`INSERT INTO external_lead_imports (source, source_id, shop_id, project_id, lead_id, outcome, source_name, source_created_at)
            VALUES ('elysium', $1, $2, $3, $4, 'imported', 'Бат', '2026-10-04T09:00:00Z')`, [row1, shop, project, lead]);
        await expect(db.query(`INSERT INTO external_lead_imports (source, source_id, shop_id, outcome, source_created_at)
            VALUES ('elysium', $1, $2, 'matched', now())`, [row1, shop])).rejects.toMatchObject({ code: '23505' });
        await expect(db.query(`INSERT INTO external_lead_imports (source, source_id, shop_id, lead_id, outcome, source_created_at)
            VALUES ('elysium', $1, $2, $3, 'invalid', now())`, [row2, shop, lead])).rejects.toMatchObject({ code: '23514' });
        await expect(db.query(`INSERT INTO external_lead_imports (source, source_id, shop_id, outcome, source_created_at)
            VALUES ('elysium', $1, $2, 'skipped', now())`, [row2, shop])).rejects.toMatchObject({ code: '23514' });
        await expect(db.query(`INSERT INTO external_lead_imports (source, source_id, shop_id, outcome, source_created_at, detail)
            VALUES ('elysium', $1, $2, 'invalid', now(), repeat('x', 501))`, [row2, shop])).rejects.toMatchObject({ code: '23514' });
        await db.query(`INSERT INTO external_lead_imports (source, source_id, shop_id, outcome, source_created_at, detail)
            VALUES ('elysium', $1, $2, 'invalid', now(), 'Утас, и-мэйл хоёул хоосон')`, [row2, shop]);

        // Төлөв: амжилт cursor-ыг ахиулна, алдаа cursor-ыг хадгалж сүүлийн амжилтыг үлдээнэ.
        expect((await record('2026-10-04T10:00:00Z', '2026-10-04T09:45:00Z', null)).rows).toEqual([{ saved: true }]);
        const ok = (await db.query<{ cursor_at: Date; last_success_at: Date | null; last_error: string | null; enabled: boolean }>(
            'SELECT cursor_at, last_success_at, last_error, enabled FROM external_lead_sync')).rows[0];
        expect(ok.cursor_at.toISOString()).toBe('2026-10-04T09:45:00.000Z');
        expect(ok.last_success_at).not.toBeNull();
        expect(ok.enabled).toBe(false);
        expect((await record('2026-10-04T10:15:00Z', null, 'x'.repeat(900), { failed: 1 })).rows).toEqual([{ saved: true }]);
        const failed = (await db.query<{ cursor_at: Date; last_success_at: Date | null; last_error: string; last_result: object }>(
            'SELECT cursor_at, last_success_at, last_error, last_result FROM external_lead_sync')).rows[0];
        expect(failed.cursor_at.toISOString()).toBe('2026-10-04T09:45:00.000Z');
        expect(failed.last_success_at).toEqual(ok.last_success_at);
        expect(failed.last_error).toHaveLength(500);
        expect(failed.last_result).toEqual({ failed: 1 });

        // Эрт эхэлсэн ажиллалт хожуу дуусвал шинэ төлөвийг дарахгүй.
        expect((await record('2026-10-04T10:05:00Z', '2026-10-04T09:50:00Z', null)).rows).toEqual([{ saved: false }]);
        expect((await db.query<{ last_attempt_at: Date }>('SELECT last_attempt_at FROM external_lead_sync')).rows[0].last_attempt_at.toISOString())
            .toBe('2026-10-04T10:15:00.000Z');
        await expect(db.query(`SELECT public.record_external_lead_sync('other', now(), NULL, NULL, NULL, NULL, '{}'::jsonb)`))
            .rejects.toMatchObject({ code: '22023' });
        await expect(db.query(`SELECT public.record_external_lead_sync('elysium', now(), NULL, NULL, NULL, NULL, '[]'::jsonb)`))
            .rejects.toMatchObject({ code: '22023' });
        await db.exec('RESET ROLE');

        // Лидийг бүр мөсөн устгавал ledger мөр үлдэж, холбоос нь хоосорно.
        await db.query('DELETE FROM leads WHERE id = $1', [lead]);
        expect((await db.query('SELECT outcome, lead_id FROM external_lead_imports WHERE source_id = $1', [row1])).rows)
            .toEqual([{ outcome: 'imported', lead_id: null }]);
    } finally { await db.close(); }
}, 20_000);

// @vitest-environment node
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { expect, it } from 'vitest';

it('creates one shop per project and refuses sub-projects in disposable PostgreSQL', async () => {
    const db = new PGlite();
    const legacyShop = '20000000-0000-4000-8000-000000000001';
    const garden = '30000000-0000-4000-8000-000000000001';
    const elysium = '30000000-0000-4000-8000-000000000002';
    const actor = '10000000-0000-4000-8000-000000000001';
    const member = '10000000-0000-4000-8000-000000000002';
    const stranger = '10000000-0000-4000-8000-000000000003';
    const create = (fields: object, members: string[] = []) => db.query<{ project: Record<string, unknown> }>(
        'SELECT public.create_project_shop($1::jsonb,$2::uuid[],$3::uuid) AS project', [JSON.stringify(fields), members, actor]);
    try {
        await db.exec(`
            CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
            CREATE SCHEMA private;
            CREATE TABLE shops (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL,
                is_active boolean DEFAULT true, setup_completed boolean DEFAULT false);
            CREATE TABLE projects (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), shop_id uuid NOT NULL REFERENCES shops(id),
                name text NOT NULL, location text, district text, description text, status text DEFAULT 'active',
                created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now());
            CREATE TABLE shop_members (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), shop_id uuid NOT NULL REFERENCES shops(id),
                user_id uuid NOT NULL, role text NOT NULL DEFAULT 'member', UNIQUE (shop_id, user_id));
            CREATE TABLE user_roles (user_id uuid PRIMARY KEY, role text NOT NULL);
            CREATE TABLE admin_audit_log (id bigserial PRIMARY KEY, actor_id uuid, action text NOT NULL, target_id text, meta jsonb);
            GRANT USAGE ON SCHEMA public TO service_role;
            GRANT SELECT, INSERT, UPDATE ON shops, projects, shop_members TO service_role;
            GRANT SELECT ON user_roles TO service_role;
            GRANT SELECT, INSERT ON admin_audit_log TO service_role;
            GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO service_role;
        `);
        // Хуучин олон төсөлтэй shop migration-оор өөрчлөгдөхгүй.
        await db.query('INSERT INTO shops (id, name) VALUES ($1, $2)', [legacyShop, 'Mandala Garden']);
        await db.query('INSERT INTO projects (id, shop_id, name) VALUES ($1,$3,$4),($2,$3,$5)',
            [garden, elysium, legacyShop, 'Mandala Garden', 'Elysium Residence']);
        await db.query('INSERT INTO user_roles VALUES ($1,$2),($3,$4)', [actor, 'super_admin', member, 'admin']);

        const migration = readFileSync('supabase/migrations/20261004130000_project_shops.sql', 'utf8');
        await db.exec(migration);
        await db.exec(migration);
        expect((await db.query('SELECT count(*)::int AS n FROM projects WHERE shop_id = $1', [legacyShop])).rows).toEqual([{ n: 2 }]);

        await db.exec('SET ROLE authenticated');
        await expect(create({ name: 'Tower' })).rejects.toMatchObject({ code: '42501' });
        await db.exec('RESET ROLE; SET ROLE service_role');

        const created = (await create({ name: '  Mandala 360&365 Tower ', district: 'ХУД', status: 'active' }, [member, member])).rows[0].project;
        expect(created).toMatchObject({ name: 'Mandala 360&365 Tower', district: 'ХУД', status: 'active', shops: { name: 'Mandala 360&365 Tower' } });
        const towerShop = created.shop_id as string;
        expect(towerShop).not.toBe(legacyShop);
        expect((await db.query('SELECT name, setup_completed FROM shops WHERE id = $1', [towerShop])).rows)
            .toEqual([{ name: 'Mandala 360&365 Tower', setup_completed: true }]);
        expect((await db.query('SELECT user_id FROM shop_members WHERE shop_id = $1 ORDER BY user_id', [towerShop])).rows)
            .toEqual([{ user_id: actor }, { user_id: member }]);
        expect((await db.query('SELECT action, target_id FROM admin_audit_log')).rows)
            .toEqual([{ action: 'project.create', target_id: created.id }]);

        // Нэр давхардал (том жижиг үсэг, хуучин shop/төслийн нэр), буруу талбар, гадны хэрэглэгч.
        await expect(create({ name: 'mandala 360&365 tower' })).rejects.toMatchObject({ code: '23505' });
        await expect(create({ name: 'ELYSIUM RESIDENCE' })).rejects.toMatchObject({ code: '23505' });
        await expect(create({ name: 'Шинэ', budget: '1' })).rejects.toMatchObject({ code: '22023' });
        await expect(create({ name: 'Шинэ', status: 'deleted' })).rejects.toMatchObject({ code: '22023' });
        await expect(create({ name: '' })).rejects.toMatchObject({ code: '22023' });
        await expect(create({ name: 'Шинэ' }, [stranger])).rejects.toMatchObject({ code: '22023' });
        expect((await db.query('SELECT count(*)::int AS n FROM shops')).rows).toEqual([{ n: 2 }]);

        // Төсөлтэй shop-д дэд төсөл нэмэх, эсвэл төслийг тийш нь зөөх боломжгүй.
        await db.exec('RESET ROLE');
        await expect(db.query('INSERT INTO projects (shop_id, name) VALUES ($1, $2)', [towerShop, 'Дэд төсөл']))
            .rejects.toMatchObject({ code: '23505' });
        await expect(db.query('UPDATE projects SET shop_id = $1 WHERE id = $2', [towerShop, elysium]))
            .rejects.toMatchObject({ code: '23505' });

        // Олон төсөлтэй хуучин shop-ийн нэрийг нэг төслийн нэрээр дарахгүй.
        await db.query('UPDATE projects SET name = $1 WHERE id = $2', ['Mandala Garden Phase', garden]);
        expect((await db.query('SELECT name FROM shops WHERE id = $1', [legacyShop])).rows).toEqual([{ name: 'Mandala Garden' }]);

        // Хуучин shop-оос хоосон shop руу зөөх нь зөвшөөрөгдөнө; дараа нь shop нь төслийн нэрийг дагана.
        const elysiumShop = (await db.query<{ id: string }>('INSERT INTO shops (name) VALUES ($1) RETURNING id', ['Elysium'])).rows[0].id;
        await db.query('UPDATE projects SET shop_id = $1 WHERE id = $2', [elysiumShop, elysium]);
        await db.query('UPDATE projects SET name = $1 WHERE id = $2', ['Elysium Residence II', elysium]);
        expect((await db.query('SELECT name FROM shops WHERE id = $1', [elysiumShop])).rows).toEqual([{ name: 'Elysium Residence II' }]);
        await db.query('UPDATE projects SET name = $1 WHERE id = $2', ['Mandala Garden', garden]);
        expect((await db.query('SELECT name FROM shops WHERE id = $1', [legacyShop])).rows).toEqual([{ name: 'Mandala Garden' }]);
        await expect(db.query('INSERT INTO projects (shop_id, name) VALUES ($1, $2)', [legacyShop, 'Forest Garden']))
            .rejects.toMatchObject({ code: '23505' });
    } finally { await db.close(); }
}, 20_000);

// @vitest-environment node
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { expect, it } from 'vitest';

it('keeps project membership explicit, tenant-bound and atomic in disposable PostgreSQL', async () => {
    const db = new PGlite();
    const shop = '20000000-0000-4000-8000-000000000001';
    const otherShop = '20000000-0000-4000-8000-000000000002';
    const user = '10000000-0000-4000-8000-000000000001';
    const garden = '30000000-0000-4000-8000-000000000001';
    const elysium = '30000000-0000-4000-8000-000000000002';
    const foreign = '30000000-0000-4000-8000-000000000003';
    const save = (managers: object[]) => db.query('SELECT public.save_sales_manager_roster($1::uuid,$2::jsonb)', [shop, JSON.stringify(managers)]);
    const membership = async () => (await db.query<{ manager_name: string; project_id: string }>(
        'SELECT manager_name,project_id FROM public.sales_manager_projects ORDER BY manager_name,project_id',
    )).rows;
    const manager = { name: 'Бат', user_id: user, is_active: true };
    try {
        await db.exec(`
            CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
            CREATE TABLE shops (id uuid PRIMARY KEY);
            CREATE TABLE projects (id uuid PRIMARY KEY,shop_id uuid NOT NULL REFERENCES shops(id),name text);
            CREATE TABLE shop_members (shop_id uuid,user_id uuid);
            CREATE TABLE sales_managers (id uuid PRIMARY KEY DEFAULT gen_random_uuid(),shop_id uuid REFERENCES shops(id),
                name text NOT NULL,user_id uuid,is_active boolean NOT NULL,UNIQUE(shop_id,name));
            GRANT SELECT,UPDATE ON shops TO service_role;
            GRANT SELECT ON projects,shop_members TO service_role;
            GRANT ALL ON sales_managers TO service_role;
        `);
        await db.query('INSERT INTO shops VALUES ($1),($2)', [shop, otherShop]);
        await db.query('INSERT INTO projects VALUES ($1,$2,$3),($4,$2,$5),($6,$7,$8)',
            [garden, shop, 'Mandala Garden', elysium, 'Elysium', foreign, otherShop, 'Өөр төсөл']);
        await db.query('INSERT INTO shop_members VALUES ($1,$2)', [shop, user]);
        await db.query('INSERT INTO sales_managers(shop_id,name,user_id,is_active) VALUES ($1,$2,$3,true)', [shop, 'Бат', user]);
        const migration = readFileSync('supabase/migrations/20261001130000_sales_manager_projects.sql', 'utf8');
        await db.exec(migration);
        await db.exec(migration);
        expect(await membership()).toEqual([]);

        await db.exec('SET ROLE authenticated');
        await expect(db.query('SELECT * FROM public.sales_manager_projects')).rejects.toMatchObject({ code: '42501' });
        await expect(save([{ ...manager, project_ids: [garden] }])).rejects.toMatchObject({ code: '42501' });
        await db.exec('RESET ROLE; SET ROLE service_role');

        await save([{ ...manager, project_ids: [garden, elysium, garden] }]);
        expect(await membership()).toEqual([
            { manager_name: 'Бат', project_id: garden }, { manager_name: 'Бат', project_id: elysium },
        ]);
        await save([{ ...manager, is_active: false }]);
        expect(await membership()).toHaveLength(2);
        await save([{ ...manager, project_ids: [] }]);
        expect(await membership()).toEqual([]);

        await save([{ ...manager, project_ids: [garden] }, { name: 'Сараа', user_id: null, is_active: true, project_ids: [elysium] }]);
        await expect(save([{ ...manager, is_active: false, project_ids: [foreign] }])).rejects.toMatchObject({ code: '22023' });
        expect(await membership()).toEqual([
            { manager_name: 'Бат', project_id: garden }, { manager_name: 'Сараа', project_id: elysium },
        ]);
        await expect(db.query('INSERT INTO sales_manager_projects VALUES ($1,$2,$3)', [shop, 'Бат', foreign]))
            .rejects.toMatchObject({ code: '23503' });
        await expect(save([{ name: 'Өөр нэр', user_id: user, is_active: true, project_ids: [garden] }]))
            .rejects.toMatchObject({ code: '23505' });
        await expect(save([{ ...manager, project_ids: null }])).rejects.toMatchObject({ code: '22023' });

        // Төслийн INSERT алдаа гарвал өмнөх харьяалал болон roster хоёул буцна.
        await db.exec('RESET ROLE');
        await db.exec(`ALTER TABLE public.sales_manager_projects ADD CONSTRAINT fail_membership CHECK (project_id <> '${elysium}'::uuid) NOT VALID`);
        await db.exec('SET ROLE service_role');
        await expect(save([{ ...manager, is_active: false, project_ids: [elysium] }])).rejects.toMatchObject({ code: '23514' });
        expect(await membership()).toEqual([
            { manager_name: 'Бат', project_id: garden }, { manager_name: 'Сараа', project_id: elysium },
        ]);
        expect((await db.query('SELECT is_active FROM sales_managers WHERE name=$1', ['Бат'])).rows).toEqual([{ is_active: true }]);
    } finally { await db.close(); }
}, 20_000);

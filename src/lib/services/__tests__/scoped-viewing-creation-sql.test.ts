// @vitest-environment node
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { expect, it } from 'vitest';

it('rechecks creation actors and properties and rolls back viewing/contact/history together', async () => {
    const db = new PGlite();
    const shop = '10000000-0000-4000-8000-000000000001';
    const user = '20000000-0000-4000-8000-000000000001';
    const otherUser = '20000000-0000-4000-8000-000000000002';
    const garden = '30000000-0000-4000-8000-000000000001';
    const elysium = '30000000-0000-4000-8000-000000000002';
    const lead = '40000000-0000-4000-8000-000000000001';
    const property = '50000000-0000-4000-8000-000000000001';
    const input = { project_id: garden, property_id: property, scheduled_at: '2026-10-02T00:00:00Z', walk_in: false, meeting_type: 'repeat_customer' };
    const create = (overrides: object = {}) => db.query<{ result: { id: string; status: string } }>(
        'SELECT create_scoped_sales_viewing($1::uuid,$2::uuid,$3::uuid,$4::text,$5::uuid[],$6::jsonb) AS result',
        [shop, lead, user, 'Бат', [garden], JSON.stringify({ ...input, ...overrides })],
    );
    const snapshot = async () => ({
        lead: (await db.query<Record<string, unknown>>('SELECT status,last_contact_at,viewing_scheduled_at FROM leads')).rows,
        viewings: (await db.query<Record<string, unknown>>('SELECT id,status,meeting_type,sales_manager_name FROM property_viewings ORDER BY id')).rows,
        history: (await db.query<Record<string, unknown>>('SELECT content,created_by,created_by_name FROM lead_activities ORDER BY content')).rows,
    });
    try {
        await db.exec(`
            CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
            CREATE TABLE sales_managers(shop_id uuid,name text,user_id uuid,is_active boolean);
            CREATE TABLE sales_manager_projects(shop_id uuid,manager_name text,project_id uuid);
            CREATE TABLE leads(id uuid PRIMARY KEY,shop_id uuid,project_id uuid,sales_manager_name text,status text,
                deleted_at timestamptz,updated_at timestamptz,last_contact_at timestamptz,viewing_scheduled_at timestamptz);
            CREATE TABLE properties(id uuid PRIMARY KEY,shop_id uuid,project_id uuid,name text,deleted_at timestamptz);
            CREATE TABLE property_viewings(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),shop_id uuid,lead_id uuid REFERENCES leads(id),property_id uuid REFERENCES properties(id),
                status text,scheduled_at timestamptz,completed_at timestamptz,meeting_type text,sales_manager_name text,
                agent_notes text,customer_feedback text,interest_level integer);
            CREATE TABLE lead_activities(id uuid DEFAULT gen_random_uuid(),shop_id uuid,lead_id uuid REFERENCES leads(id),
                type text,content text,meta jsonb,created_by uuid,created_by_name text);
            GRANT ALL ON sales_managers,sales_manager_projects,leads,properties,property_viewings,lead_activities TO service_role;
        `);
        await db.query('INSERT INTO sales_managers VALUES ($1,$2,$3,true)', [shop, 'Бат', user]);
        await db.query('INSERT INTO sales_manager_projects VALUES ($1,$2,$3)', [shop, 'Бат', garden]);
        await db.query("INSERT INTO leads(id,shop_id,project_id,sales_manager_name,status) VALUES ($1,$2,$3,$4,'new')", [lead, shop, garden, 'Бат']);
        await db.query('INSERT INTO properties(id,shop_id,project_id,name) VALUES ($1,$2,$3,$4)', [property, shop, garden, 'Байр']);
        const migration = readFileSync('supabase/migrations/20261001133000_scoped_viewing_creation.sql', 'utf8');
        await db.exec(migration); await db.exec(migration);
        await db.exec('SET ROLE authenticated');
        await expect(create()).rejects.toMatchObject({ code: '42501' });
        await db.exec('RESET ROLE; SET ROLE service_role');
        expect((await create()).rows[0].result.status).toBe('scheduled');
        expect((await snapshot()).lead[0].status).toBe('viewing_scheduled');
        expect((await snapshot()).history).toMatchObject([{ content: 'Уулзалт товлов · Байр', created_by: user, created_by_name: 'Бат' }]);
        await db.query("UPDATE leads SET status='closed_won'");
        await create({ walk_in: true, interest_level: 4, customer_feedback: 'Сонирхож байна' });
        const before = await snapshot();
        expect(before.lead[0].status).toBe('closed_won'); expect(before.lead[0].last_contact_at).not.toBeNull();
        expect(before.viewings).toHaveLength(2);

        for (const changes of [{ project: garden, owner: 'Сараа', deleted: null }, { project: elysium, owner: 'Бат', deleted: null }, { project: garden, owner: 'Бат', deleted: '2026-10-01T00:00:00Z' }]) {
            await db.query('UPDATE leads SET project_id=$1,sales_manager_name=$2,deleted_at=$3', [changes.project, changes.owner, changes.deleted]);
            await expect(create()).rejects.toMatchObject({ code: 'P0002' });
            expect(await snapshot()).toEqual(before);
        }
        await db.query('UPDATE leads SET project_id=$1,sales_manager_name=$2,deleted_at=NULL', [garden, 'Бат']);
        for (const changes of [{ userId: otherUser, active: true }, { userId: user, active: false }]) {
            await db.query('UPDATE sales_managers SET user_id=$1,is_active=$2', [changes.userId, changes.active]);
            await expect(create()).rejects.toMatchObject({ code: 'P0002' });
        }
        await db.query('UPDATE sales_managers SET user_id=$1,is_active=true', [user]);
        await db.exec('DELETE FROM sales_manager_projects');
        await expect(create()).rejects.toMatchObject({ code: 'P0002' });
        await db.query('INSERT INTO sales_manager_projects VALUES ($1,$2,$3)', [shop, 'Бат', garden]);
        for (const changes of [{ project: elysium, deleted: null }, { project: garden, deleted: '2026-10-01T00:00:00Z' }]) {
            await db.query('UPDATE properties SET project_id=$1,deleted_at=$2', [changes.project, changes.deleted]);
            await expect(create()).rejects.toMatchObject({ code: 'P0002' });
        }
        await db.query('UPDATE properties SET project_id=$1,deleted_at=NULL', [garden]);
        expect(await snapshot()).toEqual(before);

        await db.query("UPDATE leads SET status='new',viewing_scheduled_at=NULL,last_contact_at=NULL");
        const beforeFailure = await snapshot();
        await db.exec('RESET ROLE; ALTER TABLE lead_activities ADD CONSTRAINT fail_history CHECK(false) NOT VALID; SET ROLE service_role');
        await expect(create({ walk_in: true })).rejects.toMatchObject({ code: '23514' });
        expect(await snapshot()).toEqual(beforeFailure);
    } finally { await db.close(); }
}, 20_000);

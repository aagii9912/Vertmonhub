// @vitest-environment node
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { expect, it } from 'vitest';

it('rechecks current viewing ownership and commits lead/history together in disposable PostgreSQL', async () => {
    const db = new PGlite();
    const shop = '10000000-0000-4000-8000-000000000001';
    const user = '20000000-0000-4000-8000-000000000001';
    const garden = '30000000-0000-4000-8000-000000000001';
    const elysium = '30000000-0000-4000-8000-000000000002';
    const lead = '40000000-0000-4000-8000-000000000001';
    const viewing = '50000000-0000-4000-8000-000000000001';
    // Scope was resolved before a competing owner/project/membership change.
    const update = (patch: object) => db.query<{ result: { id: string; status: string } }>(
        'SELECT update_scoped_sales_viewing($1::uuid,$2::uuid,$3::uuid,$4::text,$5::uuid[],$6::jsonb) AS result',
        [shop, viewing, user, 'Бат', [garden], JSON.stringify(patch)],
    );
    const snapshot = async () => ({
        viewing: (await db.query<Record<string, unknown>>('SELECT status,deleted_at FROM property_viewings')).rows,
        lead: (await db.query<Record<string, unknown>>('SELECT status,last_contact_at,next_followup_at,viewing_scheduled_at FROM leads')).rows,
        history: (await db.query<Record<string, unknown>>('SELECT content,created_by,created_by_name,meta FROM lead_activities')).rows,
    });
    try {
        await db.exec(`
            CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
            CREATE TABLE sales_managers(shop_id uuid,name text,user_id uuid,is_active boolean);
            CREATE TABLE sales_manager_projects(shop_id uuid,manager_name text,project_id uuid);
            CREATE TABLE leads(id uuid PRIMARY KEY,shop_id uuid,project_id uuid,sales_manager_name text,status text,
                deleted_at timestamptz,updated_at timestamptz,last_contact_at timestamptz,next_followup_at timestamptz,viewing_scheduled_at timestamptz);
            CREATE TABLE property_viewings(id uuid PRIMARY KEY,shop_id uuid,lead_id uuid REFERENCES leads(id),property_id uuid,
                status text,scheduled_at timestamptz,completed_at timestamptz,agent_notes text,customer_feedback text,interest_level integer,deleted_at timestamptz);
            CREATE TABLE lead_activities(id uuid DEFAULT gen_random_uuid(),shop_id uuid,lead_id uuid REFERENCES leads(id),
                type text,content text,meta jsonb,created_by uuid,created_by_name text);
            GRANT ALL ON sales_managers,sales_manager_projects,leads,property_viewings,lead_activities TO service_role;
        `);
        await db.query('INSERT INTO sales_managers VALUES ($1,$2,$3,true)', [shop, 'Бат', user]);
        await db.query('INSERT INTO sales_manager_projects VALUES ($1,$2,$3)', [shop, 'Бат', garden]);
        await db.query("INSERT INTO leads(id,shop_id,project_id,sales_manager_name,status,viewing_scheduled_at) VALUES ($1,$2,$3,$4,'viewing_scheduled','2026-10-02T00:00:00Z')", [lead, shop, garden, 'Бат']);
        await db.query("INSERT INTO property_viewings(id,shop_id,lead_id,status,scheduled_at) VALUES ($1,$2,$3,'scheduled','2026-10-02T00:00:00Z')", [viewing, shop, lead]);
        const migration = readFileSync('supabase/migrations/20261001132000_scoped_viewing_mutation.sql', 'utf8');
        await db.exec(migration); await db.exec(migration);
        await db.exec('SET ROLE authenticated');
        await expect(update({ status: 'completed' })).rejects.toMatchObject({ code: '42501' });
        await db.exec('RESET ROLE; SET ROLE service_role');

        expect((await update({ status: 'completed', interest_level: 4, customer_feedback: 'Сонирхож байна' })).rows[0].result)
            .toMatchObject({ id: viewing, status: 'completed' });
        const completed = await snapshot();
        expect(completed.lead[0].last_contact_at).not.toBeNull();
        expect(completed.history).toMatchObject([{ content: 'Уулзалт болов · сонирхол 4/5 · Сонирхож байна', created_by: user, created_by_name: 'Бат' }]);

        for (const changed of [{ project_id: garden, manager: 'Сараа' }, { project_id: elysium, manager: 'Бат' }]) {
            await db.query('UPDATE leads SET project_id=$1,sales_manager_name=$2', [changed.project_id, changed.manager]);
            await expect(update({ status: 'cancelled' })).rejects.toMatchObject({ code: 'P0002' });
            expect(await snapshot()).toEqual(completed);
        }
        await db.query('UPDATE leads SET project_id=$1,sales_manager_name=$2', [garden, 'Бат']);
        await db.query('DELETE FROM sales_manager_projects WHERE project_id=$1', [garden]);
        await expect(update({ agent_notes: 'Хуучин эрхээр бичих' })).rejects.toMatchObject({ code: 'P0002' });
        await db.query('INSERT INTO sales_manager_projects VALUES ($1,$2,$3)', [shop, 'Бат', garden]);

        await db.query("UPDATE leads SET status='closed_won'");
        await update({ status: 'cancelled' });
        expect((await snapshot()).lead[0].status).toBe('closed_won');
        await db.query("UPDATE leads SET status='viewing_scheduled',next_followup_at=NULL");
        await db.query("UPDATE property_viewings SET status='scheduled'");
        const beforeFailure = await snapshot();
        await db.exec('RESET ROLE; ALTER TABLE lead_activities ADD CONSTRAINT fail_history CHECK(false) NOT VALID; SET ROLE service_role');
        await expect(update({ status: 'cancelled', next_followup_at: '2026-10-03T00:00:00Z' })).rejects.toMatchObject({ code: '23514' });
        expect(await snapshot()).toEqual(beforeFailure);
        await db.exec('RESET ROLE; ALTER TABLE lead_activities DROP CONSTRAINT fail_history; SET ROLE service_role');

        await update({ next_followup_at: '2026-10-03T00:00:00Z' });
        expect((await snapshot()).history).toHaveLength(beforeFailure.history.length);
        await update({ deleted_at: '2026-10-01T00:00:00Z', status: 'cancelled' });
        const deleted = await snapshot();
        expect(deleted.viewing[0].deleted_at).not.toBeNull();
        expect(deleted.lead[0]).toMatchObject({ status: 'contacted', viewing_scheduled_at: null });
        await expect(update({ agent_notes: 'Устгасан уулзалт' })).rejects.toMatchObject({ code: 'P0002' });
        expect(await snapshot()).toEqual(deleted);
    } finally { await db.close(); }
}, 20_000);

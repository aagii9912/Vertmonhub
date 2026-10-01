// @vitest-environment node
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { expect, it } from 'vitest';

it('checks live contact ownership and canonical identity and rolls back timestamps with activity failures', async () => {
    const db = new PGlite();
    const shop = '10000000-0000-4000-8000-000000000001';
    const user = '20000000-0000-4000-8000-000000000001';
    const otherUser = '20000000-0000-4000-8000-000000000002';
    const garden = '30000000-0000-4000-8000-000000000001';
    const elysium = '30000000-0000-4000-8000-000000000002';
    const lead = '40000000-0000-4000-8000-000000000001';
    const record = (input: object, projects: Array<string | null> = [garden]) => db.query<{ activity: { id: string; created_by_name: string; type: string; meta: object } }>(
        'SELECT record_scoped_sales_lead_contact($1::uuid,$2::uuid,$3::uuid,$4::text,$5::uuid[],$6::jsonb) AS activity',
        [shop, lead, user, 'Бат', projects, JSON.stringify(input)],
    );
    const snapshot = async () => ({
        lead: (await db.query<Record<string, unknown>>('SELECT status,updated_at,last_contact_at,next_followup_at FROM leads')).rows,
        history: (await db.query<Record<string, unknown>>('SELECT content,meta,created_by,created_by_name FROM lead_activities ORDER BY content')).rows,
    });
    try {
        await db.exec(`
            CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
            CREATE TABLE sales_managers(shop_id uuid,name text,user_id uuid,is_active boolean);
            CREATE TABLE sales_manager_projects(shop_id uuid,manager_name text,project_id uuid);
            CREATE TABLE leads(id uuid PRIMARY KEY,shop_id uuid,project_id uuid,sales_manager_name text,status text,
                deleted_at timestamptz,updated_at timestamptz,last_contact_at timestamptz,next_followup_at timestamptz);
            CREATE TABLE lead_activities(id uuid DEFAULT gen_random_uuid(),shop_id uuid,lead_id uuid REFERENCES leads(id),
                type text,content text,meta jsonb,created_by uuid,created_by_name text,created_at timestamptz DEFAULT now());
            GRANT ALL ON sales_managers,sales_manager_projects,leads,lead_activities TO service_role;
        `);
        await db.query('INSERT INTO sales_managers VALUES ($1,$2,$3,true)', [shop, 'Бат', user]);
        await db.query('INSERT INTO sales_manager_projects VALUES ($1,$2,$3)', [shop, 'Бат', garden]);
        await db.query("INSERT INTO leads(id,shop_id,project_id,sales_manager_name,status,updated_at) VALUES ($1,$2,$3,$4,'closed_won','2026-09-30T00:00:00Z')", [lead, shop, garden, 'Бат']);
        const migration = readFileSync('supabase/migrations/20261001134000_scoped_lead_contact.sql', 'utf8');
        await db.exec(migration); await db.exec(migration);
        await db.exec('SET ROLE authenticated');
        await expect(record({ type: 'note', content: 'Тэмдэглэл' })).rejects.toMatchObject({ code: '42501' });
        await db.exec('RESET ROLE; SET ROLE service_role');
        const beforeNote = (await snapshot()).lead;
        const note = (await record({ type: 'note', content: 'Тэмдэглэл' })).rows[0].activity;
        expect(note).toMatchObject({ type: 'note', created_by_name: 'Бат', meta: {} });
        expect((await snapshot()).lead).toEqual(beforeNote);
        await record({ type: 'call', content: 'Ярьсан', next_followup_at: '2026-10-02T08:00:00+08:00' });
        const afterCall = await snapshot();
        expect(afterCall.lead[0]).toMatchObject({ status: 'closed_won', next_followup_at: new Date('2026-10-02T00:00:00Z') });
        expect(afterCall.lead[0].last_contact_at).not.toBeNull();
        expect(afterCall.history).toMatchObject([
            { created_by: user, created_by_name: 'Бат' }, { created_by: user, created_by_name: 'Бат' },
        ]);
        await record({ type: 'note', content: 'Дараагийн холбоог цэвэрлэв', next_followup_at: null });
        const beforeDenial = await snapshot();
        expect(beforeDenial.lead[0].next_followup_at).toBeNull();
        expect(beforeDenial.lead[0].last_contact_at).toEqual(afterCall.lead[0].last_contact_at);

        for (const changes of [{ project: garden, owner: 'Сараа', deleted: null }, { project: elysium, owner: 'Бат', deleted: null }, { project: null, owner: 'Бат', deleted: null }, { project: garden, owner: 'Бат', deleted: '2026-10-01T00:00:00Z' }]) {
            await db.query('UPDATE leads SET project_id=$1,sales_manager_name=$2,deleted_at=$3', [changes.project, changes.owner, changes.deleted]);
            await expect(record({ type: 'note', content: 'Хуучин менежер' })).rejects.toMatchObject({ code: 'P0002' });
            await expect(record({ type: 'call', content: 'Хуучин менежер' })).rejects.toMatchObject({ code: 'P0002' });
            expect(await snapshot()).toEqual(beforeDenial);
        }
        await db.query('UPDATE leads SET project_id=$1,sales_manager_name=$2,deleted_at=NULL', [garden, 'Бат']);
        for (const changes of [{ userId: otherUser, active: true }, { userId: user, active: false }]) {
            await db.query('UPDATE sales_managers SET user_id=$1,is_active=$2', [changes.userId, changes.active]);
            await expect(record({ type: 'call', content: 'Хуучин акаунт' })).rejects.toMatchObject({ code: 'P0002' });
        }
        await db.query('UPDATE sales_managers SET user_id=$1,is_active=true', [user]);
        await db.query('INSERT INTO sales_managers VALUES ($1,$2,$3,true)', [shop, 'Давхар', user]);
        await expect(record({ type: 'note', content: 'Давхар акаунт' })).rejects.toMatchObject({ code: 'P0002' });
        await db.query('DELETE FROM sales_managers WHERE name=$1', ['Давхар']);
        await db.exec('DELETE FROM sales_manager_projects');
        await expect(record({ type: 'call', content: 'Харьяалал цуцлагдсан' })).rejects.toMatchObject({ code: 'P0002' });
        await db.query('INSERT INTO sales_manager_projects VALUES ($1,$2,$3)', [shop, 'Бат', garden]);
        await expect(record({ type: 'note', content: 'Scope цуцлагдсан' }, [elysium, null])).rejects.toMatchObject({ code: 'P0002' });
        for (const invalid of [{ type: 'status', content: 'Төлөв' }, { type: 'note', content: '' }, { type: 'note', content: 'Хязгааргүй', next_followup_at: 'infinity' }]) {
            await expect(record(invalid)).rejects.toMatchObject({ code: '22023' });
        }
        expect(await snapshot()).toEqual(beforeDenial);

        await db.exec('RESET ROLE; ALTER TABLE lead_activities ADD CONSTRAINT fail_history CHECK(false) NOT VALID; SET ROLE service_role');
        await expect(record({ type: 'call', content: 'Rollback', next_followup_at: '2026-10-03T00:00:00Z' })).rejects.toMatchObject({ code: '23514' });
        await expect(record({ type: 'note', content: 'Rollback' })).rejects.toMatchObject({ code: '23514' });
        expect(await snapshot()).toEqual(beforeDenial);
    } finally { await db.close(); }
}, 20_000);

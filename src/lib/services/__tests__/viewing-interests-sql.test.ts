// @vitest-environment node
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { expect, it } from 'vitest';

it('saves scoped and admin interest edits atomically with zero-area fallback and rejects foreign combinations', async () => {
    const db = new PGlite();
    const shop = '10000000-0000-4000-8000-000000000001', foreignShop = '10000000-0000-4000-8000-000000000002';
    const user = '20000000-0000-4000-8000-000000000001', project = '30000000-0000-4000-8000-000000000001';
    const lead = '40000000-0000-4000-8000-000000000001', unit = '50000000-0000-4000-8000-000000000001';
    const interest = { block: 'B1', model: 'E3', area_sqm: 85.19, floor: 13, unit_id: unit, payment_condition: null, quote: null, quote_unavailable_reason: 'Баталсан үнэ алга' };
    const input = { project_id: project, walk_in: true, meeting_type: 'new_customer', interests: [interest], agent_notes: 'Ойрхон амьдардаг' };
    const create = (interests: unknown[], scoped = true) => db.query<{ result: { id: string; status: string } }>(
        'SELECT create_scoped_sales_viewing($1,$2,$3,$4,$5,$6) AS result', [shop, lead, user, scoped ? 'Бат' : null, scoped ? [project] : null, JSON.stringify({ ...input, interests })]);
    const update = (id: string, patch: object, scoped = true) => db.query<{ result: { id: string; interests: unknown[] } }>(
        'SELECT update_scoped_sales_viewing($1,$2,$3,$4,$5,$6) AS result', [shop, id, user, scoped ? 'Бат' : null, scoped ? [project] : null, JSON.stringify(patch)]);
    try {
        await db.exec(`
            CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
            CREATE TABLE sales_managers(shop_id uuid,name text,user_id uuid,is_active boolean);
            CREATE TABLE sales_manager_projects(shop_id uuid,manager_name text,project_id uuid);
            CREATE TABLE leads(id uuid PRIMARY KEY,shop_id uuid,project_id uuid,sales_manager_name text,status text,deleted_at timestamptz,
                updated_at timestamptz,last_contact_at timestamptz,viewing_scheduled_at timestamptz,next_followup_at timestamptz);
            CREATE TABLE properties(id uuid PRIMARY KEY,shop_id uuid,project_id uuid,name text,deleted_at timestamptz);
            CREATE TABLE property_units(id uuid PRIMARY KEY,shop_id uuid,project_id uuid,category text,block text,model text,floor text,
                updated_sale_area numeric,sale_area numeric,contracted_area numeric);
            CREATE TABLE property_viewings(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),shop_id uuid,lead_id uuid REFERENCES leads(id),property_id uuid,
                status text,scheduled_at timestamptz,completed_at timestamptz,meeting_type text,sales_manager_name text,
                agent_notes text,customer_feedback text,interest_level integer,deleted_at timestamptz);
            CREATE TABLE lead_activities(id uuid DEFAULT gen_random_uuid(),shop_id uuid,lead_id uuid REFERENCES leads(id),type text,content text,meta jsonb,created_by uuid,created_by_name text);
            GRANT ALL ON sales_managers,sales_manager_projects,leads,properties,property_units,property_viewings,lead_activities TO service_role;
        `);
        await db.query('INSERT INTO sales_managers VALUES ($1,$2,$3,true)', [shop, 'Бат', user]);
        await db.query('INSERT INTO sales_manager_projects VALUES ($1,$2,$3)', [shop, 'Бат', project]);
        await db.query("INSERT INTO leads(id,shop_id,project_id,sales_manager_name,status) VALUES ($1,$2,$3,$4,'new')", [lead, shop, project, 'Бат']);
        await db.query("INSERT INTO property_units VALUES ($1,$2,$3,'residential','Б1','Е3','13',0,85.19,null)", [unit, shop, project]);
        const sql = readFileSync('supabase/migrations/20261008121000_viewing_interests.sql', 'utf8');
        await db.exec(sql); await db.exec(sql);
        await db.exec('SET ROLE authenticated');
        await expect(create([interest], false)).rejects.toMatchObject({ code: '42501' });
        await db.exec('RESET ROLE; SET ROLE service_role');
        const manager = (await create([interest])).rows[0].result;
        const admin = (await create([{ ...interest, unit_id: null }], false)).rows[0].result;
        expect(manager.status).toBe('completed');
        const saved = await db.query<{ interests: unknown[]; agent_notes: string; sales_manager_name: string; completed_at: string }>('SELECT interests,agent_notes,sales_manager_name,completed_at FROM property_viewings WHERE id=$1', [admin.id]);
        expect(saved.rows[0]).toMatchObject({ interests: [{ ...interest, unit_id: null }], agent_notes: 'Ойрхон амьдардаг', sales_manager_name: 'Бат' });
        const beforeCompleted = saved.rows[0].completed_at;
        await update(admin.id, { interests: [], meeting_type: 'repeat_customer', agent_notes: 'Дахин ирсэн', status: 'completed' }, false);
        expect((await db.query<{ interests: unknown[]; completed_at: string }>('SELECT interests,completed_at FROM property_viewings WHERE id=$1', [admin.id])).rows[0])
            .toMatchObject({ interests: [], completed_at: beforeCompleted });
        for (const invalid of [{ ...interest, area_sqm: 80.35 }, { ...interest, floor: 5 }, { ...interest, model: 'E6' }]) {
            await expect(create([invalid], false)).rejects.toMatchObject({ code: 'P0002' });
        }
        await db.query('UPDATE property_units SET sale_area=80.35');
        const contactBefore = (await db.query('SELECT last_contact_at FROM leads')).rows;
        const meetingsBefore = (await db.query("SELECT count(*) FROM lead_activities WHERE type='meeting'")).rows;
        await update(manager.id, { interests: [interest, { ...interest, area_sqm: 80.35, unit_id: null }] });
        expect((await db.query<{ interests: unknown[] }>('SELECT interests FROM property_viewings WHERE id=$1', [manager.id])).rows[0].interests[0]).toEqual(interest);
        expect((await db.query('SELECT last_contact_at FROM leads')).rows).toEqual(contactBefore);
        expect((await db.query("SELECT count(*) FROM lead_activities WHERE type='meeting'")).rows).toEqual(meetingsBefore);
        expect((await db.query("SELECT type,meta->>'action' AS action FROM lead_activities WHERE content='Уулзалтын мэдээлэл шинэчлэв' ORDER BY id")).rows)
            .toEqual([{ type: 'note', action: 'viewing_update' }, { type: 'note', action: 'viewing_update' }]);
        await db.query('UPDATE property_units SET sale_area=85.19');
        await db.query('UPDATE property_units SET shop_id=$1', [foreignShop]);
        await expect(update(manager.id, { interests: [{ ...interest, floor: null }] })).rejects.toMatchObject({ code: 'P0002' });
        await db.query('UPDATE property_units SET shop_id=$1', [shop]);
        await db.query("UPDATE leads SET sales_manager_name='Сараа'");
        await expect(update(manager.id, { interests: [] })).rejects.toMatchObject({ code: 'P0002' });
        await db.query("UPDATE leads SET sales_manager_name='Бат'");
        const before = (await db.query('SELECT interests,agent_notes FROM property_viewings WHERE id=$1', [manager.id])).rows;
        await db.exec('RESET ROLE; ALTER TABLE lead_activities ADD CONSTRAINT fail_history CHECK(false) NOT VALID; SET ROLE service_role');
        await expect(update(manager.id, { interests: [], agent_notes: 'Should roll back' }, false)).rejects.toMatchObject({ code: '23514' });
        expect((await db.query('SELECT interests,agent_notes FROM property_viewings WHERE id=$1', [manager.id])).rows).toEqual(before);
        expect((await db.query('SELECT count(*) FROM property_viewings')).rows).toEqual([{ count: 2 }]);
    } finally { await db.close(); }
}, 20_000);

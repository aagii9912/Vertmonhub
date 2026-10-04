// @vitest-environment node
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { expect, it } from 'vitest';

const shop = '10000000-0000-4000-8000-000000000001';
const user = '20000000-0000-4000-8000-000000000001';
const garden = '30000000-0000-4000-8000-000000000001';
const lead = '40000000-0000-4000-8000-000000000001';

async function setup() {
    const db = new PGlite();
    await db.exec(`
        CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
        CREATE TABLE sales_managers(shop_id uuid,name text,user_id uuid,is_active boolean);
        CREATE TABLE sales_manager_projects(shop_id uuid,manager_name text,project_id uuid);
        CREATE TABLE leads(id uuid PRIMARY KEY,shop_id uuid,project_id uuid,sales_manager_name text,status text,
            deleted_at timestamptz,updated_at timestamptz,last_contact_at timestamptz,next_followup_at timestamptz);
        -- Production-тэй ижил inline CHECK (нэр нь lead_activities_type_check).
        CREATE TABLE lead_activities(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),shop_id uuid,lead_id uuid REFERENCES leads(id),
            type text NOT NULL CHECK (type IN ('note','call','status','manager','meeting','contract','system')),
            content text,meta jsonb NOT NULL DEFAULT '{}'::jsonb,created_by uuid,created_by_name text,created_at timestamptz DEFAULT now());
        GRANT ALL ON sales_managers,sales_manager_projects,leads,lead_activities TO service_role;
    `);
    await db.query('INSERT INTO sales_managers VALUES ($1,$2,$3,true)', [shop, 'Бат', user]);
    await db.query('INSERT INTO sales_manager_projects VALUES ($1,$2,$3)', [shop, 'Бат', garden]);
    await db.query("INSERT INTO leads(id,shop_id,project_id,sales_manager_name,status,updated_at) VALUES ($1,$2,$3,$4,'offered','2026-09-30T00:00:00Z')", [lead, shop, garden, 'Бат']);
    for (const file of ['20261001134000_scoped_lead_contact.sql', '20261004162000_lead_activity_quotes.sql', '20261004162000_lead_activity_quotes.sql']) {
        await db.exec(readFileSync(`supabase/migrations/${file}`, 'utf8'));
    }
    return db;
}

it('replaces the activity type check idempotently and validates quote meta on direct writes', async () => {
    const db = await setup();
    const insert = (type: string, meta: object) => db.query(
        'INSERT INTO lead_activities(shop_id,lead_id,type,content,meta) VALUES ($1,$2,$3,$4,$5::jsonb)',
        [shop, lead, type, 'x', JSON.stringify(meta)],
    );
    try {
        const checks = (await db.query<{ conname: string; def: string }>(
            "SELECT conname, pg_get_constraintdef(oid) AS def FROM pg_constraint WHERE conrelid = 'lead_activities'::regclass AND contype = 'c' ORDER BY conname",
        )).rows;
        expect(checks.map((row) => row.conname)).toEqual(['lead_activities_quote_meta_check', 'lead_activities_type_check']);
        expect(checks[1].def).toContain("'quote'");

        await insert('quote', { amount: 450_000_000, unit_label: 'A-1203' });
        await insert('quote', { amount: 1 });
        await insert('note', { amount: 'not checked for notes' });
        for (const meta of [{}, { amount: 0 }, { amount: -5 }, { amount: 1.5 }, { amount: '450000000' }, { amount: 1e14 },
            { amount: 10, unit_label: '' }, { amount: 10, unit_label: 12 }, { amount: 10, unit_label: 'x'.repeat(61) }]) {
            await expect(insert('quote', meta)).rejects.toMatchObject({ code: '23514' });
        }
        await expect(insert('unknown', {})).rejects.toMatchObject({ code: '23514' });
    } finally { await db.close(); }
}, 20_000);

it('records a scoped quote as a contact with amount meta and rejects malformed quotes without side effects', async () => {
    const db = await setup();
    const record = (input: object) => db.query<{ activity: { type: string; content: string; meta: Record<string, unknown>; created_by: string; created_by_name: string } }>(
        'SELECT record_scoped_sales_lead_contact($1::uuid,$2::uuid,$3::uuid,$4::text,$5::uuid[],$6::jsonb) AS activity',
        [shop, lead, user, 'Бат', [garden], JSON.stringify(input)],
    );
    const snapshot = async () => ({
        lead: (await db.query<Record<string, unknown>>('SELECT status,updated_at,last_contact_at,next_followup_at FROM leads')).rows,
        history: (await db.query<Record<string, unknown>>('SELECT type,content,meta FROM lead_activities ORDER BY created_at,content')).rows,
    });
    try {
        await db.exec('SET ROLE authenticated');
        await expect(record({ type: 'quote', content: 'Санал', quote: { amount: 1 } })).rejects.toMatchObject({ code: '42501' });
        await db.exec('RESET ROLE; SET ROLE service_role');

        const quote = (await record({ type: 'quote', content: 'Үнийн санал: 450,000,000₮ · A-1203', quote: { amount: 450_000_000, unit_label: '  A-1203 ' } })).rows[0].activity;
        expect(quote).toMatchObject({ type: 'quote', created_by: user, created_by_name: 'Бат', meta: { amount: 450_000_000, unit_label: 'A-1203' } });
        const afterQuote = await snapshot();
        // Санал нь холбоо барилт: last_contact_at шинэчлэгдэнэ, статус өөрчлөгдөхгүй.
        expect(afterQuote.lead[0]).toMatchObject({ status: 'offered', next_followup_at: null });
        expect(afterQuote.lead[0].last_contact_at).not.toBeNull();

        const withFollowup = (await record({ type: 'quote', content: 'Санал', quote: { amount: 430_000_000, unit_label: null }, next_followup_at: '2026-10-06T10:00:00+08:00' })).rows[0].activity;
        expect(withFollowup.meta).toEqual({ amount: 430_000_000, next_followup_at: '2026-10-06T10:00:00+08:00' });
        const before = await snapshot();
        expect(before.lead[0].next_followup_at).toEqual(new Date('2026-10-06T02:00:00Z'));

        for (const invalid of [
            { type: 'quote', content: 'Санал' },
            { type: 'quote', content: 'Санал', quote: 450_000_000 },
            { type: 'quote', content: 'Санал', quote: { amount: '450000000' } },
            { type: 'quote', content: 'Санал', quote: { amount: 0 } },
            { type: 'quote', content: 'Санал', quote: { amount: 12.5 } },
            { type: 'quote', content: 'Санал', quote: { amount: 1e14 } },
            { type: 'quote', content: 'Санал', quote: { amount: 10, unit_label: 'x'.repeat(61) } },
            { type: 'quote', content: 'Санал', quote: { amount: 10, unit_label: 7 } },
            { type: 'quote', content: 'Санал', quote: { amount: 10, discount: 5 } },
            { type: 'quote', content: '', quote: { amount: 10 } },
            { type: 'note', content: 'Тэмдэглэл', quote: { amount: 10 } },
            { type: 'call', content: 'Залгав', quote: { amount: 10 } },
        ]) {
            await expect(record(invalid)).rejects.toMatchObject({ code: '22023' });
        }
        expect(await snapshot()).toEqual(before);

        // Өөр менежерт шилжсэн лидэд хуучин менежер санал бүртгэж чадахгүй.
        await db.exec('RESET ROLE');
        await db.query("UPDATE leads SET sales_manager_name='Сараа'");
        await db.exec('SET ROLE service_role');
        await expect(record({ type: 'quote', content: 'Санал', quote: { amount: 10 } })).rejects.toMatchObject({ code: 'P0002' });
        expect((await snapshot()).history).toEqual(before.history);
    } finally { await db.close(); }
}, 20_000);

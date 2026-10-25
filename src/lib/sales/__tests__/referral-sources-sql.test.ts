// @vitest-environment node
import { readFileSync } from 'node:fs';
import { migrationVerifyQuery } from '@/test/migration-verify';
import { PGlite } from '@electric-sql/pglite';
import { describe, expect, it } from 'vitest';

const shop = '60000000-0000-4000-8000-000000000001';
const otherShop = '60000000-0000-4000-8000-000000000002';
const garden = '61000000-0000-4000-8000-000000000001';
const foreignProject = '61000000-0000-4000-8000-000000000002';
const batUser = '62000000-0000-4000-8000-000000000001';
const viewingInterests = readFileSync('supabase/migrations/20261008121000_viewing_interests.sql', 'utf8');
const dailyReports = readFileSync('supabase/migrations/20261007120000_daily_reports.sql', 'utf8');
const dailyTeam = readFileSync('supabase/migrations/20261019120000_daily_report_team_entry.sql', 'utf8');
const migration = readFileSync('supabase/migrations/20261023151000_sales_referral_sources.sql', 'utf8');

// Supabase-ийн default privilege (шинэ хүснэгт, функц anon/authenticated-д нээлттэй) + RPC-ийн хүрдэг баганууд.
const prerequisites = `
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
    GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon, authenticated, service_role;
    CREATE TYPE public.lead_status AS ENUM ('new', 'contacted', 'viewing_scheduled', 'offered', 'negotiating', 'closed_won', 'closed_lost');
    CREATE TABLE public.shops(id uuid PRIMARY KEY);
    CREATE TABLE public.projects(id uuid PRIMARY KEY, shop_id uuid NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
        name text NOT NULL, UNIQUE (shop_id, id));
    CREATE TABLE public.sales_managers(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        shop_id uuid NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE, name text NOT NULL, user_id uuid,
        is_active boolean NOT NULL DEFAULT true, UNIQUE (shop_id, name));
    CREATE TABLE public.sales_manager_projects(shop_id uuid NOT NULL, manager_name text NOT NULL, project_id uuid NOT NULL,
        PRIMARY KEY (shop_id, manager_name, project_id));
    CREATE TABLE public.leads(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        shop_id uuid NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
        project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL,
        status public.lead_status NOT NULL DEFAULT 'new', source varchar(50) DEFAULT 'messenger',
        customer_name varchar(255), customer_phone varchar(50), sales_manager_name text,
        last_contact_at timestamptz, next_followup_at timestamptz, viewing_scheduled_at timestamptz, deleted_at timestamptz,
        created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now());
    CREATE TABLE public.properties(id uuid PRIMARY KEY, shop_id uuid, project_id uuid, name text, deleted_at timestamptz);
    CREATE TABLE public.property_units(id uuid PRIMARY KEY, shop_id uuid, project_id uuid, category text, block text, model text,
        floor text, updated_sale_area numeric, sale_area numeric, contracted_area numeric);
    CREATE TABLE public.property_viewings(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        shop_id uuid REFERENCES public.shops(id) ON DELETE CASCADE, lead_id uuid REFERENCES public.leads(id) ON DELETE CASCADE,
        property_id uuid, scheduled_at timestamptz NOT NULL, status varchar(20) DEFAULT 'scheduled',
        customer_feedback text, agent_notes text, interest_level integer,
        meeting_type varchar(20) CHECK (meeting_type IN ('new_customer', 'repeat_customer', 'existing_buyer')),
        sales_manager_name text, deleted_at timestamptz, created_at timestamptz DEFAULT now(), completed_at timestamptz);
    CREATE TABLE public.property_contracts(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        shop_id uuid REFERENCES public.shops(id) ON DELETE CASCADE, unit_label text, deleted_at timestamptz);
    CREATE TABLE public.lead_activities(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        shop_id uuid NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
        lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
        type text NOT NULL, content text, meta jsonb NOT NULL DEFAULT '{}'::jsonb, created_by uuid, created_by_name text,
        created_at timestamptz NOT NULL DEFAULT now(), seq bigint GENERATED ALWAYS AS IDENTITY);
    CREATE TABLE public.data_audit_log(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), shop_id uuid, actor_id uuid,
        entity varchar(48) NOT NULL, entity_id text, action varchar(24) NOT NULL, changes jsonb DEFAULT '{}'::jsonb,
        created_at timestamptz NOT NULL DEFAULT now());
    INSERT INTO public.shops VALUES ('${shop}'), ('${otherShop}');
    INSERT INTO public.projects VALUES ('${garden}', '${shop}', 'Elysium'), ('${foreignProject}', '${otherShop}', 'Mandala');
    INSERT INTO public.sales_managers(shop_id, name, user_id, is_active) VALUES ('${shop}', 'Бат', '${batUser}', true);
    INSERT INTO public.sales_manager_projects VALUES ('${shop}', 'Бат', '${garden}');
`;

async function setup() {
    const db = new PGlite();
    await db.exec(prerequisites);
    await db.exec(viewingInterests);
    await db.exec(dailyReports);
    await db.exec(dailyTeam);
    await db.exec(migration);
    await db.exec(migration); // Дахин ажиллуулж болно.
    return db;
}

const code = (value: string) => ({ code: value });

describe('apply-migrations VERIFY', () => {
    it('passes on the migrated schema', async () => {
        const db = await setup();
        try {
            expect((await db.query<{ ok: boolean }>(migrationVerifyQuery('20261023151000'))).rows[0].ok).toBe(true);
        } finally { await db.close(); }
    });
});

async function source(db: PGlite, name: string, shopId = shop, archived = false) {
    return (await db.query<{ id: string }>(`INSERT INTO public.sales_referral_sources(shop_id, name, archived_at)
        VALUES ($1, $2, $3) RETURNING id`, [shopId, name, archived ? '2026-10-20T00:00:00Z' : null])).rows[0].id;
}

it('creates a server-only, idempotent pick list with one active name per project and same-shop links', async () => {
    const db = await setup();
    try {
        expect((await db.query(`SELECT count(*)::int AS n FROM pg_constraint
            WHERE conname IN ('property_viewings_referral_same_shop_fkey', 'property_contracts_referral_same_shop_fkey')`)).rows).toEqual([{ n: 2 }]);
        expect((await db.query(`SELECT relrowsecurity AS rls FROM pg_class WHERE oid = 'public.sales_referral_sources'::regclass`)).rows).toEqual([{ rls: true }]);
        expect((await db.query(`SELECT
            has_table_privilege('anon', 'public.sales_referral_sources', 'SELECT') AS anon_read,
            has_table_privilege('authenticated', 'public.sales_referral_sources', 'INSERT') AS user_write,
            has_table_privilege('service_role', 'public.sales_referral_sources', 'UPDATE') AS service_update,
            has_table_privilege('service_role', 'public.sales_referral_sources', 'DELETE') AS service_delete,
            has_function_privilege('authenticated', 'public.referral_source_name_key(text)', 'EXECUTE') AS user_key`)).rows)
            .toEqual([{ anon_read: false, user_write: false, service_update: true, service_delete: false, user_key: false }]);
        for (const role of ['anon', 'authenticated']) {
            await db.exec(`SET ROLE ${role}`);
            await expect(db.exec('SELECT * FROM public.sales_referral_sources')).rejects.toThrow(/permission denied/);
            await expect(db.exec(`SELECT public.create_scoped_sales_viewing(NULL::uuid, NULL::uuid, NULL::uuid, NULL::text, NULL::uuid[], NULL::jsonb)`)).rejects.toMatchObject(code('42501'));
            await expect(db.exec(`SELECT public.update_scoped_sales_viewing(NULL::uuid, NULL::uuid, NULL::uuid, NULL::text, NULL::uuid[], NULL::jsonb)`)).rejects.toMatchObject(code('42501'));
            await expect(db.exec(`SELECT public.record_daily_report_meeting(NULL::uuid, NULL::uuid, NULL::text, NULL::uuid[], NULL::text, NULL::date, NULL::jsonb)`)).rejects.toMatchObject(code('42501'));
            await db.exec('RESET ROLE');
        }

        await db.exec('SET ROLE service_role');
        const facebook = await source(db, 'Facebook');
        await source(db, 'Ойрхон амьдардаг');
        // Том/жижиг үсэг (кирилл ч), давхар зай ялгахгүй — идэвхтэй нэр давтагдахгүй.
        await expect(source(db, 'FACEBOOK')).rejects.toMatchObject(code('23505'));
        await expect(source(db, 'ОЙРХОН  АМЬДАРДАГ')).rejects.toMatchObject(code('23505'));
        await expect(source(db, ' Танил')).rejects.toMatchObject(code('23514'));
        await expect(source(db, 'x'.repeat(81))).rejects.toMatchObject(code('23514'));
        // Эрэмбэ дээд хязгааргүй (архивласан мөр олон болсон ч шинэ мөр 1000-д бөөгнөрөхгүй), сөрөг биш.
        await db.query(`INSERT INTO public.sales_referral_sources(shop_id, name, sort_order) VALUES ($1, 'Билбоард', 1010)`, [shop]);
        await expect(db.query(`INSERT INTO public.sales_referral_sources(shop_id, name, sort_order) VALUES ($1, 'Сөрөг', -10)`, [shop])).rejects.toMatchObject(code('23514'));
        await expect(db.query('DELETE FROM public.sales_referral_sources WHERE id = $1', [facebook])).rejects.toThrow(/permission denied/);
        // Өөр төсөл ижил нэртэй байж болно; архивласан нэрийг дахин нэмж болно.
        const foreignFacebook = await source(db, 'Facebook', otherShop);
        await db.query('UPDATE public.sales_referral_sources SET archived_at = now() WHERE id = $1', [facebook]);
        const facebookAgain = await source(db, 'facebook');
        expect(facebookAgain).not.toBe(facebook);

        // Composite FK: өөр төслийн сонголтод холбохгүй.
        await expect(db.query(`INSERT INTO public.property_viewings(shop_id, scheduled_at, referral_source_id) VALUES ($1, now(), $2)`, [shop, foreignFacebook]))
            .rejects.toMatchObject(code('23503'));
        await expect(db.query(`INSERT INTO public.property_contracts(shop_id, unit_label, referral_source_id) VALUES ($1, 'Б2-171', $2)`, [shop, foreignFacebook]))
            .rejects.toMatchObject(code('23503'));
        await db.query(`INSERT INTO public.property_contracts(shop_id, unit_label, referral_source_id) VALUES ($1, 'Б2-171', $2)`, [shop, facebookAgain]);
        await db.query(`INSERT INTO public.property_contracts(shop_id, unit_label) VALUES ($1, 'Б2-208')`, [shop]);
        expect((await db.query(`SELECT unit_label, referral_source_id FROM public.property_contracts ORDER BY unit_label`)).rows)
            .toEqual([{ unit_label: 'Б2-171', referral_source_id: facebookAgain }, { unit_label: 'Б2-208', referral_source_id: null }]);
    } finally {
        await db.close();
    }
});

it('viewing RPCs store, validate and keep the referral while old inputs keep working', async () => {
    const db = await setup();
    try {
        await db.exec('SET ROLE service_role');
        const facebook = await source(db, 'Facebook');
        const neighbour = await source(db, 'Ойрхон амьдардаг');
        const archived = await source(db, 'Бармаш түрээслэгч', shop, true);
        const foreign = await source(db, 'Монкон', otherShop);
        const lead = (await db.query<{ id: string }>(`INSERT INTO public.leads(shop_id, project_id, customer_name, customer_phone, status, sales_manager_name)
            VALUES ($1, $2, 'Болд', '99112233', 'new', 'Бат') RETURNING id`, [shop, garden])).rows[0].id;
        const create = async (input: Record<string, unknown>, scoped = true) => (await db.query<{ result: { id: string; status: string } }>(
            'SELECT public.create_scoped_sales_viewing($1,$2,$3,$4,$5,$6) AS result',
            [shop, lead, batUser, scoped ? 'Бат' : null, scoped ? [garden] : null,
                JSON.stringify({ project_id: garden, walk_in: true, meeting_type: 'new_customer', agent_notes: 'Ойрхон амьдардаг', ...input })])).rows[0].result;
        const update = async (id: string, patch: Record<string, unknown>, scoped = true) => (await db.query<{ result: Record<string, unknown> }>(
            'SELECT public.update_scoped_sales_viewing($1,$2,$3,$4,$5,$6) AS result',
            [shop, id, batUser, scoped ? 'Бат' : null, scoped ? [garden] : null, JSON.stringify(patch)])).rows[0].result;
        const saved = async (id: string) => (await db.query<{ referral_source_id: string | null; agent_notes: string | null; status: string }>(
            'SELECT referral_source_id, agent_notes, status FROM public.property_viewings WHERE id = $1', [id])).rows[0];

        // Хуучин хэлбэрийн оролт (Сэжимгүй) хэвээр ажиллана.
        const plain = await create({});
        expect(await saved(plain.id)).toEqual({ referral_source_id: null, agent_notes: 'Ойрхон амьдардаг', status: 'completed' });
        const withSource = await create({ referral_source_id: neighbour });
        expect((await saved(withSource.id)).referral_source_id).toBe(neighbour);
        const admin = await create({ referral_source_id: facebook, walk_in: false, scheduled_at: '2026-10-25T03:00:00Z' }, false);
        expect(await saved(admin.id)).toMatchObject({ referral_source_id: facebook, status: 'scheduled' });

        for (const bad of [archived, foreign]) await expect(create({ referral_source_id: bad })).rejects.toMatchObject(code('22023'));
        await expect(create({ referral_source_id: 'Facebook' })).rejects.toMatchObject(code('22P02'));
        await expect(create({ referral_source_id: 42 })).rejects.toMatchObject(code('22023'));
        await expect(create({ referral: facebook })).rejects.toMatchObject(code('22023'));
        expect((await db.query('SELECT count(*)::int AS n FROM public.property_viewings')).rows).toEqual([{ n: 3 }]);

        // Засвар: солих, хоосон болгох; архивласан одоогийн сонголтоо хэвээр үлдээж болно, шинээр сонгохгүй.
        const notesBefore = (await db.query(`SELECT count(*)::int AS n FROM public.lead_activities WHERE content = 'Уулзалтын мэдээлэл шинэчлэв'`)).rows[0];
        expect(await update(plain.id, { referral_source_id: facebook })).toMatchObject({ referral_source_id: facebook });
        expect((await saved(plain.id)).referral_source_id).toBe(facebook);
        expect((await db.query(`SELECT count(*)::int AS n FROM public.lead_activities WHERE content = 'Уулзалтын мэдээлэл шинэчлэв'`)).rows[0])
            .toEqual({ n: (notesBefore as { n: number }).n + 1 });
        await db.query('UPDATE public.sales_referral_sources SET archived_at = now() WHERE id = $1', [facebook]);
        await update(plain.id, { referral_source_id: facebook, agent_notes: 'Дахин ирнэ' });
        expect(await saved(plain.id)).toMatchObject({ referral_source_id: facebook, agent_notes: 'Дахин ирнэ' });
        await expect(update(withSource.id, { referral_source_id: facebook })).rejects.toMatchObject(code('22023'));
        await expect(update(withSource.id, { referral_source_id: foreign }, false)).rejects.toMatchObject(code('22023'));
        await expect(update(withSource.id, { referral_source_id: 7 })).rejects.toMatchObject(code('22023'));
        expect((await saved(withSource.id)).referral_source_id).toBe(neighbour);
        await update(withSource.id, { referral_source_id: null });
        expect((await saved(withSource.id)).referral_source_id).toBeNull();
        // Сэжимд хүрэхгүй засвар утгыг өөрчлөхгүй.
        await update(plain.id, { status: 'completed', interest_level: 4 });
        expect((await saved(plain.id)).referral_source_id).toBe(facebook);
    } finally {
        await db.close();
    }
});

it('daily report meeting RPC records the referral of the meeting and rejects foreign, archived or malformed ones', async () => {
    const db = await setup();
    try {
        await db.exec('SET ROLE service_role');
        const facebook = await source(db, 'Facebook');
        const archived = await source(db, 'Бармаш түрээслэгч', shop, true);
        const foreign = await source(db, 'Монкон', otherShop);
        const day = (await db.query<{ day: string }>(`SELECT ((now() - interval '2 days') AT TIME ZONE 'Asia/Ulaanbaatar')::date::text AS day`)).rows[0].day;
        let phone = 99112230;
        const record = async (input: Record<string, unknown>) => (await db.query<{ result: { viewing_id: string; lead_created: boolean } }>(
            `SELECT public.record_daily_report_meeting(p_shop_id => $1::uuid, p_user_id => $2::uuid, p_actor_name => 'Бат',
                p_actor_project_ids => $3::uuid[], p_manager_name => 'Бат', p_report_date => $4::date, p_input => $5::jsonb) AS result`,
            [shop, batUser, [garden], day, JSON.stringify({ project_id: garden, customer_name: 'Тэмүүжин', customer_phone: String(phone++),
                meeting_type: 'new_customer', scheduled_at: `${day}T10:00:00+08:00`, customer_label: 'Тэмүүжин', ...input })])).rows[0].result;

        const plain = await record({});
        const sourced = await record({ referral_source_id: facebook });
        expect(sourced.lead_created).toBe(true);
        expect((await db.query('SELECT id, referral_source_id FROM public.property_viewings ORDER BY referral_source_id NULLS FIRST')).rows)
            .toEqual([{ id: plain.viewing_id, referral_source_id: null }, { id: sourced.viewing_id, referral_source_id: facebook }]);
        for (const bad of [archived, foreign]) await expect(record({ referral_source_id: bad })).rejects.toMatchObject(code('22023'));
        await expect(record({ referral_source_id: 'Facebook' })).rejects.toMatchObject(code('22023'));
        await expect(record({ referral_source_id: 5 })).rejects.toMatchObject(code('22023'));
        // Татгалзсан бүртгэл лид ч үлдээхгүй (нэг гүйлгээ).
        expect((await db.query('SELECT count(*)::int AS viewings, (SELECT count(*)::int FROM public.leads) AS leads FROM public.property_viewings')).rows)
            .toEqual([{ viewings: 2, leads: 2 }]);
    } finally {
        await db.close();
    }
});

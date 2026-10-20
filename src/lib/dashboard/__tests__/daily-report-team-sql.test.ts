// @vitest-environment node
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { expect, it } from 'vitest';

const shop = '40000000-0000-4000-8000-000000000001';
const otherShop = '40000000-0000-4000-8000-000000000002';
const garden = '41000000-0000-4000-8000-000000000001';
const foreignProject = '41000000-0000-4000-8000-000000000002';
const batUser = '42000000-0000-4000-8000-000000000001';
const saraaUser = '42000000-0000-4000-8000-000000000002';
const adminUser = '42000000-0000-4000-8000-000000000003';
const strangerUser = '42000000-0000-4000-8000-000000000004';
const dailyReports = readFileSync('supabase/migrations/20261007120000_daily_reports.sql', 'utf8');
const migration = readFileSync('supabase/migrations/20261019120000_daily_report_team_entry.sql', 'utf8');

// Supabase-ийн default privilege (бүх шинэ хүснэгт, функц anon/authenticated-д нээлттэй) + RPC-ийн хүрдэг баганууд.
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
        PRIMARY KEY (shop_id, manager_name, project_id),
        FOREIGN KEY (shop_id, manager_name) REFERENCES public.sales_managers(shop_id, name) ON UPDATE CASCADE ON DELETE CASCADE,
        FOREIGN KEY (shop_id, project_id) REFERENCES public.projects(shop_id, id) ON DELETE CASCADE);
    CREATE TABLE public.leads(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        shop_id uuid NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
        project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL,
        status public.lead_status NOT NULL DEFAULT 'new', source varchar(50) DEFAULT 'messenger',
        customer_name varchar(255), customer_phone varchar(50), sales_manager_name text,
        last_contact_at timestamptz, next_followup_at timestamptz, viewing_scheduled_at timestamptz, deleted_at timestamptz,
        created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now());
    CREATE TABLE public.property_viewings(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        shop_id uuid REFERENCES public.shops(id) ON DELETE CASCADE, lead_id uuid REFERENCES public.leads(id) ON DELETE CASCADE,
        property_id uuid, scheduled_at timestamptz NOT NULL, status varchar(20) DEFAULT 'scheduled',
        customer_feedback text, agent_notes text,
        interest_level integer CONSTRAINT chk_viewing_interest CHECK (interest_level IS NULL OR interest_level BETWEEN 1 AND 5),
        meeting_type varchar(20) CHECK (meeting_type IN ('new_customer', 'repeat_customer', 'existing_buyer')),
        sales_manager_name text, interests jsonb NOT NULL DEFAULT '[]'::jsonb, deleted_at timestamptz,
        created_at timestamptz DEFAULT now(), completed_at timestamptz);
    CREATE TABLE public.lead_activities(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        shop_id uuid NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
        lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
        type text NOT NULL CHECK (type IN ('note', 'call', 'status', 'manager', 'meeting', 'contract', 'system', 'quote')),
        content text, meta jsonb NOT NULL DEFAULT '{}'::jsonb, created_by uuid, created_by_name text,
        created_at timestamptz NOT NULL DEFAULT now(), seq bigint GENERATED ALWAYS AS IDENTITY);
    CREATE TABLE public.data_audit_log(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), shop_id uuid, actor_id uuid,
        entity varchar(48) NOT NULL, entity_id text, action varchar(24) NOT NULL, changes jsonb DEFAULT '{}'::jsonb,
        created_at timestamptz NOT NULL DEFAULT now());
    -- 20261001131000: service-role бичилт ч өөр төслийн менежерт лид оноохгүй.
    CREATE SCHEMA private;
    CREATE FUNCTION private.enforce_sales_lead_assignment() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
    BEGIN
        IF TG_OP = 'UPDATE' AND NEW.shop_id IS NOT DISTINCT FROM OLD.shop_id
            AND NEW.project_id IS NOT DISTINCT FROM OLD.project_id
            AND NEW.sales_manager_name IS NOT DISTINCT FROM OLD.sales_manager_name THEN RETURN NEW; END IF;
        IF NEW.project_id IS NOT NULL AND NOT EXISTS (
            SELECT 1 FROM public.projects WHERE id = NEW.project_id AND shop_id = NEW.shop_id
        ) THEN RAISE EXCEPTION 'Лидийн төсөл байгууллагад харьяалагдахгүй байна' USING ERRCODE = '23514'; END IF;
        IF nullif(btrim(NEW.sales_manager_name), '') IS NULL THEN RETURN NEW; END IF;
        IF NEW.project_id IS NULL OR NOT EXISTS (
            SELECT 1 FROM public.sales_manager_projects AS membership
            JOIN public.sales_managers AS manager ON manager.shop_id = membership.shop_id
                AND manager.name = membership.manager_name AND manager.is_active
            WHERE membership.shop_id = NEW.shop_id AND membership.project_id = NEW.project_id
                AND membership.manager_name = NEW.sales_manager_name
        ) THEN RAISE EXCEPTION 'Тухайн төслийн идэвхтэй борлуулалтын менежерийг сонгоно уу' USING ERRCODE = '23514'; END IF;
        RETURN NEW;
    END;
    $$;
    CREATE TRIGGER enforce_sales_lead_assignment BEFORE INSERT OR UPDATE OF shop_id, project_id, sales_manager_name
        ON public.leads FOR EACH ROW EXECUTE FUNCTION private.enforce_sales_lead_assignment();
    INSERT INTO public.shops VALUES ('${shop}'), ('${otherShop}');
    INSERT INTO public.projects VALUES ('${garden}', '${shop}', 'Mandala Garden'), ('${foreignProject}', '${otherShop}', 'Elysium');
    INSERT INTO public.sales_managers(shop_id, name, user_id, is_active) VALUES
        ('${shop}', 'Бат', '${batUser}', true), ('${shop}', 'Сараа', '${saraaUser}', true),
        ('${shop}', 'Дорж', NULL, false), ('${shop}', 'Болд', NULL, true);
    INSERT INTO public.sales_manager_projects VALUES ('${shop}', 'Бат', '${garden}'), ('${shop}', 'Сараа', '${garden}'),
        ('${shop}', 'Дорж', '${garden}');
`;

async function setup() {
    const db = new PGlite();
    await db.exec(prerequisites);
    await db.exec(dailyReports);
    await db.exec(migration);
    await db.exec(migration); // Дахин ажиллуулж болно.
    return db;
}

const code = (value: string) => ({ code: value });

it('applies where data_audit_log was never created (production 2026-10-20) and adds its index once it exists', async () => {
    const db = new PGlite();
    try {
        await db.exec(prerequisites);
        await db.exec('DROP TABLE public.data_audit_log');
        await db.exec(dailyReports);
        await db.exec(migration);
        expect((await db.query(`SELECT to_regclass('public.daily_report_changes')::text AS changes,
            to_regclass('public.idx_data_audit_actor_created')::text AS audit_index`)).rows).toEqual([{ changes: 'daily_report_changes', audit_index: null }]);
        await db.exec(`CREATE TABLE public.data_audit_log(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), shop_id uuid, actor_id uuid,
            entity varchar(48) NOT NULL, entity_id text, action varchar(24) NOT NULL, changes jsonb DEFAULT '{}'::jsonb,
            created_at timestamptz NOT NULL DEFAULT now())`);
        await db.exec(migration);
        expect((await db.query(`SELECT to_regclass('public.idx_data_audit_actor_created')::text AS audit_index,
            has_table_privilege('anon', 'public.data_audit_log', 'SELECT') AS anon_read,
            has_table_privilege('authenticated', 'public.data_audit_log', 'INSERT') AS user_write`)).rows)
            .toEqual([{ audit_index: 'idx_data_audit_actor_created', anon_read: false, user_write: false }]);
    } finally {
        await db.close();
    }
});

it('history table is append-only, service-role only, idempotent and cascades with the shop', async () => {
    const db = await setup();
    const change = (values: string) => db.exec(`INSERT INTO public.daily_report_changes(shop_id, report_date, kind, manager_name, metric, note_key, viewing_id, meta)
        VALUES ('${shop}', '2026-10-15', ${values})`);
    try {
        expect((await db.query(`SELECT count(*)::int AS n FROM pg_constraint
            WHERE conrelid = 'public.daily_report_counts'::regclass AND pg_get_constraintdef(oid) LIKE '%updated_by_name%'`)).rows).toEqual([{ n: 1 }]);

        for (const role of ['anon', 'authenticated']) {
            await db.exec(`SET ROLE ${role}`);
            await expect(db.exec('SELECT * FROM public.daily_report_changes')).rejects.toThrow(/permission denied/);
            await expect(db.exec(`SELECT public.save_daily_report(NULL::uuid, NULL::date, NULL::uuid, NULL::text, NULL::jsonb, NULL::jsonb, NULL::boolean)`)).rejects.toMatchObject(code('42501'));
            await expect(db.exec(`SELECT public.record_daily_report_meeting(NULL::uuid, NULL::uuid, NULL::text, NULL::uuid[], NULL::text, NULL::date, NULL::jsonb)`)).rejects.toMatchObject(code('42501'));
            await expect(db.exec(`SELECT public.complete_daily_report_meeting(NULL::uuid, NULL::uuid, NULL::text, NULL::uuid[], NULL::uuid, NULL::text, NULL::jsonb, NULL::date, NULL::timestamptz, NULL::timestamptz)`)).rejects.toMatchObject(code('42501'));
            await expect(db.exec(`SELECT public.reassign_daily_report_meeting(NULL::uuid, NULL::uuid, NULL::text, NULL::uuid, NULL::text, NULL::date)`)).rejects.toMatchObject(code('42501'));
            await expect(db.exec(`SELECT nextval('public.daily_report_changes_id_seq')`)).rejects.toThrow(/permission denied/);
            await db.exec('RESET ROLE');
        }

        await db.exec('SET ROLE service_role');
        await change(`'count', 'Бат', 'call.l1.new', NULL, NULL, '{}'`);
        const [{ id }] = (await db.query<{ id: number }>('SELECT id::int AS id FROM public.daily_report_changes')).rows;
        await db.exec(`INSERT INTO public.daily_report_changes(shop_id, report_date, kind, manager_name, metric, restored_from)
            VALUES ('${shop}', '2026-10-15', 'count', 'Бат', 'call.l1.new', ${id})`);
        await expect(db.exec(`UPDATE public.daily_report_changes SET new_value = 1`)).rejects.toThrow(/permission denied/);
        await expect(db.exec(`DELETE FROM public.daily_report_changes`)).rejects.toThrow(/permission denied/);
        await expect(db.exec(`TRUNCATE public.daily_report_changes`)).rejects.toThrow(/permission denied/);
        await expect(db.exec(`INSERT INTO public.daily_report_changes(id, shop_id, report_date, kind) VALUES (999, '${shop}', '2026-10-15', 'complete')`))
            .rejects.toMatchObject(code('428C9'));
        await expect(change(`'count', 'Бат', NULL, NULL, NULL, '{}'`)).rejects.toMatchObject(code('23514'));
        await expect(change(`'count', 'Бат', 'meeting.new', NULL, NULL, '{}'`)).rejects.toMatchObject(code('23514'));
        await expect(change(`'note', NULL, NULL, NULL, NULL, '{}'`)).rejects.toMatchObject(code('23514'));
        await expect(change(`'note', NULL, NULL, 'line.L1', NULL, '{}'`)).rejects.toMatchObject(code('23514'));
        await expect(change(`'meeting', 'Бат', NULL, NULL, NULL, '{}'`)).rejects.toMatchObject(code('23514'));
        await expect(change(`'complete', NULL, NULL, NULL, NULL, '[]'`)).rejects.toMatchObject(code('23514'));
        await expect(change(`'other', NULL, NULL, NULL, NULL, '{}'`)).rejects.toMatchObject(code('23514'));
        await change(`'note', NULL, NULL, 'line.l1', NULL, '{}'`);
        await change(`'meeting', 'Бат', NULL, NULL, '${garden}', '{"action":"record"}'`);
        await db.exec('RESET ROLE');
        await db.exec(migration); // Түүх хэвээр.
        expect((await db.query('SELECT count(*)::int AS n FROM public.daily_report_changes')).rows).toEqual([{ n: 4 }]);
        // Төсөл устгахад түүх (сэргээлтийн холбоосын хамт) устна.
        await db.exec(`DELETE FROM public.shops WHERE id = '${shop}'`);
        expect((await db.query('SELECT count(*)::int AS n FROM public.daily_report_changes')).rows).toEqual([{ n: 0 }]);
    } finally {
        await db.close();
    }
}, 30_000);

it('save_daily_report writes changed cells and notes atomically, records history and refuses stale edits', async () => {
    const db = await setup();
    type SaveResult = { ok: boolean; changes?: number; conflicts?: unknown[] };
    const save = async (input: { user?: string | null; name?: string | null; cells?: unknown; notes?: unknown; complete?: boolean | null; restoredFrom?: number | null; date?: string | null }) =>
        (await db.query<{ result: SaveResult }>(`SELECT public.save_daily_report(p_shop_id => $1::uuid, p_date => $2::date,
            p_user_id => $3::uuid, p_user_name => $4::text, p_cells => $5::jsonb, p_notes => $6::jsonb, p_complete => $7::boolean,
            p_restored_from => $8::bigint) AS result`, [shop, input.date === undefined ? '2026-10-15' : input.date,
            input.user === undefined ? saraaUser : input.user, input.name === undefined ? 'Сараа' : input.name,
            JSON.stringify(input.cells ?? []), input.notes === undefined ? null : JSON.stringify(input.notes),
            input.complete ?? null, input.restoredFrom ?? null])).rows[0].result;
    const counts = async () => (await db.query<Record<string, unknown>>(`SELECT manager_name, metric, value, updated_by, updated_by_name
        FROM public.daily_report_counts ORDER BY manager_name, metric`)).rows;
    const report = async () => (await db.query<Record<string, unknown>>(`SELECT notes, completed_by, completed_by_name, completed_at IS NOT NULL AS completed, updated_by
        FROM public.daily_reports`)).rows;
    const history = async () => (await db.query<Record<string, unknown>>(`SELECT id::int AS id, report_date::text AS report_date, kind, manager_name, metric,
        note_key, old_value, new_value, old_text, new_text, restored_from::int AS restored_from, changed_by, changed_by_name
        FROM public.daily_report_changes ORDER BY id`)).rows;
    const snapshot = async () => ({ counts: await counts(), report: await report(), history: await history() });
    try {
        await db.exec('SET ROLE service_role');
        // Сараа (ээлжийн менежер) Бат-ын болон өөрийн тоо, тэмдэглэлийг оруулна.
        expect(await save({
            cells: [{ manager: 'Бат', metric: 'call.l1.new', value: 3 }, { manager: 'Сараа', metric: 'chat.page', value: 2, expected: null },
                { manager: 'Бат', metric: 'call.l1.repeat', value: null }],
            notes: [{ key: 'line.l1', value: '  Төслийн мэдээлэл авсан \n' }, { key: 'general', value: 'Ерөнхий' }, { key: 'chats', value: '' }],
        })).toEqual({ ok: true, changes: 4 });
        expect(await counts()).toEqual([
            { manager_name: 'Бат', metric: 'call.l1.new', value: 3, updated_by: saraaUser, updated_by_name: 'Сараа' },
            { manager_name: 'Сараа', metric: 'chat.page', value: 2, updated_by: saraaUser, updated_by_name: 'Сараа' },
        ]);
        expect(await report()).toEqual([{ notes: { lines: { l1: 'Төслийн мэдээлэл авсан' }, general: 'Ерөнхий' },
            completed_by: null, completed_by_name: null, completed: false, updated_by: saraaUser }]);
        expect(await history()).toMatchObject([
            { kind: 'count', manager_name: 'Бат', metric: 'call.l1.new', old_value: null, new_value: 3, changed_by: saraaUser, changed_by_name: 'Сараа', report_date: '2026-10-15' },
            { kind: 'count', manager_name: 'Сараа', metric: 'chat.page', old_value: null, new_value: 2 },
            { kind: 'note', note_key: 'line.l1', old_text: null, new_text: 'Төслийн мэдээлэл авсан' },
            { kind: 'note', note_key: 'general', old_text: null, new_text: 'Ерөнхий' },
        ]);

        // Өөрчлөгдөөгүй нүд, тэмдэглэл бичигдэхгүй, түүхэнд орохгүй, оруулсан хүн хэвээр.
        let before = await snapshot();
        expect(await save({ user: batUser, name: 'Бат', cells: [{ manager: 'Бат', metric: 'call.l1.new', value: 3, expected: 3 }],
            notes: [{ key: 'general', value: 'Ерөнхий ', expected: 'Ерөнхий' }, { key: 'chats', value: '', expected: null }] }))
            .toEqual({ ok: true, changes: 0 });
        expect(await save({ notes: null })).toEqual({ ok: true, changes: 0 }); // JSON null = тэмдэглэлгүй.
        expect(await snapshot()).toEqual(before);

        // Энэ хооронд өөр хүн өөрчилсөн: юу ч бичихгүй (баталгаажуулалт ч).
        const conflict = await save({ user: batUser, name: 'Бат', complete: true,
            cells: [{ manager: 'Бат', metric: 'call.l1.new', value: 5, expected: 2 }, { manager: 'Бат', metric: 'chat.page', value: 1 },
                { manager: 'Сараа', metric: 'chat.page', value: 4, expected: null }, { manager: 'Бат', metric: 'call.l1.other', value: 1, expected: null }],
            notes: [{ key: 'general', value: 'Шинэ', expected: 'Хуучин' }, { key: 'line.l1', value: 'Ok', expected: 'Төслийн мэдээлэл авсан' },
                { key: 'line.l2', value: 'Шинэ шугам', expected: 'Байсан' }] });
        expect(conflict).toEqual({ ok: false, conflicts: [
            { kind: 'count', manager: 'Бат', metric: 'call.l1.new', current: 3 },
            { kind: 'count', manager: 'Сараа', metric: 'chat.page', current: 2 },
            { kind: 'note', key: 'general', current: 'Ерөнхий' },
            { kind: 'note', key: 'line.l2', current: '' },
        ] });
        expect(await snapshot()).toEqual(before);

        // Бат Сараагийн оруулсан тоог засна → оруулсан хүн Бат болно; цэвэрлэвэл мөр устна.
        expect(await save({ user: batUser, name: 'Бат', cells: [{ manager: 'Бат', metric: 'call.l1.new', value: 5, expected: 3 }] }))
            .toEqual({ ok: true, changes: 1 });
        expect((await counts())[0]).toEqual({ manager_name: 'Бат', metric: 'call.l1.new', value: 5, updated_by: batUser, updated_by_name: 'Бат' });
        expect(await save({ cells: [{ manager: 'Бат', metric: 'call.l1.new', value: null, expected: 5 }] })).toEqual({ ok: true, changes: 1 });
        expect((await counts()).map(row => row.metric)).toEqual(['chat.page']);
        const cleared = (await history()).at(-1)!;
        expect(cleared).toMatchObject({ kind: 'count', manager_name: 'Бат', metric: 'call.l1.new', old_value: 5, new_value: null, changed_by: saraaUser, restored_from: null });

        // Тэмдэглэл түлхүүрээрээ нэгтгэгдэнэ; '' нь зөвхөн тухайн тэмдэглэлийг арилгана.
        expect(await save({ notes: [{ key: 'chats', value: 'Чатаар үнэ асуусан' }, { key: 'line.l2', value: 'Хотын дугаар' }] })).toEqual({ ok: true, changes: 2 });
        expect((await report())[0].notes).toEqual({ lines: { l1: 'Төслийн мэдээлэл авсан', l2: 'Хотын дугаар' }, general: 'Ерөнхий', chats: 'Чатаар үнэ асуусан' });
        expect(await save({ notes: [{ key: 'line.l1', value: '', expected: 'Төслийн мэдээлэл авсан' }, { key: 'line.l2', value: '' }] })).toEqual({ ok: true, changes: 2 });
        expect((await report())[0].notes).toEqual({ general: 'Ерөнхий', chats: 'Чатаар үнэ асуусан' });
        expect((await history()).slice(-2)).toMatchObject([
            { kind: 'note', note_key: 'line.l1', old_text: 'Төслийн мэдээлэл авсан', new_text: null },
            { kind: 'note', note_key: 'line.l2', old_text: 'Хотын дугаар', new_text: null },
        ]);

        // Баталгаажуулалт ба цуцлалт түүхэнд орно; тэмдэглэл хэвээр.
        expect(await save({ complete: true })).toEqual({ ok: true, changes: 1 });
        expect(await save({ user: batUser, name: 'Бат', complete: true })).toEqual({ ok: true, changes: 1 });
        expect(await report()).toEqual([{ notes: { general: 'Ерөнхий', chats: 'Чатаар үнэ асуусан' }, completed_by: batUser,
            completed_by_name: 'Бат', completed: true, updated_by: batUser }]);
        expect(await save({ complete: false })).toEqual({ ok: true, changes: 1 });
        expect(await save({ complete: false })).toEqual({ ok: true, changes: 0 });
        expect(await report()).toEqual([{ notes: { general: 'Ерөнхий', chats: 'Чатаар үнэ асуусан' }, completed_by: null,
            completed_by_name: null, completed: false, updated_by: saraaUser }]);
        expect((await history()).slice(-3)).toMatchObject([
            { kind: 'complete', old_text: null, new_text: 'Сараа', changed_by: saraaUser },
            { kind: 'complete', old_text: 'Сараа', new_text: 'Бат', changed_by: batUser },
            { kind: 'complete', old_text: 'Бат', new_text: null, changed_by: saraaUser },
        ]);

        // Сэргээлт: буруу цэвэрлэсэн нүдийг түүхээс буцаана.
        expect(await save({ restoredFrom: cleared.id as number, cells: [{ manager: 'Бат', metric: 'call.l1.new', value: 5, expected: null }] }))
            .toEqual({ ok: true, changes: 1 });
        expect((await history()).at(-1)).toMatchObject({ kind: 'count', old_value: null, new_value: 5, restored_from: cleared.id });
        const completeId = (await history()).find(row => row.kind === 'complete')!.id as number;
        before = await snapshot();
        for (const invalid of [{ restoredFrom: 999_999 }, { restoredFrom: completeId }, { restoredFrom: cleared.id as number, date: '2026-10-16' }]) {
            await expect(save({ ...invalid, cells: [{ manager: 'Бат', metric: 'call.l1.new', value: 4 }] })).rejects.toMatchObject(code('22023'));
        }

        // Хэлбэр буруу бол 22023, юу ч бичихгүй.
        const cell = { manager: 'Бат', metric: 'call.l1.new', value: 1 };
        for (const invalid of [
            { date: null }, { name: 'x'.repeat(121) },
            { cells: { manager: 'Бат' } }, { cells: [cell, cell] }, { cells: ['cell'] },
            { cells: [{ ...cell, extra: 1 }] }, { cells: [{ manager: 'Бат', metric: 'call.l1.new' }] },
            { cells: [{ ...cell, value: 1.5 }] }, { cells: [{ ...cell, value: -1 }] }, { cells: [{ ...cell, value: 10001 }] },
            { cells: [{ ...cell, value: '3' }] }, { cells: [{ ...cell, expected: '3' }] }, { cells: [{ ...cell, expected: 2.5 }] },
            { cells: [{ ...cell, manager: ' Бат' }] }, { cells: [{ ...cell, manager: '' }] }, { cells: [{ ...cell, metric: 'meeting.new' }] },
            { cells: Array.from({ length: 601 }, (_, index) => ({ ...cell, manager: `М${index}` })) },
            { notes: { general: 'x' } }, { notes: [{ key: 'general', value: 'x', extra: 1 }] }, { notes: [{ key: 'line.L1', value: 'x' }] },
            { notes: [{ key: 'general', value: 1 }] }, { notes: [{ key: 'general' }] }, { notes: [{ key: 'general', value: 'x', expected: 1 }] },
            { notes: [{ key: 'general', value: 'x'.repeat(2001) }] }, { notes: [{ key: 'chats', value: 'a' }, { key: 'chats', value: 'b' }] },
        ]) {
            await expect(save(invalid)).rejects.toMatchObject(code('22023'));
        }
        expect(await snapshot()).toEqual(before);
    } finally {
        await db.close();
    }
}, 30_000);

it('meetings: record on behalf of a colleague, complete the day\'s scheduled ones and let admins fix the credit', async () => {
    const db = await setup();
    try {
        const { day, next, later } = (await db.query<{ day: string; next: string; later: string }>(`SELECT
            ((now() - interval '3 days') AT TIME ZONE 'Asia/Ulaanbaatar')::date::text AS day,
            ((now() - interval '2 days') AT TIME ZONE 'Asia/Ulaanbaatar')::date::text AS next,
            ((now() + interval '2 days') AT TIME ZONE 'Asia/Ulaanbaatar')::date::text AS later`)).rows[0];
        const at = (date: string, time: string) => `${date}T${time}:00+08:00`;
        const window = (date: string, end: string) => [at(date, '00:00'), at(end, '00:00')];
        const lead = async (values: { owner: string | null; status?: string; deleted?: boolean; project?: string | null; viewingAt?: string | null }) =>
            (await db.query<{ id: string }>(`INSERT INTO public.leads(shop_id, project_id, customer_name, customer_phone, status, sales_manager_name, deleted_at, viewing_scheduled_at)
                VALUES ($1, $2, 'Хуучин харилцагч', '99001122', $3, $4, $5, $6) RETURNING id`,
            [shop, values.project === undefined ? garden : values.project, values.status ?? 'new', values.owner,
                values.deleted ? '2026-10-01T00:00:00Z' : null, values.viewingAt ?? null])).rows[0].id;
        const viewing = async (values: { leadId: string | null; at: string; status?: string; manager?: string | null; shopId?: string }) =>
            (await db.query<{ id: string }>(`INSERT INTO public.property_viewings(shop_id, lead_id, scheduled_at, status, meeting_type, sales_manager_name)
                VALUES ($1, $2, $3, $4, 'new_customer', $5) RETURNING id`,
            [values.shopId ?? shop, values.leadId, values.at, values.status ?? 'scheduled', values.manager === undefined ? 'Бат' : values.manager])).rows[0].id;
        type Actor = { user?: string | null; actor?: string | null; projects?: string[] | null };
        const actorArgs = (actor: Actor) => [
            'user' in actor ? actor.user : saraaUser, 'actor' in actor ? actor.actor : 'Сараа', 'projects' in actor ? actor.projects : [garden],
        ];
        const baseInput = { project_id: garden, customer_name: 'Тэмүүжин', customer_phone: '99112233', meeting_type: 'new_customer',
            scheduled_at: at(day, '10:00'), agent_notes: 'Б1 сонирхсон', interest_level: 4, customer_label: 'Тэмүүжин' };
        const record = async (input: Record<string, unknown> = {}, actor: Actor = {}, manager = 'Бат', date = day) =>
            (await db.query<{ result: { viewing_id: string; lead_id: string; lead_created: boolean } }>(`SELECT public.record_daily_report_meeting(
                p_shop_id => $1::uuid, p_user_id => $2::uuid, p_actor_name => $3::text, p_actor_project_ids => $4::uuid[],
                p_manager_name => $5::text, p_report_date => $6::date, p_input => $7::jsonb) AS result`,
            [shop, ...actorArgs(actor), manager, date, JSON.stringify({ ...baseInput, ...input })])).rows[0].result;
        const complete = async (viewingId: string, status: string, input: Record<string, unknown> | null = {}, actor: Actor = {},
            date = day, bounds = window(day, next)) =>
            (await db.query<{ result: { viewing_id: string; status: string } }>(`SELECT public.complete_daily_report_meeting(
                p_shop_id => $1::uuid, p_user_id => $2::uuid, p_actor_name => $3::text, p_actor_project_ids => $4::uuid[],
                p_viewing_id => $5::uuid, p_status => $6::text, p_input => $7::jsonb, p_report_date => $8::date,
                p_day_start => $9::timestamptz, p_day_end => $10::timestamptz) AS result`,
            [shop, ...actorArgs(actor), viewingId, status, input === null ? null : JSON.stringify(input), date, ...bounds])).rows[0].result;
        const reassign = async (viewingId: string, manager: string, date = day, shopId = shop) =>
            (await db.query<{ result: { viewing_id: string; changed: boolean } }>(`SELECT public.reassign_daily_report_meeting(
                p_shop_id => $1::uuid, p_user_id => $2::uuid, p_actor_name => $3::text, p_viewing_id => $4::uuid,
                p_manager_name => $5::text, p_report_date => $6::date) AS result`,
            [shopId, adminUser, 'Админ Болор', viewingId, manager, date])).rows[0].result;
        const snapshot = async () => ({
            leads: (await db.query(`SELECT id, status::text AS status, sales_manager_name, last_contact_at, viewing_scheduled_at, updated_at
                FROM public.leads ORDER BY id`)).rows,
            viewings: (await db.query(`SELECT id, status, sales_manager_name, completed_at, interest_level, customer_feedback
                FROM public.property_viewings ORDER BY id`)).rows,
            activities: (await db.query('SELECT count(*)::int AS n FROM public.lead_activities')).rows,
            changes: (await db.query('SELECT count(*)::int AS n FROM public.daily_report_changes')).rows,
        });
        const lastActivity = async () => (await db.query<Record<string, unknown>>(`SELECT lead_id, type, content, meta, created_by, created_by_name
            FROM public.lead_activities ORDER BY seq DESC LIMIT 1`)).rows[0];
        const lastChange = async () => (await db.query<Record<string, unknown>>(`SELECT report_date::text AS report_date, kind, manager_name,
            viewing_id, old_text, new_text, meta, changed_by, changed_by_name FROM public.daily_report_changes ORDER BY id DESC LIMIT 1`)).rows[0];

        await db.exec('SET ROLE service_role');

        // Сараа Бат-ын шинэ харилцагчийн болсон уулзалтыг Бат-ын нэр дээр бүртгэнэ → Бат-ын шинэ лид.
        const created = await record();
        expect(created.lead_created).toBe(true);
        expect((await db.query(`SELECT shop_id, project_id, customer_name, customer_phone, status::text AS status, source, sales_manager_name,
            last_contact_at = $2::timestamptz AS contacted FROM public.leads WHERE id = $1`, [created.lead_id, at(day, '10:00')])).rows)
            .toEqual([{ shop_id: shop, project_id: garden, customer_name: 'Тэмүүжин', customer_phone: '99112233', status: 'contacted',
                source: 'meeting', sales_manager_name: 'Бат', contacted: true }]);
        expect((await db.query(`SELECT lead_id, property_id, status, completed_at IS NOT NULL AS done, meeting_type, agent_notes,
            interest_level, sales_manager_name, interests FROM public.property_viewings WHERE id = $1`, [created.viewing_id])).rows)
            .toEqual([{ lead_id: created.lead_id, property_id: null, status: 'completed', done: true, meeting_type: 'new_customer',
                agent_notes: 'Б1 сонирхсон', interest_level: 4, sales_manager_name: 'Бат', interests: [] }]);
        expect(await lastActivity()).toMatchObject({ lead_id: created.lead_id, type: 'meeting',
            content: 'Болсон уулзалт бүртгэв (Сараа — Бат-ийн өмнөөс)', created_by: saraaUser, created_by_name: 'Сараа',
            meta: { viewing_id: created.viewing_id, via: 'daily_report', on_behalf_of: 'Бат' } });
        expect(await lastChange()).toEqual({ report_date: day, kind: 'meeting', manager_name: 'Бат', viewing_id: created.viewing_id,
            old_text: null, new_text: 'Тэмүүжин', meta: { action: 'record', meeting_type: 'new_customer', lead_created: true },
            changed_by: saraaUser, changed_by_name: 'Сараа' });

        // Бат-ын одоо байгаа лид: шинэ лид үүсэхгүй, лидийн холбоо барьсан огноо урагшилна.
        const batLead = await lead({ owner: 'Бат' });
        const existing = await record({ lead_id: batLead, customer_name: null, meeting_type: 'repeat_customer', scheduled_at: at(day, '15:00') });
        expect(existing).toEqual({ viewing_id: expect.any(String), lead_id: batLead, lead_created: false });
        await record({ lead_id: batLead, scheduled_at: at(day, '09:00') }, { user: batUser, actor: 'Бат' });
        expect((await db.query(`SELECT status::text AS status, last_contact_at = $2::timestamptz AS latest FROM public.leads WHERE id = $1`,
            [batLead, at(day, '15:00')])).rows).toEqual([{ status: 'contacted', latest: true }]);
        expect((await lastActivity()).content).toBe('Ирсэн уулзалт бүртгэв');

        // Байгууллагын хэрэглэгч (админ, багийн тайлан хөтлөгч).
        const byAdmin = await record({ customer_phone: '88112233' }, { user: adminUser, actor: 'Админ Болор', projects: null });
        expect(byAdmin.lead_created).toBe(true);
        expect((await lastActivity()).content).toBe('Болсон уулзалт бүртгэв (Админ Болор — Бат-ийн өмнөөс)');

        // Өөр менежерийн, устгагдсан, хариуцагчгүй, өөр төслийн лид → P0002.
        const saraaLead = await lead({ owner: 'Сараа' });
        const deletedLead = await lead({ owner: 'Бат', deleted: true });
        const unassignedLead = await lead({ owner: null });
        let before = await snapshot();
        for (const leadId of [saraaLead, deletedLead, unassignedLead, '43000000-0000-4000-8000-000000000099']) {
            await expect(record({ lead_id: leadId })).rejects.toMatchObject(code('P0002'));
        }
        await expect(record({ project_id: foreignProject })).rejects.toMatchObject(code('P0002'));
        // Идэвхгүй, төсөлд бүртгэлгүй, бүртгэлд байхгүй менежер → 22023.
        for (const manager of ['Дорж', 'Болд', 'Бусад']) {
            await expect(record({}, {}, manager)).rejects.toMatchObject(code('22023'));
        }
        // Акаунтаар холбогдоогүй / нэр зөрсөн / төсөлгүй ээлжийн менежер → P0002.
        for (const actor of [{ user: strangerUser }, { actor: 'Бат' }, { projects: [foreignProject] }, { projects: [] }, { user: null }, { actor: null }]) {
            await expect(record({}, actor)).rejects.toMatchObject(code('P0002'));
        }
        await db.exec('RESET ROLE');
        await db.exec(`UPDATE public.sales_managers SET is_active = false WHERE name = 'Сараа'`);
        await db.exec('SET ROLE service_role');
        await expect(record()).rejects.toMatchObject(code('P0002'));
        await db.exec('RESET ROLE');
        await db.exec(`UPDATE public.sales_managers SET is_active = true WHERE name = 'Сараа';
            DELETE FROM public.sales_manager_projects WHERE manager_name = 'Сараа'`);
        await db.exec('SET ROLE service_role');
        await expect(record()).rejects.toMatchObject(code('P0002'));
        await db.exec('RESET ROLE');
        await db.exec(`INSERT INTO public.sales_manager_projects VALUES ('${shop}', 'Сараа', '${garden}');
            UPDATE public.sales_managers SET user_id = '${saraaUser}' WHERE name = 'Болд'`);
        await db.exec('SET ROLE service_role');
        await expect(record()).rejects.toMatchObject(code('P0002')); // Нэг акаунт хоёр менежерт холбогдсон.
        await db.exec('RESET ROLE');
        await db.exec(`UPDATE public.sales_managers SET user_id = NULL WHERE name = 'Болд'`);
        await db.exec('SET ROLE service_role');
        // Ирээдүйн цаг, өөр өдөр, хэлбэрийн алдаа → 22023.
        const future = (await db.query<{ at: string; day: string }>(`SELECT (now() + interval '1 hour')::text AS at,
            ((now() + interval '1 hour') AT TIME ZONE 'Asia/Ulaanbaatar')::date::text AS day`)).rows[0];
        await expect(record({ scheduled_at: future.at }, {}, 'Бат', future.day)).rejects.toMatchObject(code('22023'));
        await expect(record({ scheduled_at: at(next, '10:00') })).rejects.toMatchObject(code('22023'));
        for (const invalid of [{ extra: 1 }, { customer_phone: '9911-2233' }, { customer_phone: '1234567' }, { customer_phone: null },
            { customer_phone: 99112233 }, { interest_level: 6 }, { interest_level: 2.5 }, { meeting_type: 'walk_in' }, { scheduled_at: 'маргааш' },
            { scheduled_at: 'infinity' }, { scheduled_at: null }, { project_id: 'garden' }, { lead_id: 'lead' }, { customer_name: 'x'.repeat(201) },
            { agent_notes: 'x'.repeat(4001) }, { customer_label: 5 }]) {
            await expect(record(invalid)).rejects.toMatchObject(code('22023'));
        }
        await expect(record({}, { user: adminUser, actor: '', projects: null })).rejects.toMatchObject(code('22023'));
        // API-ийн хайлтын дараа ижил утастай лид үүссэн бол давхар лид үүсгэхгүй.
        await expect(record()).rejects.toMatchObject(code('23505'));
        expect(await snapshot()).toEqual(before);
        // Түүх бичигдэхгүй бол лид, уулзалт ч үлдэхгүй (нэг гүйлгээ).
        await db.exec('RESET ROLE');
        await db.exec('ALTER TABLE public.daily_report_changes ADD CONSTRAINT fail_history CHECK (false) NOT VALID');
        await db.exec('SET ROLE service_role');
        await expect(record({ customer_phone: '95550001' })).rejects.toMatchObject(code('23514'));
        expect(await snapshot()).toEqual(before);
        await db.exec('RESET ROLE');
        await db.exec('ALTER TABLE public.daily_report_changes DROP CONSTRAINT fail_history');
        await db.exec('SET ROLE service_role');

        // Товлосон уулзалт → «Болсон»: тооцогдох менежер хэвээр, лид холбоо барьсан.
        const scheduledLead = await lead({ owner: 'Бат', status: 'viewing_scheduled', viewingAt: at(day, '13:00') });
        const scheduled = await viewing({ leadId: scheduledLead, at: at(day, '13:00') });
        expect(await complete(scheduled, 'completed', { interest_level: 3, customer_feedback: 'Үнэ асуусан' })).toEqual({ viewing_id: scheduled, status: 'completed' });
        expect((await db.query(`SELECT status, sales_manager_name, completed_at IS NOT NULL AS done, interest_level, customer_feedback
            FROM public.property_viewings WHERE id = $1`, [scheduled])).rows)
            .toEqual([{ status: 'completed', sales_manager_name: 'Бат', done: true, interest_level: 3, customer_feedback: 'Үнэ асуусан' }]);
        expect((await db.query(`SELECT status::text AS status, last_contact_at IS NOT NULL AS contacted, viewing_scheduled_at IS NOT NULL AS still_scheduled,
            sales_manager_name FROM public.leads WHERE id = $1`, [scheduledLead])).rows)
            .toEqual([{ status: 'viewing_scheduled', contacted: true, still_scheduled: true, sales_manager_name: 'Бат' }]);
        expect(await lastActivity()).toMatchObject({ lead_id: scheduledLead, content: 'Уулзалт болов · сонирхол 3/5 · Үнэ асуусан (Сараа бүртгэв)',
            meta: { viewing_id: scheduled, status: 'completed', via: 'daily_report' }, created_by: saraaUser, created_by_name: 'Сараа' });
        expect(await lastChange()).toMatchObject({ report_date: day, kind: 'meeting', manager_name: 'Бат', viewing_id: scheduled,
            old_text: 'Товлосон', new_text: 'Болсон', meta: { action: 'complete' }, changed_by: saraaUser });
        await expect(complete(scheduled, 'completed')).rejects.toMatchObject(code('P0002')); // Зөвхөн товлосон.

        // «Ирээгүй»: лидийн товлолт арилна, сонирхол бичигдэхгүй.
        const noShowLead = await lead({ owner: 'Бат', status: 'viewing_scheduled', viewingAt: at(day, '11:00') });
        const noShow = await viewing({ leadId: noShowLead, at: at(day, '11:00') });
        await complete(noShow, 'no_show', { interest_level: 5 }, { user: batUser, actor: 'Бат' });
        expect((await db.query(`SELECT v.status, v.interest_level, v.completed_at, l.status::text AS lead_status, l.viewing_scheduled_at
            FROM public.property_viewings v JOIN public.leads l ON l.id = v.lead_id WHERE v.id = $1`, [noShow])).rows)
            .toEqual([{ status: 'no_show', interest_level: null, completed_at: null, lead_status: 'contacted', viewing_scheduled_at: null }]);
        expect((await lastActivity()).content).toBe('Уулзалтад ирээгүй');
        expect(await lastChange()).toMatchObject({ manager_name: 'Бат', new_text: 'Ирээгүй', meta: { action: 'no_show' }, changed_by: batUser });

        // Өөр өдрийн, ирээдүйн, лидгүй (хязгаарлагдсан менежерт), өөр төслийн уулзалт → P0002.
        const otherDay = await viewing({ leadId: await lead({ owner: 'Бат' }), at: at(next, '10:00') });
        const upcoming = await viewing({ leadId: await lead({ owner: 'Бат' }), at: at(later, '23:30') });
        const noLead = await viewing({ leadId: null, at: at(day, '16:00'), manager: '' });
        const outside = await viewing({ leadId: await lead({ owner: null, project: null }), at: at(day, '17:00') });
        const inWindow = await viewing({ leadId: await lead({ owner: 'Бат' }), at: at(day, '12:00') });
        const claimPool = await viewing({ leadId: await lead({ owner: null }), at: at(day, '12:30'), manager: '' });
        before = await snapshot();
        await expect(complete(otherDay, 'completed')).rejects.toMatchObject(code('P0002'));
        await expect(complete(upcoming, 'completed', {}, {}, later, window(later, later))).rejects.toMatchObject(code('22023'));
        const laterEnd = (await db.query<{ d: string }>(`SELECT ($1::date + 1)::text AS d`, [later])).rows[0].d;
        await expect(complete(upcoming, 'completed', {}, {}, later, window(later, laterEnd))).rejects.toMatchObject(code('P0002'));
        await expect(complete(noLead, 'completed')).rejects.toMatchObject(code('P0002'));
        await expect(complete(outside, 'completed')).rejects.toMatchObject(code('P0002'));
        // Хариуцагчгүй лид хариуцаж авах хүртэл менежерт зөвхөн уншигдана.
        await expect(complete(claimPool, 'completed')).rejects.toMatchObject(code('P0002'));
        for (const actor of [{ user: strangerUser }, { actor: 'Бат' }, { projects: [foreignProject] }, { projects: [] }]) {
            await expect(complete(inWindow, 'completed', {}, actor)).rejects.toMatchObject(code('P0002'));
        }
        await expect(complete('43000000-0000-4000-8000-000000000099', 'completed')).rejects.toMatchObject(code('P0002'));
        // Өдрийн хязгаар тайлангийн өдөртэй таарахгүй, төлөв/талбар буруу → 22023.
        await expect(complete(otherDay, 'completed', {}, {}, next, window(day, next))).rejects.toMatchObject(code('22023'));
        await expect(complete(otherDay, 'completed', {}, {}, day, [at(day, '00:00'), at(later, '00:00')])).rejects.toMatchObject(code('22023'));
        for (const [status, input] of [['cancelled', {}], ['scheduled', {}], ['completed', { notes: 'x' }], ['completed', { interest_level: 0 }],
            ['completed', { customer_feedback: 3 }], ['completed', { customer_feedback: 'x'.repeat(4001) }]] as const) {
            await expect(complete(scheduled, status, input)).rejects.toMatchObject(code('22023'));
        }
        expect(await snapshot()).toEqual(before);
        // Байгууллагын хэрэглэгч лидгүй уулзалтыг тэмдэглэж болно (түүх үлдэнэ, лидийн түүх байхгүй).
        expect(await complete(noLead, 'completed', null, { user: adminUser, actor: 'Админ Болор', projects: null }))
            .toEqual({ viewing_id: noLead, status: 'completed' });
        expect(await lastChange()).toMatchObject({ manager_name: null, viewing_id: noLead, new_text: 'Болсон', changed_by_name: 'Админ Болор' });

        // Админ уулзалтыг аль менежерт тооцохыг засна; лидийн хариуцагч өөрчлөгдөхгүй.
        expect(await reassign(scheduled, 'Сараа')).toEqual({ viewing_id: scheduled, changed: true });
        expect((await db.query(`SELECT v.sales_manager_name AS credited, l.sales_manager_name AS owner FROM public.property_viewings v
            JOIN public.leads l ON l.id = v.lead_id WHERE v.id = $1`, [scheduled])).rows).toEqual([{ credited: 'Сараа', owner: 'Бат' }]);
        expect(await lastActivity()).toMatchObject({ lead_id: scheduledLead, content: 'Уулзалтын менежер: Бат → Сараа',
            meta: { viewing_id: scheduled, from: 'Бат', to: 'Сараа', via: 'daily_report' }, created_by: adminUser, created_by_name: 'Админ Болор' });
        expect(await lastChange()).toEqual({ report_date: day, kind: 'meeting', manager_name: 'Сараа', viewing_id: scheduled,
            old_text: 'Бат', new_text: 'Сараа', meta: { action: 'reassign' }, changed_by: adminUser, changed_by_name: 'Админ Болор' });
        before = await snapshot();
        expect(await reassign(scheduled, 'Сараа')).toEqual({ viewing_id: scheduled, changed: false });
        for (const manager of ['Дорж', 'Болд', 'Бусад', ' Сараа']) {
            await expect(reassign(scheduled, manager)).rejects.toMatchObject(code('22023'));
        }
        await expect(reassign(scheduled, 'Бат', next)).rejects.toMatchObject(code('P0002'));
        await expect(reassign(scheduled, 'Бат', day, otherShop)).rejects.toMatchObject(code('P0002'));
        expect(await snapshot()).toEqual(before);
        // Лидгүй уулзалт: төслийн цорын ганц төслөөр шалгана; олон төсөлтэй бол тодорхойгүй.
        expect(await reassign(noLead, 'Бат')).toEqual({ viewing_id: noLead, changed: true });
        expect(await lastChange()).toMatchObject({ manager_name: 'Бат', old_text: null, new_text: 'Бат' });
        await db.exec('RESET ROLE');
        await db.exec(`INSERT INTO public.projects VALUES ('41000000-0000-4000-8000-000000000003', '${shop}', 'Өөр төсөл')`);
        await db.exec('SET ROLE service_role');
        await expect(reassign(noLead, 'Сараа')).rejects.toMatchObject(code('22023'));
        await db.exec('RESET ROLE');
        await db.exec(`UPDATE public.property_viewings SET deleted_at = now() WHERE id = '${noLead}'`);
        await db.exec('SET ROLE service_role');
        await expect(reassign(noLead, 'Сараа')).rejects.toMatchObject(code('P0002'));
    } finally {
        await db.close();
    }
}, 30_000);

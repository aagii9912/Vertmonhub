// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';
import type { MemoryDb } from '@/test/memory-db';

type Role = 'admin' | 'sales_manager' | 'staff' | 'director';
const state = vi.hoisted(() => ({ role: 'admin' as string, userId: 'admin-user', db: null as unknown as MemoryDb }));
const PERMS: Record<Role, { role: string; modules: string[]; canWrite: boolean }> = {
    admin: { role: 'admin', modules: ['dashboard', 'reports', 'viewings'], canWrite: true },
    sales_manager: { role: 'sales_manager', modules: ['dashboard', 'leads', 'viewings'], canWrite: true },
    staff: { role: 'viewer', modules: ['dashboard', 'viewings'], canWrite: true },
    director: { role: 'director', modules: ['dashboard', 'reports', 'viewings'], canWrite: true },
};
const deny = () => NextResponse.json({ error: 'Энэ хэсэгт хандах эрх танд алга' }, { status: 403 });
vi.mock('@/lib/auth/require-permission', () => {
    const perms = () => PERMS[state.role as Role];
    return {
        requireModule: async (module: string) => perms().modules.includes(module) ? null : deny(),
        requireAnyModule: async (modules: string[]) => modules.some(module => perms().modules.includes(module)) ? null : deny(),
        requireModuleWrite: async (module: string) => perms().modules.includes(module) && perms().canWrite ? null : deny(),
        requireModuleDelete: async () => deny(),
        resolvePermissions: async () => ({ role: perms().role, permissions: { modules: perms().modules, canWrite: perms().canWrite, canDelete: false } }),
    };
});
vi.mock('@/lib/auth/supabase-auth', () => ({
    getUserShop: async () => ({ id: 'shop-1', name: 'Elysium Residence' }),
    getUserId: async () => state.userId,
}));
vi.mock('@/lib/supabase', () => ({ supabaseAdmin: () => state.db }));

import { createMemoryDb } from '@/test/memory-db';
import { ANONYMOUS_LEAD_LABEL, LEAD_NAME_OR_ANONYMOUS } from '@/lib/leads/labels';
import { DAILY_MEETING_UNAVAILABLE } from '@/lib/services/DailyMeetingService';
import { POST } from './route';

const CHAN = 'Чанцалдулам.Раднаа';
const KHON = 'Хонгорзул.Мөнхгэрэл';
const VIEWING = '00000000-0000-4000-8000-0000000000aa';
const TODAY = '2026-10-19';
const post = (body: unknown) => POST(new NextRequest('http://localhost/api/dashboard/daily-report/meetings', { method: 'POST', body: JSON.stringify(body) }));
const record = (extra: Record<string, unknown> = {}) => ({ action: 'record', date: TODAY, manager: CHAN, customer_phone: '9911-2233', customer_name: 'Бат', ...extra });
const lead = (id: string, manager: string | null, extra: Record<string, unknown> = {}) => ({
    id, shop_id: 'shop-1', project_id: 'project-1', customer_name: `Харилцагч ${id}`, customer_phone: '+976 9911 2233',
    sales_manager_name: manager, status: 'new', deleted_at: null, ...extra,
});
const rpcError = (code: string) => () => { throw Object.assign(new Error('rpc failed'), { code }); };
const calls = (name: string) => state.db.rpcCalls.filter(call => call.name === name);

beforeEach(() => {
    // УБ 2026-10-19 12:00.
    vi.useFakeTimers({ now: new Date('2026-10-19T04:00:00.000Z'), toFake: ['Date'] });
    state.role = 'sales_manager';
    state.userId = 'khon-user';
    state.db = createMemoryDb({
        user_profiles: [
            { id: 'admin-user', full_name: 'Захирал Бат' },
            { id: 'khon-user', full_name: 'Khongoroo' },
            { id: 'chan-user', full_name: 'Chantsal' },
            { id: 'loose-user', full_name: 'Холбогдоогүй' },
            { id: 'director-user', full_name: 'Gerelee' },
        ],
        sales_managers: [
            { shop_id: 'shop-1', name: CHAN, user_id: 'chan-user', is_active: true },
            { shop_id: 'shop-1', name: KHON, user_id: 'khon-user', is_active: true },
            { shop_id: 'shop-1', name: 'Ажлаас.Гарсан', user_id: null, is_active: false },
            { shop_id: 'shop-1', name: 'Бүртгэлгүй.Менежер', user_id: null, is_active: true },
            { shop_id: 'shop-2', name: 'Өөр.Төсөл', user_id: null, is_active: true },
        ],
        sales_manager_projects: [
            { shop_id: 'shop-1', manager_name: CHAN, project_id: 'project-1' },
            { shop_id: 'shop-1', manager_name: KHON, project_id: 'project-1' },
            { shop_id: 'shop-1', manager_name: 'Ажлаас.Гарсан', project_id: 'project-1' },
            { shop_id: 'shop-2', manager_name: 'Өөр.Төсөл', project_id: 'project-2' },
        ],
        projects: [{ id: 'project-1', shop_id: 'shop-1' }, { id: 'project-2', shop_id: 'shop-2' }],
        leads: [],
    });
    state.db.rpcs.record_daily_report_meeting = (args) => ({
        viewing_id: 'viewing-new', lead_id: args.p_input.lead_id ?? 'lead-new', lead_created: !args.p_input.lead_id,
    });
    state.db.rpcs.complete_daily_report_meeting = (args) => ({ viewing_id: args.p_viewing_id, status: args.p_status });
    state.db.rpcs.reassign_daily_report_meeting = (args) => ({ viewing_id: args.p_viewing_id, changed: true });
});
afterEach(() => { vi.useRealTimers(); });

describe('POST /api/dashboard/daily-report/meetings — record', () => {
    it('lets a registered manager record a colleague’s held meeting under the colleague’s name with a new lead', async () => {
        const response = await post(record({ time: '10:30', notes: 'Б1 3 өрөө', interest_level: 4 }));
        expect(response.status).toBe(201);
        expect(response.headers.get('Cache-Control')).toBe('private, no-store');
        expect(await response.json()).toEqual({ ok: true, viewing_id: 'viewing-new', lead_id: 'lead-new', lead_created: true });
        expect(calls('record_daily_report_meeting')).toHaveLength(1);
        expect(calls('record_daily_report_meeting')[0].args).toEqual({
            p_shop_id: 'shop-1', p_user_id: 'khon-user', p_actor_name: KHON, p_actor_project_ids: ['project-1'],
            p_manager_name: CHAN, p_report_date: TODAY,
            p_input: {
                project_id: 'project-1', lead_id: null, customer_name: 'Бат', customer_phone: '99112233',
                meeting_type: 'new_customer', scheduled_at: '2026-10-19T02:30:00.000Z',
                agent_notes: 'Б1 3 өрөө', customer_feedback: null, interest_level: 4, customer_label: 'Бат',
            },
        });
        // Лид, уулзалтыг зөвхөн RPC бичнэ.
        expect(state.db.writes).toEqual([]);
    });

    it('links the meeting to the colleague’s own lead found by phone without asking for a name', async () => {
        state.db.tables.leads.push(
            lead('lead-chan', CHAN, { customer_name: 'Сараа' }),
            lead('lead-other-project', KHON, { project_id: 'project-2' }),
            lead('lead-deleted', KHON, { deleted_at: '2026-10-01T00:00:00Z' }),
            lead('lead-other-shop', KHON, { shop_id: 'shop-2' }),
            lead('lead-near-miss', KHON, { customer_phone: '76911223' }),
        );
        const response = await post(record({ customer_name: null }));
        expect(response.status).toBe(201);
        expect(await response.json()).toMatchObject({ lead_id: 'lead-chan', lead_created: false });
        expect(calls('record_daily_report_meeting')[0].args.p_input).toMatchObject({
            lead_id: 'lead-chan', customer_name: null, customer_label: 'Сараа',
            // Өнөөдөр цаг заагаагүй = одоо.
            scheduled_at: '2026-10-19T04:00:00.000Z',
        });
    });

    it('defaults a past day without a time to 12:00 Ulaanbaatar time', async () => {
        expect((await post(record({ date: '2026-10-17' }))).status).toBe(201);
        expect(calls('record_daily_report_meeting')[0].args).toMatchObject({
            p_report_date: '2026-10-17', p_input: { scheduled_at: '2026-10-17T04:00:00.000Z' },
        });
    });

    it('refuses to duplicate another manager’s lead or an unassigned lead', async () => {
        state.db.tables.leads.push(lead('lead-khon', KHON));
        let response = await post(record());
        expect(response.status).toBe(409);
        expect((await response.json()).error).toBe('Энэ утастай харилцагч М. Хонгорзул-ийн лид. Уулзалтыг тухайн менежерийн нэр дээр бүртгэнэ үү.');

        state.db.tables.leads = [lead('lead-pool', null), lead('lead-pool-2', '', { customer_phone: '99112233' })];
        response = await post(record());
        expect(response.status).toBe(409);
        expect((await response.json()).error).toBe('Энэ утастай лид хариуцагчгүй байна. Р. Чанцалдулам «Хариуцагчгүй» жагсаалтаас хариуцаж авсны дараа бүртгэнэ үү.');

        state.db.tables.leads = [lead('lead-a', CHAN), lead('lead-b', CHAN)];
        response = await post(record());
        expect(response.status).toBe(409);
        expect((await response.json()).error).toBe('Олон лид таарлаа. Лидээ шалгана уу.');

        // Хаагдсан хариуцагчгүй лидийг хариуцаж авах боломжгүй; бүртгэлгүй нэр дээрх лидийг админ засна.
        state.db.tables.leads = [lead('lead-closed', null, { status: 'closed_lost' })];
        response = await post(record());
        expect((await response.json()).error).toBe('Энэ утастай хаагдсан лид хариуцагчгүй байна. Админд хандаж менежер оноолгоно уу.');
        state.db.tables.leads = [lead('lead-gone', 'Ажлаас.Гарсан')];
        response = await post(record());
        expect((await response.json()).error).toBe('Энэ утастай лид бүртгэлгүй эсвэл идэвхгүй менежер (Г. Ажлаас)-ийн нэр дээр байна. Админаар лидийг зөв менежерт шилжүүлнэ үү.');
        expect(state.db.rpcCalls).toEqual([]);
    });

    it('links the target manager’s own lead even when a colleague holds a duplicate', async () => {
        state.db.tables.leads = [lead('lead-chan', CHAN), lead('lead-dup', KHON)];
        state.db.rpcs.record_daily_report_meeting = () => ({ viewing_id: 'viewing-1', lead_id: 'lead-chan', lead_created: false });
        const response = await post(record());
        expect(response.status).toBe(201);
        expect(state.db.rpcCalls[0].args.p_input).toMatchObject({ lead_id: 'lead-chan', customer_name: null });
    });

    it('requires the target to be an active manager registered in the project', async () => {
        for (const manager of ['Ажлаас.Гарсан', 'Бүртгэлгүй.Менежер', 'Өөр.Төсөл', 'Байхгүй']) {
            const response = await post(record({ manager }));
            expect(response.status).toBe(400);
            expect((await response.json()).error).toBe('Тухайн төслийн идэвхтэй борлуулалтын менежерийг сонгоно уу');
        }
        expect(state.db.rpcCalls).toEqual([]);
    });

    it('needs a name or «Нэр тодорхойгүй» for a new customer', async () => {
        const response = await post(record({ customer_name: '  ' }));
        expect(response.status).toBe(400);
        expect((await response.json()).error).toBe(LEAD_NAME_OR_ANONYMOUS);
        expect((await post(record({ customer_name: 'Зохиосон', anonymous: true }))).status).toBe(201);
        expect(calls('record_daily_report_meeting')[0].args.p_input).toMatchObject({ customer_name: null, customer_label: ANONYMOUS_LEAD_LABEL });
    });

    it('rejects future times and days, partial phones and unknown fields', async () => {
        expect((await post(record({ time: '12:30' }))).status).toBe(400);
        expect((await post(record({ date: '2026-10-20' }))).status).toBe(400);
        expect((await post(record({ time: '24:00' }))).status).toBe(400);
        const phone = await post(record({ customer_phone: '9911' }));
        expect(phone.status).toBe(400);
        expect((await phone.json()).error).toBe('Утасны дугаараа бүтнээр оруулна уу');
        expect((await post(record({ lead_id: 'lead-x' }))).status).toBe(400);
        expect((await post(record({ sales_manager_name: KHON }))).status).toBe(400);
        expect((await post({ action: 'delete', date: TODAY })).status).toBe(400);
        expect(state.db.rpcCalls).toEqual([]);
    });

    it('limits registered managers to the last 7 days and lets organisation users record any past day', async () => {
        const old = await post(record({ date: '2026-10-11' }));
        expect(old.status).toBe(400);
        expect((await old.json()).error).toBe('Зөвхөн сүүлийн 7 хоногийн уулзалтыг бүртгэнэ');
        expect((await post(record({ date: '2026-10-12' }))).status).toBe(201);

        state.role = 'admin';
        state.userId = 'admin-user';
        expect((await post(record({ date: '2026-09-01', manager: KHON }))).status).toBe(201);
        expect(calls('record_daily_report_meeting')[1].args).toMatchObject({
            p_user_id: 'admin-user', p_actor_name: 'Захирал Бат', p_actor_project_ids: null, p_manager_name: KHON, p_report_date: '2026-09-01',
        });
    });

    it('refuses unlinked managers and users without the team report', async () => {
        state.userId = 'loose-user';
        const response = await post(record());
        expect(response.status).toBe(403);
        expect((await response.json()).error).toBe('Таны нэр борлуулалтын менежерийн бүртгэлд холбогдоогүй байна');
        state.role = 'staff';
        state.userId = 'admin-user';
        expect((await post(record())).status).toBe(403);
        expect(state.db.rpcCalls).toEqual([]);
    });

    it('maps RPC refusals and a missing migration', async () => {
        state.db.rpcs.record_daily_report_meeting = rpcError('P0002');
        expect((await post(record())).status).toBe(404);
        state.db.rpcs.record_daily_report_meeting = rpcError('22023');
        expect((await post(record())).status).toBe(400);
        delete state.db.rpcs.record_daily_report_meeting;
        const response = await post(record());
        expect(response.status).toBe(503);
        expect((await response.json()).error).toBe(DAILY_MEETING_UNAVAILABLE);
    });
});

describe('POST /api/dashboard/daily-report/meetings — complete', () => {
    it('marks a colleague’s scheduled meeting of that UB day held, sending the day window', async () => {
        const response = await post({ action: 'complete', date: '2026-10-18', viewing_id: VIEWING, status: 'completed', interest_level: 4, feedback: 'Таалагдсан' });
        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({ ok: true, viewing_id: VIEWING, status: 'completed' });
        expect(calls('complete_daily_report_meeting')[0].args).toEqual({
            p_shop_id: 'shop-1', p_user_id: 'khon-user', p_actor_name: KHON, p_actor_project_ids: ['project-1'],
            p_viewing_id: VIEWING, p_status: 'completed', p_input: { interest_level: 4, customer_feedback: 'Таалагдсан' },
            p_report_date: '2026-10-18', p_day_start: '2026-10-17T16:00:00.000Z', p_day_end: '2026-10-18T16:00:00.000Z',
        });
    });

    it('sends no details for a no-show and maps a missing meeting to 404', async () => {
        expect((await post({ action: 'complete', date: TODAY, viewing_id: VIEWING, status: 'no_show', feedback: 'Утсаа аваагүй' })).status).toBe(200);
        expect(calls('complete_daily_report_meeting')[0].args).toMatchObject({ p_status: 'no_show', p_input: {} });
        state.db.rpcs.complete_daily_report_meeting = rpcError('P0002');
        const response = await post({ action: 'complete', date: TODAY, viewing_id: VIEWING, status: 'completed' });
        expect(response.status).toBe(404);
        expect((await response.json()).error).toBe('Тухайн өдрийн товлосон уулзалт олдсонгүй. Хуудсаа шинэчилнэ үү.');
        expect((await post({ action: 'complete', date: TODAY, viewing_id: 'not-a-guid', status: 'completed' })).status).toBe(400);
        expect((await post({ action: 'complete', date: TODAY, viewing_id: VIEWING, status: 'cancelled' })).status).toBe(400);
        expect((await post({ action: 'complete', date: '2026-10-01', viewing_id: VIEWING, status: 'completed' })).status).toBe(400);
    });
});

describe('POST /api/dashboard/daily-report/meetings — reassign', () => {
    const reassign = { action: 'reassign', date: TODAY, viewing_id: VIEWING, manager: CHAN };

    it('lets only admins change which manager a meeting is credited to', async () => {
        let response = await post(reassign);
        expect(response.status).toBe(403);
        expect((await response.json()).error).toBe('Зөвхөн админ уулзалтын менежерийг солино');
        state.role = 'director';
        state.userId = 'director-user';
        expect((await post(reassign)).status).toBe(403);
        expect(state.db.rpcCalls).toEqual([]);

        state.role = 'admin';
        state.userId = 'admin-user';
        response = await post(reassign);
        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({ ok: true, viewing_id: VIEWING, changed: true });
        expect(calls('reassign_daily_report_meeting')[0].args).toEqual({
            p_shop_id: 'shop-1', p_user_id: 'admin-user', p_actor_name: 'Захирал Бат', p_viewing_id: VIEWING, p_manager_name: CHAN, p_report_date: TODAY,
        });
        state.db.rpcs.reassign_daily_report_meeting = rpcError('22023');
        response = await post(reassign);
        expect(response.status).toBe(400);
        expect((await response.json()).error).toBe('Тухайн төслийн идэвхтэй борлуулалтын менежерийг сонгоно уу');
    });
});

describe('POST /api/dashboard/daily-report/meetings — «Сэжим (хаанаас ирсэн)»', () => {
    const FACEBOOK = '00000000-0000-4000-8000-0000000000f1';
    const ARCHIVED = '00000000-0000-4000-8000-0000000000b1';
    const FOREIGN = '00000000-0000-4000-8000-0000000000c1';
    beforeEach(() => {
        state.db.tables.sales_referral_sources = [
            { id: FACEBOOK, shop_id: 'shop-1', name: 'Facebook', sort_order: 10, archived_at: null },
            { id: ARCHIVED, shop_id: 'shop-1', name: 'Бармаш түрээслэгч', sort_order: 20, archived_at: '2026-10-18T00:00:00Z' },
            { id: FOREIGN, shop_id: 'shop-2', name: 'Монкон', sort_order: 10, archived_at: null },
        ];
    });

    it('requires an active referral for a new customer when the project has a list and passes it to the RPC', async () => {
        const missing = await post(record());
        expect(missing.status).toBe(400);
        expect((await missing.json()).error).toContain('Шинэ харилцагчийн уулзалтад «Сэжим (хаанаас ирсэн)»-ийг сонгоно уу');
        for (const id of [ARCHIVED, FOREIGN]) expect((await post(record({ referral_source_id: id }))).status).toBe(400);
        expect((await post(record({ referral_source_id: 'Facebook' }))).status).toBe(400);
        expect(calls('record_daily_report_meeting')).toHaveLength(0);

        expect((await post(record({ referral_source_id: FACEBOOK }))).status).toBe(201);
        expect(calls('record_daily_report_meeting')[0].args.p_input).toMatchObject({ meeting_type: 'new_customer', referral_source_id: FACEBOOK });
    });

    it('keeps it optional for repeat customers and for projects without a list or before the migration', async () => {
        expect((await post(record({ meeting_type: 'repeat_customer' }))).status).toBe(201);
        expect(calls('record_daily_report_meeting')[0].args.p_input).not.toHaveProperty('referral_source_id');
        state.db.tables.sales_referral_sources = [];
        expect((await post(record())).status).toBe(201);
        state.db.failNext.sales_referral_sources = { code: 'PGRST205', message: "Could not find the table 'public.sales_referral_sources'" };
        expect((await post(record())).status).toBe(201);
        expect(calls('record_daily_report_meeting').map(call => 'referral_source_id' in call.args.p_input)).toEqual([false, false, false]);
    });
});

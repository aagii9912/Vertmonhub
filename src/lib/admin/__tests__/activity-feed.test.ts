// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createMemoryDb } from '@/test/memory-db';
import { readDailyReportConfig } from '@/lib/dashboard/daily-report';
import {
    auditItem, buildNameMismatchReport, dailyChangeItem, leadActivityItem,
    loadActivityFeed, loadNameMismatches, mergeFeed, resolveFeedRange,
    type ActivityFeedItem, type DailyReportChangeRow,
} from '../activity-feed';

const CHAN = 'Чанцалдулам.Раднаа';
const ARIUNA = 'Б.Ариунаа';
const { config } = readDailyReportConfig({
    title: null,
    lines: [{ key: 'l1', label: '7786-2222', categories: ['new', 'repeat'] }, { key: 'personal', label: 'Менежерийн дуудлага', categories: [] }],
    chats: [{ key: 'page', label: 'Пэйж FB' }],
    managers: null,
});
const names = new Map([['ariuna-user', 'Ариунаа Батболд'], ['admin-user', 'Захирал Бат']]);
const change = (extra: Partial<DailyReportChangeRow>): DailyReportChangeRow => ({
    id: 1, report_date: '2026-10-18', kind: 'count', manager_name: CHAN, metric: 'call.l1.new', note_key: null,
    old_value: null, new_value: null, old_text: null, new_text: null, viewing_id: null, restored_from: null, meta: {},
    changed_by: 'ariuna-user', changed_by_name: 'Б. Ариунаа', changed_at: '2026-10-18T03:00:00.000Z', ...extra,
});

describe('resolveFeedRange', () => {
    it('анхдагч нь сүүлийн 30 өдөр, 92 хоногоос ихгүй', () => {
        expect(resolveFeedRange({}, '2026-10-19')).toEqual({ from: '2026-09-20', to: '2026-10-19' });
        expect(resolveFeedRange({ to: '2026-10-01' }, '2026-10-19')).toEqual({ from: '2026-09-02', to: '2026-10-01' });
        expect(resolveFeedRange({ from: '2026-07-20', to: '2026-10-19' })).toEqual({ from: '2026-07-20', to: '2026-10-19' });
        expect(resolveFeedRange({ from: '2026-07-19', to: '2026-10-19' })).toEqual({ error: 'Хугацаа 92 хоногоос ихгүй байна' });
        expect(resolveFeedRange({ from: '2026-10-20', to: '2026-10-19' })).toEqual({ error: 'Эхлэх огноо дуусах огнооноос хойш байна' });
    });
});

describe('өдрийн тайлангийн нэр томьёо', () => {
    it('нүд, тэмдэглэл, баталгаажуулалт, уулзалтын өөрчлөлтийг хуучин → шинэ гэж бичнэ', () => {
        const count = dailyChangeItem(change({ old_value: 3, new_value: null, restored_from: 7 }), config, names);
        expect(count).toMatchObject({
            id: 'daily_report:1', source: 'daily_report', kind: 'count', by: 'Б. Ариунаа', byUserId: 'ariuna-user', reportDate: '2026-10-18',
            summary: '7786-2222 · Шинэ · Р. Чанцалдулам: 3 → — · сэргээсэн', href: '/dashboard/daily-report?date=2026-10-18',
        });
        // Хадгалсан нэргүй хуучин мөр → профайлын нэр.
        expect(dailyChangeItem(change({ changed_by_name: null, old_value: null, new_value: 4 }), config, names).by).toBe('Ариунаа Батболд');
        expect(dailyChangeItem(change({ kind: 'note', metric: null, manager_name: null, note_key: 'general', old_text: null, new_text: 'Сайн өдөр' }), config, names))
            .toMatchObject({ summary: 'Тэмдэглэл · Ерөнхий засав', detail: '— → «Сайн өдөр»' });
        expect(dailyChangeItem(change({ kind: 'complete', metric: null, manager_name: null, old_text: 'Х. Бат', new_text: 'Б. Ариунаа' }), config, names))
            .toMatchObject({ summary: 'Тайланг баталгаажуулав', detail: 'Өмнө нь: Х. Бат' });
        expect(dailyChangeItem(change({ kind: 'complete', metric: null, manager_name: null, old_text: 'Б. Ариунаа', new_text: null }), config, names).summary)
            .toBe('Тайлангийн баталгаажуулалтыг цуцлав');
        const meeting = (meta: Record<string, unknown>, extra: Partial<DailyReportChangeRow> = {}) =>
            dailyChangeItem(change({ kind: 'meeting', metric: null, viewing_id: 'v-1', meta, ...extra }), config, names);
        expect(meeting({ action: 'record', meeting_type: 'repeat_customer', lead_created: true }, { new_text: 'Болд' }))
            .toMatchObject({ summary: 'Уулзалт бүртгэв · Р. Чанцалдулам', detail: 'Болд · Давтан · шинэ лид үүсгэв' });
        expect(meeting({ action: 'complete' }).summary).toBe('Уулзалтыг «Болсон» гэж тэмдэглэв · Р. Чанцалдулам');
        expect(meeting({ action: 'no_show' }).summary).toBe('Уулзалтыг «Ирээгүй» гэж тэмдэглэв · Р. Чанцалдулам');
        expect(meeting({ action: 'reassign' }, { old_text: ARIUNA, new_text: CHAN }).summary).toBe('Уулзалтын менежер солив: Б. Ариунаа → Р. Чанцалдулам');
    });
});

describe('аудит, лидийн түүх', () => {
    it('аудитын мөрийг монголоор: аль бичлэг, юу хийсэн, ямар талбар', () => {
        expect(auditItem({ id: 'a1', actor_id: 'admin-user', entity: 'lead', entity_id: 'lead-1', action: 'update', changes: { status: 'won', notes: 'x' }, created_at: '2026-10-18T01:00:00Z' }, names))
            .toMatchObject({ id: 'audit:a1', kind: 'lead.update', by: 'Захирал Бат', summary: 'Лид засав', detail: 'Талбар: Төлөв, Тэмдэглэл', href: '/dashboard/leads?lead=lead-1' });
        expect(auditItem({ id: 'a2', actor_id: 'admin-user', entity: 'lead_category', entity_id: 'c1', action: 'create', changes: { name: 'Халуун', tone: 'danger' }, created_at: '2026-10-18T01:00:00Z' }, names))
            .toMatchObject({ summary: 'Лидийн ангилал нэмэв · Халуун', detail: 'Талбар: Өнгө', href: null });
        expect(auditItem({
            id: 'a3', actor_id: null, entity: 'contract', entity_id: 'k1', action: 'transfer',
            changes: { from: { customer_name: 'Болд' }, to: { customer_name: 'Сараа' }, kind: 'transfer' }, created_at: '2026-10-18T01:00:00Z',
        }, names)).toMatchObject({ by: 'Систем', summary: 'Гэрээ шилжүүлэв', detail: 'Болд → Сараа' });
        expect(auditItem({ id: 'a4', actor_id: 'gone', entity: 'customer', entity_id: 'x', action: 'delete', changes: null, created_at: '2026-10-18T01:00:00Z' }, names))
            .toMatchObject({ by: null, summary: 'Харилцагч устгав', detail: null });
    });

    it('лидийн түүх: төрөл, харилцагчийн нэр, лидийн холбоос', () => {
        expect(leadActivityItem({ id: 'x1', lead_id: 'lead-1', type: 'call', content: 'Залгаж  ярилцав', created_by: 'ariuna-user', created_by_name: null, created_at: '2026-10-18T02:00:00Z' }, 'Болд', names))
            .toEqual({
                id: 'lead:x1', at: '2026-10-18T02:00:00Z', source: 'lead', kind: 'call', by: 'Ариунаа Батболд', byUserId: 'ariuna-user',
                summary: 'Залгав · Болд', detail: 'Залгаж ярилцав', href: '/dashboard/leads?lead=lead-1',
            });
    });

    it('нэгтгэхдээ шинэ нь эхэнд, хязгаараас илүү бол truncated', () => {
        const item = (id: string, at: string) => ({ id, at } as ActivityFeedItem);
        const merged = mergeFeed([[item('a:1', '2026-10-18T01:00:00Z'), item('a:2', '2026-10-18T03:00:00Z')], [item('b:1', '2026-10-18T02:00:00+00:00')]], 2);
        expect(merged.items.map(entry => entry.id)).toEqual(['a:2', 'b:1']);
        expect(merged.truncated).toBe(true);
        expect(mergeFeed([[item('a:1', '2026-10-18T01:00:00Z')]], 2).truncated).toBe(false);
    });
});

const SHOP = 'shop-1';
function feedDb() {
    return createMemoryDb({
        shops: [{ id: SHOP, user_id: 'admin-user' }, { id: 'shop-2', user_id: 'other-owner' }],
        shop_members: [{ shop_id: SHOP, user_id: 'ariuna-user' }, { shop_id: 'shop-2', user_id: 'other-user' }],
        user_profiles: [
            { id: 'admin-user', full_name: 'Захирал Бат', email: 'bat@vertmon.mn' },
            { id: 'ariuna-user', full_name: 'Ариунаа Батболд', email: 'ariuna@vertmon.mn' },
            { id: 'former-user', full_name: 'Гарсан Дорж', email: 'dorj@vertmon.mn' },
        ],
        user_roles: [{ user_id: 'admin-user', role: 'super_admin' }, { user_id: 'ariuna-user', role: 'sales_manager' }],
        sales_managers: [{ shop_id: SHOP, name: ARIUNA, user_id: 'ariuna-user', is_active: true }, { shop_id: 'shop-2', name: 'Өөр', user_id: 'ariuna-user', is_active: true }],
        daily_report_settings: [{ shop_id: SHOP, config: { lines: [{ key: 'l1', label: '7786-2222', categories: [] }], chats: [], managers: null } }],
        daily_report_changes: [
            change({ id: 11, metric: 'call.l1.total', old_value: 1, new_value: 2, changed_at: '2026-10-18T15:59:59.000Z' }) as unknown as Record<string, unknown>,
            // УБ-ийн 10-19 00:00 — хугацаанаас гадна.
            change({ id: 12, changed_at: '2026-10-18T16:00:00.000Z' }) as unknown as Record<string, unknown>,
            change({ id: 13, changed_by: 'admin-user', changed_by_name: 'Захирал Бат', changed_at: '2026-10-17T15:00:00.000Z' }) as unknown as Record<string, unknown>,
        ].map(row => ({ ...row, shop_id: SHOP })).concat([{ ...change({ id: 14 }), shop_id: 'shop-2' } as unknown as Record<string, unknown> & { shop_id: string }]),
        data_audit_log: [
            { id: 'a1', shop_id: SHOP, actor_id: 'former-user', entity: 'customer', entity_id: 'c1', action: 'update', changes: { phone: '9911' }, created_at: '2026-10-18T05:00:00.000Z' },
            { id: 'a2', shop_id: 'shop-2', actor_id: 'ariuna-user', entity: 'lead', entity_id: 'l9', action: 'update', changes: {}, created_at: '2026-10-18T05:00:00.000Z' },
        ],
        lead_activities: [
            { id: 'x1', shop_id: SHOP, lead_id: 'lead-1', type: 'meeting', content: 'Ирсэн уулзалт бүртгэв', created_by: 'ariuna-user', created_by_name: ARIUNA, created_at: '2026-10-18T06:00:00.000Z' },
            { id: 'x2', shop_id: SHOP, lead_id: 'lead-2', type: 'contract', content: 'Гэрээ', created_by: 'ariuna-user', created_by_name: ARIUNA, created_at: '2026-10-18T06:00:00.000Z' },
            { id: 'x3', shop_id: SHOP, lead_id: 'lead-2', type: 'note', content: 'Утсаа сольсон', created_by: 'ariuna-user', created_by_name: ARIUNA, created_at: '2026-10-18T07:00:00.000Z' },
        ],
        leads: [
            { id: 'lead-1', shop_id: SHOP, customer_name: 'Болд', deleted_at: null },
            { id: 'lead-2', shop_id: SHOP, customer_name: null, deleted_at: '2026-10-18T08:00:00.000Z' },
        ],
    });
}

describe('loadActivityFeed', () => {
    // Vercel UTC-ээр ажилладаг: өдрийн хил серверийн цагийн бүсээс хамаарахгүй.
    const tz = process.env.TZ;
    beforeAll(() => { process.env.TZ = 'UTC'; });
    afterAll(() => { process.env.TZ = tz; });

    it('идэвхтэй төслийн гурван эх сурвалжийг УБ-ийн өдрийн хилээр нэгтгэнэ', async () => {
        const feed = await loadActivityFeed(feedDb() as never, { shopId: SHOP, shopName: 'Mandala', from: '2026-10-18', to: '2026-10-18', userId: null });
        expect(feed.items.map(item => item.id)).toEqual(['daily_report:11', 'lead:x3', 'lead:x1', 'audit:a1']);
        expect(feed.items[0].summary).toBe('7786-2222 · Р. Чанцалдулам: 1 → 2');
        expect(feed.items[1]).toMatchObject({ summary: 'Тэмдэглэл · Нэргүй харилцагч (устгасан)', by: ARIUNA });
        expect(feed.items[3]).toMatchObject({ by: 'Гарсан Дорж', byUserId: 'former-user', summary: 'Харилцагч засав', detail: 'Талбар: Утас' });
        expect(feed).toMatchObject({ from: '2026-10-18', to: '2026-10-18', user: null, truncated: false, unavailable: [] });
        expect(feed.users).toEqual([
            { id: 'ariuna-user', name: 'Ариунаа Батболд', email: 'ariuna@vertmon.mn', role: 'sales_manager', managers: [{ name: ARIUNA, active: true }], owner: false, member: true },
            { id: 'admin-user', name: 'Захирал Бат', email: 'bat@vertmon.mn', role: 'super_admin', managers: [], owner: true, member: true },
            { id: 'former-user', name: 'Гарсан Дорж', email: 'dorj@vertmon.mn', role: null, managers: [], owner: false, member: false },
        ]);
    });

    it('хэрэглэгчээр шүүнэ', async () => {
        const feed = await loadActivityFeed(feedDb() as never, { shopId: SHOP, from: '2026-10-17', to: '2026-10-18', userId: 'admin-user' });
        expect(feed.items.map(item => item.id)).toEqual(['daily_report:13']);
        expect(feed.user).toBe('admin-user');
    });

    it('өдрийн тайлангийн түүх хүснэгтгүй бол unavailable; бусад DB алдаа нуугдахгүй', async () => {
        const db = feedDb();
        db.failNext.daily_report_changes = { code: '42P01', message: 'relation "daily_report_changes" does not exist' };
        const feed = await loadActivityFeed(db as never, { shopId: SHOP, from: '2026-10-18', to: '2026-10-18', userId: null });
        expect(feed.unavailable).toEqual(['daily_report']);
        expect(feed.items.map(item => item.id)).toEqual(['lead:x3', 'lead:x1', 'audit:a1']);

        // Production-д data_audit_log үүсээгүй (2026-10-20): тэр эх сурвалжийг алгасна.
        const noAudit = feedDb();
        noAudit.failNext.data_audit_log = { code: '42P01', message: 'relation "public.data_audit_log" does not exist' };
        const withoutAudit = await loadActivityFeed(noAudit as never, { shopId: SHOP, from: '2026-10-18', to: '2026-10-18', userId: null });
        expect(withoutAudit.unavailable).toEqual(['audit']);
        expect(withoutAudit.items.some(item => item.source === 'audit')).toBe(false);

        const broken = feedDb();
        broken.failNext.data_audit_log = { code: '57014', message: 'timeout' };
        await expect(loadActivityFeed(broken as never, { shopId: SHOP, from: '2026-10-18', to: '2026-10-18', userId: null })).rejects.toThrow('timeout');
        const brokenChanges = feedDb();
        brokenChanges.failNext.daily_report_changes = { code: '57014', message: 'changes timeout' };
        await expect(loadActivityFeed(brokenChanges as never, { shopId: SHOP, from: '2026-10-18', to: '2026-10-18', userId: null })).rejects.toThrow('changes timeout');
    });

    it('500-аас олон бол таслаад truncated', async () => {
        const db = feedDb();
        db.tables.lead_activities = Array.from({ length: 502 }, (_, index) => ({
            id: `n${String(index).padStart(3, '0')}`, shop_id: SHOP, lead_id: 'lead-1', type: 'call', content: null,
            created_by: 'ariuna-user', created_by_name: ARIUNA, created_at: new Date(Date.parse('2026-10-18T01:00:00Z') + index * 1000).toISOString(),
        }));
        const feed = await loadActivityFeed(db as never, { shopId: SHOP, from: '2026-10-18', to: '2026-10-18', userId: null });
        expect(feed.items).toHaveLength(500);
        expect(feed.truncated).toBe(true);
        expect(feed.items[0].id).toBe('daily_report:11');
    });
});

describe('Нэрийн зөрүү', () => {
    it('бүртгэлд байхгүй нэр, ойролцоо нэр, бүртгэлийн анхааруулга', () => {
        const report = buildNameMismatchReport({
            roster: [
                { name: ARIUNA, user_id: 'ariuna-user', is_active: true },
                { name: CHAN, user_id: null, is_active: true },
                { name: 'Дорж', user_id: 'dorj-user', is_active: false },
                { name: 'Давхар нэг', user_id: 'twice-user', is_active: true },
                { name: 'Давхар хоёр', user_id: 'twice-user', is_active: true },
            ],
            profiles: new Map([
                ['ariuna-user', { full_name: 'Ариунаа Батболд', email: 'ariuna@vertmon.mn' }],
                ['dorj-user', { full_name: 'Дорж', email: null }],
            ]),
            memberships: [{ manager_name: ARIUNA }, { manager_name: CHAN }, { manager_name: CHAN }],
            names: {
                leads: [ARIUNA, 'Ариунаа Батболд', 'Ариунаа Батболд', 'ariuna@vertmon.mn', null, ' '],
                viewings: ['Ариунаа', 'Р.Чанцалдулам'],
                daily_counts: [CHAN],
            },
            unavailable: ['service_logs'],
        });
        expect(report.unavailable).toEqual(['service_logs']);
        expect(report.unknown).toEqual([
            { name: 'Ариунаа Батболд', counts: { leads: 2 }, total: 2, similar: [ARIUNA] },
            { name: 'Ариунаа', counts: { viewings: 1 }, total: 1, similar: [ARIUNA] },
            { name: 'Р.Чанцалдулам', counts: { viewings: 1 }, total: 1, similar: [CHAN] },
            { name: 'ariuna@vertmon.mn', counts: { leads: 1 }, total: 1, similar: [ARIUNA] },
        ]);
        const byName = new Map(report.roster.map(row => [row.name, row]));
        expect(byName.get(ARIUNA)).toMatchObject({
            linked: true, profileName: 'Ариунаа Батболд', projects: 1, counts: { leads: 1 },
            flags: { profileDiffers: true, noProject: false, inactiveButLinked: false, sharedAccount: false },
        });
        expect(byName.get(CHAN)).toMatchObject({ linked: false, projects: 2, counts: { daily_counts: 1 }, flags: { profileDiffers: false, noProject: false } });
        expect(byName.get('Дорж')?.flags).toEqual({ profileDiffers: false, noProject: true, inactiveButLinked: true, sharedAccount: false });
        expect(byName.get('Давхар нэг')?.flags.sharedAccount).toBe(true);
        // Идэвхтэй нь эхэнд.
        expect(report.roster.at(-1)?.name).toBe('Дорж');
    });

    it('төслийн өгөгдлийг уншина: устгасан, өөр төсөл тоологдохгүй; хүснэгтгүй эх сурвалж unavailable', async () => {
        const db = createMemoryDb({
            sales_managers: [{ shop_id: SHOP, name: ARIUNA, user_id: 'ariuna-user', is_active: true }, { shop_id: 'shop-2', name: 'Өөр', user_id: null, is_active: true }],
            sales_manager_projects: [{ shop_id: SHOP, manager_name: ARIUNA, project_id: 'p1' }],
            user_profiles: [{ id: 'ariuna-user', full_name: 'Ариунаа Батболд', email: 'ariuna@vertmon.mn' }],
            leads: [
                { id: 'l1', shop_id: SHOP, sales_manager_name: 'Ариунаа Батболд', deleted_at: null },
                { id: 'l2', shop_id: SHOP, sales_manager_name: 'Устгасан', deleted_at: '2026-10-01T00:00:00Z' },
                { id: 'l3', shop_id: 'shop-2', sales_manager_name: 'Өөр төсөл', deleted_at: null },
                { id: 'l4', shop_id: SHOP, sales_manager_name: null, deleted_at: null },
            ],
            property_viewings: [{ id: 'v1', shop_id: SHOP, sales_manager_name: ARIUNA, deleted_at: null }],
            property_contracts: [
                { id: 'k1', shop_id: SHOP, sales_manager: 'Ариунаа Б', deleted_at: null },
                { id: 'k2', shop_id: SHOP, sales_manager: 'Устгасан гэрээ', deleted_at: '2026-10-01T00:00:00Z' },
            ],
            service_logs: [{ id: 's1', shop_id: SHOP, manager_name: ARIUNA }],
        });
        db.failNext.daily_report_counts = { code: '42P01', message: 'missing' };
        const report = await loadNameMismatches(db as never, SHOP);
        expect(report.unavailable).toEqual(['daily_counts']);
        expect(report.unknown.map(row => [row.name, row.counts])).toEqual([
            ['Ариунаа Б', { contracts: 1 }],
            ['Ариунаа Батболд', { leads: 1 }],
        ]);
        expect(report.roster).toEqual([expect.objectContaining({ name: ARIUNA, projects: 1, counts: { viewings: 1, service_logs: 1 }, email: 'ariuna@vertmon.mn' })]);

        const broken = createMemoryDb({});
        broken.failNext.leads = { code: '57014', message: 'leads timeout' };
        await expect(loadNameMismatches(broken as never, SHOP)).rejects.toThrow('leads timeout');
    });
});

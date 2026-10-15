import { test, expect, type Page } from '@playwright/test';
import { ROLE_PERMISSIONS } from '../src/lib/rbac';
import { ubDateStr } from '../src/lib/utils/date';
import { shiftReviewDate } from '../src/lib/dashboard/weekly-review';

const shop = '00000000-0000-4000-8000-000000000002';
const today = ubDateStr();
const day = (offset: number) => shiftReviewDate(today, offset);
const item = (id: string, title: string, scheduled_date: string, status: string, extra: Record<string, unknown> = {}) => ({
    id: `00000000-0000-4000-8000-0000000001${id}`, title, type: 'post', platform: 'facebook', scheduled_date, scheduled_time: null, status,
    description: null, assigned_to: 'Анужин', color: null, image_paths: [], created_by: null, updated_at: '2026-10-01T00:00:00Z', ...extra,
});
const metric = (metric: string, label: string, kind: 'sum' | 'latest', value: number | null, delta: number | null, deltaPct: number | null) => ({
    metric, label, kind, value, previous: value === null || delta === null ? null : value - delta,
    comparison: kind === 'latest' ? 'week-ago' : 'week', day: value === null ? null : day(-1), days: value === null ? 0 : 7, delta, deltaPct,
});

/** Маркетингийн самбарын API-г дуурайна; борлуулалтын самбарын дуудлагыг тэмдэглэнэ. */
async function setup(page: Page, role: 'marketing' | 'admin') {
    const state = {
        items: [
            item('01', 'Хоцорсон reel', day(-2), 'in_progress', { type: 'reel' }),
            item('02', 'Өглөөний пост', today, 'published', { scheduled_time: '09:00:00', image_paths: [`${shop}/u/p.jpg`] }),
            item('03', 'Оройн story', today, 'planned', { type: 'story', scheduled_time: '19:00:00' }),
            item('04', 'Нээлтийн зар', day(2), 'ready', { type: 'ad' }),
            item('05', 'Цуцалсан пост', day(3), 'cancelled'),
        ],
        patches: [] as { id: string; body: unknown }[],
        ranges: [] as string[],
        salesCalls: [] as string[],
        errors: [] as string[],
    };
    page.on('pageerror', e => state.errors.push(e.message));
    await page.route('**/api/**', async route => {
        const request = route.request(), url = new URL(request.url()), path = url.pathname;
        const reply = (json: unknown, status = 200) => route.fulfill({ json, status });
        if (path.startsWith('/api/auth/')) return route.continue();
        if (path === '/api/me') return reply({ user: { fullName: 'Анужин' }, role, permissions: { ...ROLE_PERMISSIONS[role], canWrite: true }, shops: [{ id: shop, name: 'Elysium Residence', is_active: true, setup_completed: true }] });
        if (path === '/api/dashboard/mode') return reply(role === 'marketing'
            ? { mode: 'org', managerName: null, isManager: false, canViewTeam: true, marketingHome: true, canViewMarketing: true }
            : { mode: 'org', managerName: null, isManager: false, canViewTeam: false, marketingHome: false, canViewMarketing: true });
        if (path === '/api/marketing/content-plan') {
            expect(request.headers()['x-shop-id']).toBe(shop);
            state.ranges.push(`${url.searchParams.get('from')}..${url.searchParams.get('to')}`);
            return reply({ items: state.items });
        }
        if (path.startsWith('/api/marketing/content-plan/') && request.method() === 'PATCH') {
            const id = path.split('/').pop()!;
            const body = request.postDataJSON() as Record<string, string>;
            state.patches.push({ id, body });
            const row = state.items.find(row => row.id === id)!;
            if (body.status) row.status = body.status;
            if (body.scheduledDate) row.scheduled_date = body.scheduledDate;
            return reply({ item: row });
        }
        if (path === '/api/dashboard/marketing/social-week') {
            // Самбар явж буй хурлын долоо хоног биш, сүүлд синк хийсэн өдрөөр дуусах 7 хоногийг асууна.
            expect(url.searchParams.get('latest')).toBe('1');
            expect(url.searchParams.has('meetingDate')).toBe(false);
            return reply({ week: {
                page: { id: '102', name: 'Elysium Residence' }, range: { from: day(-8), to: day(-2) }, previousRange: { from: day(-15), to: day(-9) },
                syncedTo: day(-2), rangeDays: 7,
                metrics: [
                    metric('page_media_view', 'Үзэлт', 'sum', 48210, 8210, 20.5),
                    metric('page_post_engagements', 'Нийтлэлийн оролцоо', 'sum', 1540, -160, -9.4),
                    metric('page_daily_follows_unique', 'Шинэ дагагч', 'sum', null, null, null),
                    metric('page_follows', 'Дагагч', 'latest', 12500, 80, 0.6),
                ],
                posts: [{ id: 'p1', content: 'Нээлт', publishedAt: `${day(-3)}T02:00:00Z`, views: 900, clicks: 12, likes: 14, comments: 2, shares: 0, asOf: day(-1) }],
            } });
        }
        if (path === '/api/marketing/budget') {
            const month = Number(today.slice(5, 7));
            const months = Array.from({ length: 12 }, (_, i) => i + 1 === month
                ? { month: i + 1, budget: 10_000_000, spend: 4_200_000, revenue: 0, pct: 42, status: 'ok' }
                : { month: i + 1, budget: 0, spend: 0, revenue: 0, pct: null, status: 'none' });
            return reply({ year: Number(today.slice(0, 4)), available: true, overview: { months, totals: { budget: 10_000_000, spend: 4_200_000, revenue: 0, pct: 42, status: 'ok', roi: null } }, spendQuality: { missingFx: 0 } });
        }
        if (/^\/api\/dashboard\/(director|my-stats|reports|kpi)/.test(path)) state.salesCalls.push(path);
        if (path === '/api/dashboard/director') return reply({ available: false });
        return reply({});
    });
    await page.goto('/auth/login');
    await page.getByLabel('Имэйл', { exact: true }).fill('workflow@example.invalid');
    await page.getByLabel('Нууц үг', { exact: true }).fill('workflow-test-only');
    await page.getByRole('button', { name: 'Нэвтрэх', exact: true }).click();
    await expect(page).toHaveURL(/\/dashboard$/);
    return state;
}

test('a marketing manager lands on the content plan dashboard, not the sales dashboard', async ({ page }) => {
    const state = await setup(page, 'marketing');
    const todayPanel = page.locator('section', { has: page.getByRole('heading', { name: 'Өнөөдрийн контент' }) });
    await expect(todayPanel).toBeVisible();
    await expect(page.getByText('Маркетингийн тойм')).toBeVisible();
    await expect(todayPanel.getByText('Хоцорсон · сүүлийн 30 хоног')).toBeVisible();
    await expect(todayPanel.getByText('Хоцорсон reel')).toBeVisible();
    await expect(todayPanel.getByText('Өглөөний пост')).toBeVisible();
    await expect(todayPanel.getByText('Оройн story')).toBeVisible();
    await expect(todayPanel.getByText('Цуцалсан пост')).toHaveCount(0);

    const upcoming = page.locator('section', { has: page.getByRole('heading', { name: 'Ирэх 7 хоног' }) });
    await expect(upcoming.getByText('6 өдөр контентгүй')).toBeVisible();
    await expect(upcoming.getByRole('button', { name: /Нээлтийн зар/ })).toBeVisible();

    const plan = page.locator('section', { has: page.getByRole('heading', { name: /сарын контент төлөвлөгөө/ }) });
    // Сарын хүрээнд байгаа контентоор (цуцалсныг тооцохгүй) — сарын эхэн/сүүлд хамаарч өөр байж болно.
    await expect(plan.getByText(/^\d+\/\d+$/).first()).toBeVisible();
    await expect(plan.getByText('нийтэлсэн ·', { exact: false })).toBeVisible();
    const facebook = page.locator('section', { has: page.getByRole('heading', { name: 'Facebook хуудас' }) });
    const short = (value: string) => `${value.slice(5, 7)}.${value.slice(8)}`;
    await expect(facebook.getByText(`Сүүлийн 7 хоног · ${short(day(-8))}–${short(day(-2))}`)).toBeVisible();
    await expect(facebook.getByText(`синк ${day(-2)} хүртэл`)).toBeVisible();
    await expect(facebook.getByText('48,210')).toBeVisible();
    await expect(facebook.getByText('+20.5%')).toBeVisible();
    await expect(facebook.getByText('-9.4%')).toBeVisible();
    await expect(facebook.getByText('Meta өгөөгүй')).toBeVisible();
    await expect(facebook.getByText('+80')).toBeVisible();
    const budget = page.locator('section', { has: page.getByRole('heading', { name: /сарын төсөв/ }) });
    await expect(budget.getByText('42%')).toBeVisible();

    // Борлуулалтын самбар, лид/гэрээний үзүүлэлт энд дуудагдахгүй.
    expect(state.salesCalls).toEqual([]);
    await expect(page.getByText(/Шинэ лид|гэрээ/)).toHaveCount(0);
    expect(state.ranges.every(range => range.split('..')[0] <= day(-30) && range.split('..')[1] >= day(7))).toBe(true);


    // Хоцорсон контентыг нийтэлсэн гэж тэмдэглэх → жагсаалтаас гарна.
    const overdueRow = todayPanel.locator('div.group', { hasText: 'Хоцорсон reel' });
    await overdueRow.getByRole('button', { name: 'Нийтэлсэн' }).click();
    await expect(page.getByText('Нийтэлсэн гэж тэмдэглэв')).toBeVisible();
    await expect(todayPanel.getByText('Хоцорсон reel')).toHaveCount(0);
    // Өнөөдрийн story-г маргааш руу шилжүүлэх.
    await todayPanel.locator('div.group', { hasText: 'Оройн story' }).getByRole('button', { name: 'Маргааш' }).click();
    await expect(upcoming.getByRole('button', { name: /Оройн story/ })).toBeVisible();
    expect(state.patches).toEqual([
        { id: state.items[0].id, body: { status: 'published' } },
        { id: state.items[2].id, body: { scheduledDate: day(1) } },
    ]);

    // Контентгүй өдөрт «+» → тэр өдрийн огноотой шинэ контент.
    await upcoming.getByRole('button', { name: /-нд контент нэмэх$/ }).nth(2).click();
    const dialog = page.getByRole('dialog', { name: 'Шинэ контент' });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByLabel('Огноо')).toHaveValue(day(3));
    expect(state.errors).toEqual([]);
});

test('a director switches between the sales and marketing dashboards', async ({ page }) => {
    const state = await setup(page, 'admin');
    const sales = page.getByRole('button', { name: 'Борлуулалт', exact: true });
    const marketing = page.getByRole('button', { name: 'Маркетинг', exact: true });
    await expect(sales).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByRole('heading', { name: 'Өнөөдрийн контент' })).toHaveCount(0);

    await marketing.click();
    await expect(page).toHaveURL(/\/dashboard\?view=marketing$/);
    await expect(marketing).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByRole('heading', { name: 'Өнөөдрийн контент' })).toBeVisible();
    await expect(page.getByText('Хоцорсон reel')).toBeVisible();

    await page.reload();
    await expect(page.getByRole('heading', { name: 'Өнөөдрийн контент' })).toBeVisible();
    await sales.click();
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.getByRole('heading', { name: 'Өнөөдрийн контент' })).toHaveCount(0);
    expect(state.errors).toEqual([]);
});

import { test, expect, type Page } from '@playwright/test';
import { ROLE_PERMISSIONS } from '../src/lib/rbac';
import { mkdirSync } from 'node:fs';

const shopId = '00000000-0000-4000-8000-000000000110';
const projectId = '00000000-0000-4000-8000-000000000120';
const leadId = '00000000-0000-4000-8000-000000000130';
const viewingId = '00000000-0000-4000-8000-000000000140';
const password = 'onboarding-test-only';
const admin = { id: '00000000-0000-4000-8000-000000000101', email: 'onboarding-admin@example.invalid', full_name: 'Тест Админ', role: 'super_admin' as const };
const managers = [
    { id: '00000000-0000-4000-8000-000000000102', email: 'onboarding-manager-1@example.invalid', full_name: 'Тест Менежер Нэг', role: 'sales_manager' as const },
    { id: '00000000-0000-4000-8000-000000000103', email: 'onboarding-manager-2@example.invalid', full_name: 'Тест Менежер Хоёр', role: 'sales_manager' as const },
];
type Identity = typeof admin | typeof managers[number];
const shop = { id: shopId, name: 'Тест байгууллага', setup_completed: true, is_active: true };
/** «Утас» талбарт бичих утга → серверт очих нормчилсон 8 оронтой утас (хоосон бол илгээхгүй). */
const managerPhones = [{ typed: '+976 9911-2233', sent: '99112233' }, { typed: '', sent: undefined }];

function data() {
    return { projects: [] as Record<string, unknown>[], users: [] as Record<string, unknown>[],
        lead: null as Record<string, any> | null, viewings: [] as Record<string, any>[], tasks: [] as Record<string, any>[],
        writes: [] as { path: string; body: Record<string, any>; shopHeader?: string }[],
        unhandled: [] as string[], pageErrors: [] as string[], failProject: false, failTask: false };
}
type State = ReturnType<typeof data>;

/** UI/API contracts only: real Next login/cookies, disposable Auth emulator,
 * mocked business endpoints. This does not prove provisioning, triggers or RLS. */
async function fixtures(page: Page, identity: Identity, state: State) {
    page.on('pageerror', error => state.pageErrors.push(error.message));
    await page.route('**/api/**', async route => {
        const request = route.request();
        const url = new URL(request.url());
        const path = url.pathname;
        const method = request.method();
        if (path.startsWith('/api/auth/')) return route.continue();
        const reply = (json: unknown, status = 200) => route.fulfill({ status, json });
        const write = () => {
            const body = request.postDataJSON();
            state.writes.push({ path, body, shopHeader: request.headers()['x-shop-id'] });
            return body;
        };
        if (path === '/api/me') return reply({ user: { fullName: identity.full_name }, role: identity.role,
            permissions: ROLE_PERMISSIONS[identity.role], shops: [shop] });
        if (path === '/api/user/shops') return reply({ shops: [shop] });
        if (path === '/api/admin/settings') return reply({ admin: { email: admin.email, role: admin.role } });
        if (path === '/api/admin/shops') return reply({ shops: [shop] });
        if (path === '/api/admin/roles') return reply({ roles: [
            { name: 'sales_manager', display_name_mn: 'Борлуулалтын менежер' }, { name: 'viewer', display_name_mn: 'Харах эрх' },
        ] });
        if (path === '/api/admin/projects') {
            if (method === 'POST') {
                const body = write();
                if (state.failProject) return reply({ error: 'Төсөл хадгалах түр алдаа' }, 503);
                const project = { ...body, id: projectId, shops: { name: shop.name } };
                state.projects.push(project);
                return reply({ project }, 201);
            }
            return reply({ projects: state.projects });
        }
        if (path === '/api/admin/users') {
            if (method === 'POST') {
                const body = write();
                const account = managers.find(manager => manager.email === body.email)!;
                const user = { ...account, created_at: new Date().toISOString() };
                state.users.push(user);
                return reply({ user, login_verified: false }, 201);
            }
            return reply({ users: state.users });
        }
        if (path === '/api/dashboard/mode') return reply({ mode: 'personal', managerName: identity.full_name, isManager: true, canViewTeam: false });
        if (path === '/api/dashboard/nav-counts') return reply({ leads: state.lead ? 1 : 0, inbox: 0, meetings: state.viewings.length });
        if (path === '/api/dashboard/leads/projects') return reply({ projects: state.projects });
        if (path === '/api/dashboard/managers') return reply({ managers: managers.map(manager => ({ ...manager, name: manager.full_name, is_active: true, project_ids: [projectId], assignable: identity.role !== 'sales_manager' })), mineName: identity.full_name });
        if (path === '/api/dashboard/my-stats') return reply({ manager: { name: identity.full_name, isSelf: true, inRoster: true, hasAccount: true }, onboarding: false, period: 'today', missing: [],
            kpis: { activeLeads: state.lead ? 1 : 0, newLeads: state.lead ? 1 : 0, leadsByStatus: {}, viewingsToday: 0,
                viewingsThisWeek: state.viewings.length, activeContracts: 0, overdueContracts: 0, salesThisMonth: 0, salesThisYear: 0, contractCountThisYear: 0 },
            target: null, tasks: [], recentLeads: state.lead ? [state.lead] : [], upcomingViewings: [], revenueTrend: Array(12).fill(0) });
        if (path === '/api/dashboard/leads' && method === 'POST') {
            const body = write();
            state.lead = { ...body, id: leadId, shop_id: shopId, status: 'new', sales_manager_name: identity.full_name,
                created_at: new Date().toISOString(), updated_at: new Date().toISOString(), next_followup_at: null };
            return reply({ lead: state.lead }, 201);
        }
        if (path === `/api/dashboard/leads/${leadId}`) return reply({ lead: state.lead, viewings: state.viewings, contracts: [], activities: [], property: null });
        if (path === '/api/dashboard/leads') return reply({ leads: url.searchParams.has('phone') ? [] : state.lead ? [state.lead] : [],
            pagination: { total: state.lead ? 1 : 0, page: 1, pageSize: 25, totalPages: 1, hasMore: false } });
        if (path === '/api/dashboard/leads/summary') return reply({ all: 1, mine: 1, new: 1, meetings: 0, active: 1, mineName: identity.full_name, canClaim: false,
            queues: { unassigned: 0, uncontacted: 0, no_followup: 0, overdue: 0 } });
        if (path === '/api/dashboard/properties/search') return reply({ properties: [] });
        if (path === '/api/dashboard/viewings' && method === 'POST') {
            const body = write();
            if (state.lead) state.lead.status = 'viewing_scheduled';
            state.viewings.push({ ...body, id: viewingId, status: 'scheduled', lead: state.lead, property: null, sales_manager_name: identity.full_name });
            return reply({ viewing: state.viewings[0], lead_id: leadId }, 201);
        }
        if (path === '/api/dashboard/viewings') return reply({ viewings: state.viewings, counts: { today: 0, upcoming: state.viewings.length, past: 0 } });
        if (path === '/api/dashboard/tasks') {
            if (method === 'POST') {
                const body = write();
                if (state.failTask) return reply({ error: 'Ажил хадгалах түр алдаа' }, 503);
                const task = { id: '00000000-0000-4000-8000-000000000150', user_id: identity.id, title: body.title, note: body.note || null,
                    due_at: body.dueAt || null, remind_at: body.remindAt || null, status: 'pending', completed_at: null, created_at: new Date().toISOString() };
                state.tasks.push(task);
                return reply({ task }, 201);
            }
            return reply({ tasks: state.tasks.filter(task => task.user_id === identity.id), available: true });
        }
        if (path.startsWith('/api/dashboard/tasks/') && method === 'PATCH') {
            const body = write();
            const task = state.tasks.find(task => task.id === path.split('/').pop() && task.user_id === identity.id)!;
            Object.assign(task, body, { completed_at: body.status === 'done' ? new Date().toISOString() : null });
            return reply({ task });
        }
        state.unhandled.push(`${method} ${path}`);
        return reply({ error: `Missing onboarding fixture: ${path}` }, 501);
    });
}

async function login(page: Page, identity: Identity) {
    await page.goto('/auth/login');
    await page.getByLabel('Имэйл', { exact: true }).fill(identity.email);
    await page.getByLabel('Нууц үг', { exact: true }).fill(password);
    await page.getByRole('button', { name: 'Нэвтрэх', exact: true }).click();
    await expect(page).toHaveURL(/\/dashboard$/);
}

test('invite callback creates SSR session and protects separate manager identities', async ({ page, browser }) => {
    const state = data();
    await fixtures(page, managers[0], state);
    const callback = await page.goto('/auth/callback?token_hash=manager-1-invite-first-browser&type=invite');
    expect(callback?.status()).toBe(200);
    await expect(page).toHaveURL(/\/dashboard$/);
    const cookie = (await page.context().cookies()).find(cookie => /^sb-.*-auth-token$/.test(cookie.name));
    expect(cookie).toBeDefined();
    const session = JSON.parse(Buffer.from(decodeURIComponent(cookie!.value).replace(/^base64-/, ''), 'base64url').toString());
    expect(session.user.id).toBe(managers[0].id);
    // The SSR proxy verifies the cookie against the disposable Auth service.
    await page.goto('/dashboard/tasks');
    await expect(page.getByRole('heading', { name: 'Миний ажлууд', exact: true })).toBeVisible();
    const otherContext = await browser.newContext({ timezoneId: 'Asia/Ulaanbaatar', bypassCSP: true, serviceWorkers: 'block' });
    const other = await otherContext.newPage();
    await other.goto('/dashboard/tasks');
    await expect(other).toHaveURL(/\/auth\/login\?redirect_url=/);
    await fixtures(other, managers[1], state);
    await other.goto('/auth/callback?token_hash=manager-2-invite-second-browser&type=invite');
    await expect(other).toHaveURL(/\/dashboard$/);
    const otherCookie = (await otherContext.cookies()).find(cookie => /^sb-.*-auth-token$/.test(cookie.name));
    const otherSession = JSON.parse(Buffer.from(decodeURIComponent(otherCookie!.value).replace(/^base64-/, ''), 'base64url').toString());
    expect(otherSession.user.id).toBe(managers[1].id);
    expect(otherSession.user.id).not.toBe(session.user.id);
    await otherContext.close();
    expect(state.unhandled).toEqual([]);
    expect(state.pageErrors).toEqual([]);
});

for (const query of [
    'token_hash=expired-invite&type=invite',
    'error=access_denied&error_code=otp_expired&error_description=Expired',
]) {
    test(`expired invite explains the failure without granting a session (${query})`, async ({ page }) => {
        await page.goto(`/auth/callback?${query}`);
        await expect(page).toHaveURL(/\/auth\/login\?auth_error=link_expired$/);
        await expect(page.locator('[data-slot="alert"]')).toContainText('хугацаа');
        expect((await page.context().cookies()).filter(cookie => /^sb-.*-auth-token$/.test(cookie.name))).toHaveLength(0);
        await page.goto('/dashboard/tasks');
        await expect(page).toHaveURL(/\/auth\/login\?redirect_url=/);
    });
}

test('invalid callback reports failure and invite hashes cannot be reused', async ({ page, browser }) => {
    await page.goto('/auth/callback?token_hash=attacker&type=invite');
    await expect(page).toHaveURL(/\/auth\/login\?auth_error=callback_failed$/);
    await expect(page.locator('[data-slot="alert"]')).toBeVisible();
    const state = data();
    await fixtures(page, managers[0], state);
    const query = '/auth/callback?token_hash=manager-1-invite-single-use&type=invite';
    await page.goto(query);
    await expect(page).toHaveURL(/\/dashboard$/);
    const fresh = await browser.newContext({ bypassCSP: true, serviceWorkers: 'block' });
    const freshPage = await fresh.newPage();
    await freshPage.goto(query);
    await expect(freshPage).toHaveURL(/\/auth\/login\?auth_error=link_expired$/);
    expect((await fresh.cookies()).filter(cookie => /^sb-.*-auth-token$/.test(cookie.name))).toHaveLength(0);
    await fresh.close();
});

test('self-registration is currently disabled and tells users to contact an admin', async ({ page }) => {
    const response = await page.request.get('/auth/register', { maxRedirects: 0 });
    expect(response.status()).toBe(307);
    expect(response.headers().location).toMatch(/\/auth\/login$/);
    await page.goto('/auth/register');
    await expect(page).toHaveURL(/\/auth\/login$/);
    await expect(page.getByText('Нэвтрэх эрхгүй бол админтай холбогдоно уу', { exact: true })).toBeVisible();
    await expect(page.locator('#register-email')).toHaveCount(0);
});

test('incorrect password does not create an authenticated cookie', async ({ page }) => {
    await page.goto('/auth/login');
    await page.getByLabel('Имэйл', { exact: true }).fill(managers[0].email);
    // A trailing space must remain part of the submitted password.
    await page.getByLabel('Нууц үг', { exact: true }).fill(`${password} `);
    await page.getByRole('button', { name: 'Нэвтрэх', exact: true }).click();
    await expect(page.locator('[data-slot="alert"]')).toContainText('Имэйл эсвэл нууц үг буруу');
    await expect(page).toHaveURL(/\/auth\/login$/);
    expect((await page.context().cookies()).filter(cookie => /^sb-.*-auth-token$/.test(cookie.name))).toHaveLength(0);
});

for (const mobile of [false, true]) {
    test(`admin project → two managers → lead, meeting and personal task (${mobile ? 'mobile' : 'desktop'} API fixtures)`, async ({ page, browser }) => {
        test.setTimeout(120_000);
        const viewport = mobile ? { width: 390, height: 844 } : { width: 1440, height: 1000 };
        await page.setViewportSize(viewport);
        const state = data();
        await fixtures(page, admin, state);
        await login(page, admin);
        await page.goto('/admin/projects');
        await expect(page.getByText('Төсөл бүртгэгдээгүй байна.', { exact: true })).toBeVisible();
        await page.getByRole('button', { name: 'Шинэ төсөл', exact: true }).click();
        const project = page.getByRole('dialog', { name: 'Шинэ төсөл', exact: true });
        await project.getByLabel('Төслийн нэр', { exact: true }).fill('Тест шинэ төсөл');
        await project.getByLabel('Дүүрэг', { exact: true }).fill('Хан-Уул');
        state.failProject = true;
        await project.getByRole('button', { name: 'Хадгалах', exact: true }).click();
        await expect(project.getByRole('alert')).toHaveText('Төсөл хадгалах түр алдаа');
        await expect(project.getByLabel('Төслийн нэр', { exact: true })).toHaveValue('Тест шинэ төсөл');
        state.failProject = false;
        await project.getByRole('button', { name: 'Хадгалах', exact: true }).click();
        await expect(project).not.toBeVisible();
        await page.reload();
        await expect(page.getByRole('heading', { name: 'Тест шинэ төсөл', exact: true })).toBeVisible();
        mkdirSync('output/onboarding', { recursive: true });
        await page.screenshot({ path: `output/onboarding/${mobile ? 'mobile' : 'desktop'}-project.png`, fullPage: true });

        await page.goto('/admin/users');
        for (const [index, manager] of managers.entries()) {
            await page.getByRole('button', { name: 'Хэрэглэгч нэмэх', exact: true }).click();
            const modal = page.getByRole('dialog', { name: 'Хэрэглэгч нэмэх', exact: true });
            await modal.getByPlaceholder('Нэр оруулах', { exact: true }).fill(manager.full_name);
            await modal.getByPlaceholder('email@example.com', { exact: true }).fill(manager.email);
            await modal.getByLabel('Утас', { exact: true }).fill(managerPhones[index].typed);
            await modal.getByPlaceholder('Хамгийн багадаа 8 тэмдэгт', { exact: true }).fill(password);
            await modal.getByRole('button', { name: 'Борлуулалтын менежер', exact: true }).click();
            await expect(modal.locator('select')).toHaveValue(shopId);
            await modal.getByRole('button', { name: 'Үүсгэх', exact: true }).click();
            await expect(modal).not.toBeVisible();
            await expect(page.getByText(manager.full_name, { exact: true })).toBeVisible();
        }
        await page.reload();
        await expect(page.getByText(managers[1].full_name, { exact: true })).toBeVisible();
        await page.screenshot({ path: `output/onboarding/${mobile ? 'mobile' : 'desktop'}-managers.png`, fullPage: true });
        expect(state.users).toHaveLength(2);
        const userWrites = state.writes.filter(write => write.path === '/api/admin/users');
        expect(userWrites).toHaveLength(2);
        for (const [index, write] of userWrites.entries()) {
            expect(write.body).toMatchObject({
                email: managers[index].email, full_name: managers[index].full_name, role: 'sales_manager', shop_id: shopId,
            });
            expect(write.body.phone).toBe(managerPhones[index].sent);
        }

        const managerContext = await browser.newContext({ viewport, timezoneId: 'Asia/Ulaanbaatar', bypassCSP: true, serviceWorkers: 'block' });
        const managerPage = await managerContext.newPage();
        await fixtures(managerPage, managers[0], state);
        await login(managerPage, managers[0]);
        await expect(managerPage.getByText('Өнөөдөр төлөвлөсөн ажил алга', { exact: true })).toBeVisible();
        await managerPage.getByRole('button', { name: 'Шинэ лид', exact: true }).click();
        const leadForm = managerPage.getByRole('dialog', { name: 'Түргэн бүртгэл', exact: true });
        await leadForm.getByPlaceholder('Ж: Г. Энхжин').fill('Тест харилцагч');
        await leadForm.getByPlaceholder('9911 2233').fill('99112233');
        await expect(leadForm.getByLabel('Төсөл', { exact: true })).toHaveCount(0);
        await leadForm.getByRole('button', { name: 'Хадгалаад уулзалт товлох', exact: true }).click();
        const meeting = managerPage.getByRole('dialog', { name: 'Уулзалт товлох', exact: true });
        await expect(meeting).toBeVisible();
        await meeting.locator('input[type="datetime-local"]').fill('2027-01-10T11:00');
        await meeting.getByRole('button', { name: 'Товлох', exact: true }).click();
        await expect(meeting).not.toBeVisible();
        expect(state.lead?.sales_manager_name).toBe(managers[0].full_name);
        expect(state.lead?.project_id).toBe(projectId);
        expect(state.writes.find(write => write.path === '/api/dashboard/viewings')?.body).toMatchObject({ lead_id: leadId, scheduled_at: '2027-01-10T03:00:00.000Z', meeting_type: 'new_customer' });

        await managerPage.goto('/dashboard/tasks');
        await managerPage.getByLabel('Шинэ ажлын гарчиг', { exact: true }).fill('Тест харилцагчид санал илгээх');
        await managerPage.getByLabel('Дуусах хугацаа', { exact: true }).fill('2027-01-10T12:00');
        state.failTask = true;
        await managerPage.getByRole('button', { name: 'Нэмэх', exact: true }).click();
        await expect(managerPage.getByText('Ажил хадгалах түр алдаа', { exact: true })).toBeVisible();
        await expect(managerPage.getByLabel('Шинэ ажлын гарчиг', { exact: true })).toHaveValue('Тест харилцагчид санал илгээх');
        state.failTask = false;
        await managerPage.getByRole('button', { name: 'Нэмэх', exact: true }).click();
        await expect(managerPage.getByText('Тест харилцагчид санал илгээх', { exact: true })).toBeVisible();
        await managerPage.reload();
        await managerPage.getByRole('button', { name: '«Тест харилцагчид санал илгээх» дуусгах', exact: true }).click();
        await expect(managerPage.getByText('Идэвхтэй ажил алга', { exact: true })).toBeVisible();
        await managerPage.getByRole('button', { name: 'Дууссан 1', exact: true }).click();
        await expect(managerPage.getByText('Тест харилцагчид санал илгээх', { exact: true })).toBeVisible();
        await managerPage.screenshot({ path: `output/onboarding/${mobile ? 'mobile' : 'desktop'}-task.png`, fullPage: true });
        expect(state.tasks[0]).toMatchObject({ user_id: managers[0].id, status: 'done', due_at: '2027-01-10T04:00:00.000Z' });
        expect(state.writes.filter(write => write.path.startsWith('/api/dashboard/')).every(write => write.shopHeader === shopId)).toBe(true);
        expect(await managerPage.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);

        const otherContext = await browser.newContext({ viewport, timezoneId: 'Asia/Ulaanbaatar', bypassCSP: true, serviceWorkers: 'block' });
        const otherPage = await otherContext.newPage();
        await fixtures(otherPage, managers[1], state);
        await login(otherPage, managers[1]);
        await otherPage.goto('/dashboard/tasks');
        await expect(otherPage.getByText('Идэвхтэй ажил алга', { exact: true })).toBeVisible();
        await expect(otherPage.getByText('Тест харилцагчид санал илгээх', { exact: true })).toHaveCount(0);
        await otherPage.goto('/admin/users');
        await expect(otherPage).toHaveURL(/\/dashboard$/);
        await expect(otherPage.getByRole('heading', { name: 'Хэрэглэгчид & Дүрүүд', exact: true })).toHaveCount(0);
        expect(state.unhandled).toEqual([]);
        expect(state.pageErrors).toEqual([]);
        await managerContext.close();
        await otherContext.close();
    });
}

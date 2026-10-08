import { test, expect, type Page, type Locator } from '@playwright/test';
import { ROLE_PERMISSIONS } from '../src/lib/rbac';
import { calculatePricing, type PricingConfig, type PricingSaveInput, type PricingSelection } from '../src/lib/sales/pricing';
import { emptyMonthlySales, type MonthlySalesPatch } from '../src/lib/sales/monthly';
import { elysiumViewingConditions } from '../src/lib/sales/viewing-conditions';
import type { CreateViewingInput, ViewingPatch, ViewingRow } from '../src/hooks/useViewings';

const adminId = '00000000-0000-4000-8000-000000000101';
const shopId = '00000000-0000-4000-8000-000000000110';
const projectId = '00000000-0000-4000-8000-000000000120';
const viewingId = '00000000-0000-4000-8000-000000000130';
const leadId = '00000000-0000-4000-8000-000000000131';
const configId = '00000000-0000-4000-8000-000000000140';
const units = [
    { id: '00000000-0000-4000-8000-000000000151', project_id: projectId, block: 'Б1', model: 'E3', area_sqm: 80.32, floor: 2, unit_number: '201', code: 'Б1-201', status: 'available' },
    { id: '00000000-0000-4000-8000-000000000152', project_id: projectId, block: 'Б2', model: 'A', area_sqm: 57.23, floor: 2, unit_number: '202', code: 'Б2-202', status: 'available' },
];
const activeConfig: PricingConfig = {
    id: configId, shop_id: shopId, version: 1, status: 'active', source: 'Тестээр баталсан үнэ',
    valid_from: '2026-01-01', valid_until: '2026-12-31', inventory_area_confirmed: true,
    rules: [
        { block: 'Б1', model: 'E3', floor_min: 2, floor_max: 8, payment_condition: '50%', price_per_sqm: 4_000_000, advance_percent: 50 },
        { block: 'Б2', model: 'A', floor_min: 2, floor_max: 8, payment_condition: '30%', price_per_sqm: 3_000_000, advance_percent: 30 },
    ],
};

// Real Next pages and isolated auth cookies. Business APIs below are browser fixtures;
// these tests prove UI transport/state, not a migration or real database persistence.
async function setup(page: Page, approvedPricing = true) {
    const shop = { id: shopId, name: 'Elysium Residence', setup_completed: true, is_active: true };
    const viewingPricing = approvedPricing ? activeConfig : null;
    const months = emptyMonthlySales();
    months[0].manual_cashflow_actual_amount = 5;
    const state = {
        errors: [] as string[], unhandled: [] as string[], quotes: [] as PricingSelection[],
        viewingWrites: [] as Array<CreateViewingInput | ViewingPatch>, viewings: [] as ViewingRow[],
        monthlyWrites: [] as Array<{ shopId: string; year: number; months: MonthlySalesPatch[] }>, months,
        monthlyConflict: false, pricingWrites: [] as PricingSaveInput[], latest: null as PricingConfig | null,
        active: null as PricingConfig | null,
    };
    page.on('pageerror', error => state.errors.push(error.message));
    await page.route('**/api/**', async route => {
        const request = route.request(); const url = new URL(request.url()); const path = url.pathname;
        const reply = (json: unknown, status = 200) => route.fulfill({ json, status });
        if (path.startsWith('/api/auth/')) return route.continue();
        if (path === '/api/me') return reply({ user: { fullName: 'Тест Админ' }, role: 'super_admin', permissions: ROLE_PERMISSIONS.super_admin, shops: [shop] });
        if (path === '/api/user/shops') return reply({ shops: [shop] });
        if (path === '/api/dashboard/mode') return reply({ mode: 'org', canViewTeam: false });
        if (path === '/api/dashboard/director') return reply({ available: false });
        if (path === '/api/dashboard/nav-counts') return reply({ leads: 0, inbox: 0, meetings: state.viewings.length });
        if (path === '/api/admin/settings') return reply({ admin: { email: 'onboarding-admin@example.invalid', role: 'super_admin' } });
        if (path === '/api/admin/shops') return reply({ shops: [shop] });
        if (path === '/api/admin/users') return reply({ actor_id: adminId, users: [] });
        if (path === '/api/admin/projects') return reply({ projects: [{
            id: projectId, shop_id: shopId, name: 'Elysium Residence', status: 'active', location: null,
            district: null, description: null, shops: { name: shop.name }, members: 1,
            counts: { leads: state.viewings.length, units: units.length, contracts: 0 }, shares_shop: false,
        }], unassigned: [], diagnosticsError: null });
        if (path === '/api/dashboard/managers') return reply({ managers: [], mineName: 'Тест Админ' });
        if (path === '/api/dashboard/leads/projects') return reply({ projects: [{ id: projectId, name: 'Elysium Residence' }] });
        if (path === '/api/dashboard/viewings/options') return reply({ units, conditions: viewingPricing
            ? viewingPricing.rules.map(({ block, model, floor_min, floor_max, payment_condition }) => ({ block, model, floor_min, floor_max, payment_condition }))
            : elysiumViewingConditions(shop.name, units), reason: viewingPricing ? null : 'Нөхцөлөө сонгож хадгалж болно. Үнэ, урьдчилгааны дүн батлагдаагүй.' });
        if (path === '/api/dashboard/viewings/quote') {
            const selection = request.postDataJSON() as PricingSelection;
            state.quotes.push(selection);
            return reply(calculatePricing(viewingPricing, selection, '2026-10-08'));
        }
        if (path === '/api/dashboard/viewings') {
            if (request.method() === 'POST') {
                const input = request.postDataJSON() as CreateViewingInput;
                state.viewingWrites.push(input);
                const now = new Date().toISOString();
                const interests = (input.interests ?? []).map(selection => {
                    const result = calculatePricing(viewingPricing, selection, '2026-10-08');
                    return { ...selection, quote: result.available ? result.quote : null, quote_unavailable_reason: result.available ? null : result.reason };
                });
                state.viewings.push({ id: viewingId, scheduled_at: now, status: input.walk_in ? 'completed' : 'scheduled',
                    lead_id: leadId, property_id: null, customer_feedback: input.feedback ?? null, agent_notes: input.notes ?? null,
                    meeting_type: input.meeting_type, interest_level: input.interest_level ?? null,
                    completed_at: input.walk_in ? now : null, sales_manager_name: 'Тест Админ', property: null,
                    lead: { id: leadId, customer_name: input.customer_name ?? null, customer_phone: input.customer_phone ?? null, status: 'contacted' }, interests });
                return reply({ viewing: { id: viewingId }, lead_id: leadId });
            }
            return reply({ viewings: state.viewings, counts: { today: state.viewings.length, upcoming: 0, past: state.viewings.length } });
        }
        if (path === `/api/dashboard/viewings/${viewingId}` && request.method() === 'PATCH') {
            const patch = request.postDataJSON() as ViewingPatch;
            state.viewingWrites.push(patch);
            Object.assign(state.viewings[0], patch);
            return reply({ viewing: { id: viewingId } });
        }
        if (path === '/api/admin/sales-targets') {
            if (request.method() === 'POST') {
                const body = request.postDataJSON() as typeof state.monthlyWrites[number];
                state.monthlyWrites.push(body);
                if (state.monthlyConflict) return reply({ error: 'Өөр хэрэглэгч сарын мэдээллийг өөрчилсөн' }, 409);
                for (const { month, expectedRevision: _revision, ...values } of body.months) {
                    Object.assign(state.months[month - 1], values); state.months[month - 1].revision++;
                }
                return reply({ months: state.months });
            }
            return reply({ months: state.months, teamActual: [100, ...Array(11).fill(0)],
                computedActualSource: 'CRM-ийн гэрээ', managers: [], teamMembers: [], projects: [{ id: projectId, name: shop.name }] });
        }
        if (path === '/api/admin/pricing') {
            if (request.method() === 'PUT') {
                const body = request.postDataJSON() as PricingSaveInput;
                state.pricingWrites.push(body);
                state.latest = { ...body.config, id: configId, shop_id: shopId, version: (state.latest?.version ?? 0) + 1, status: body.status };
                if (body.status === 'active') state.active = state.latest;
                return reply({ config: state.latest });
            }
            return reply({ latest: state.latest, active: state.active });
        }
        state.unhandled.push(`${request.method()} ${path}`);
        return reply({ error: `Missing fixture ${path}` }, 501);
    });
    await page.goto('/auth/login');
    await page.getByLabel('Имэйл', { exact: true }).fill('onboarding-admin@example.invalid');
    await page.getByLabel('Нууц үг', { exact: true }).fill('onboarding-test-only');
    await page.getByRole('button', { name: 'Нэвтрэх', exact: true }).click();
    await expect(page).toHaveURL(/\/dashboard$/);
    return state;
}

async function chooseInterest(dialog: Locator, block: string, model: string, area: string, term: string, expectedQuote = true) {
    await dialog.getByLabel('Блок', { exact: true }).selectOption(block);
    await dialog.getByLabel('Загвар', { exact: true }).selectOption(model);
    await dialog.getByLabel('Талбай', { exact: true }).selectOption(area);
    await dialog.getByLabel('Давхар', { exact: true }).selectOption('2');
    await expect(dialog.getByLabel('Төлбөрийн нөхцөл', { exact: true })).toHaveValue('');
    await expect(dialog.getByLabel('Төлбөрийн нөхцөл', { exact: true })).toBeEnabled();
    await dialog.getByLabel('Төлбөрийн нөхцөл', { exact: true }).selectOption(term);
    if (expectedQuote) await expect(dialog.getByText('Нийт үнэ', { exact: true })).toBeVisible();
    else await expect(dialog.getByText('Баталсан үнийн тохиргоо байхгүй', { exact: true })).toBeVisible();
}

test('payment conditions remain selectable and persist without approved prices', async ({ page }, info) => {
    const state = await setup(page, false);
    await page.goto('/dashboard/viewings');
    await page.getByRole('button', { name: 'Уулзалт товлох', exact: true }).first().click();
    const dialog = page.getByRole('dialog', { name: 'Уулзалт товлох', exact: true });
    await dialog.getByRole('switch').click();
    await dialog.getByPlaceholder('Б. Болд', { exact: true }).fill('Сараа');
    await dialog.getByPlaceholder('9909 1122', { exact: true }).fill('99091122');
    await chooseInterest(dialog, 'Б1', 'E3', '80.32', '50%', false);
    const condition = dialog.getByLabel('Төлбөрийн нөхцөл', { exact: true });
    await expect(condition.locator('option')).toHaveText(['Сонгоогүй', '10-30%', '30%', '50%']);
    await dialog.getByRole('button', { name: 'Сонголт нэмэх', exact: true }).click();
    await chooseInterest(dialog, 'Б2', 'A', '57.23', '10-50%', false);
    await expect(condition.locator('option')).toHaveText(['Сонгоогүй', '10-30%', '30%', '10-50%', '50%']);
    await expect(dialog).toContainText('Нөхцөлөө сонгож хадгалж болно. Үнэ, урьдчилгааны дүн батлагдаагүй.');
    await expect(dialog.getByText('Нийт үнэ', { exact: true })).not.toBeVisible();
    await condition.scrollIntoViewIfNeeded();
    await page.screenshot({ path: info.outputPath('meeting-no-price-payment-condition.png'), fullPage: true });
    await dialog.getByRole('button', { name: 'Бүртгэх', exact: true }).click();
    await expect(dialog).not.toBeVisible();
    expect(state.viewingWrites).toHaveLength(1);
    const saved = state.viewingWrites[0] as CreateViewingInput;
    expect(saved.interests?.map(selection => selection.payment_condition)).toEqual(['50%', '10-50%']);
    expect(saved.interests?.every(selection => !('quote' in selection) && !('total_amount' in selection))).toBe(true);
    expect(state.viewings[0].interests?.map(selection => selection.quote)).toEqual([null, null]);
    await page.reload();
    await page.getByRole('button', { name: 'Сараа: уулзалт засах', exact: true }).click();
    const edit = page.getByRole('dialog', { name: 'Уулзалт засах', exact: true });
    await expect(edit).toContainText('Хадгалсан сонголт, үнийн санал');
    await expect(edit).toContainText('50%');
    await expect(edit).toContainText('10-50%');
    expect(state.viewings[0].interests?.map(selection => selection.payment_condition)).toEqual(['50%', '10-50%']);
    expect(state.errors).toEqual([]); expect(state.unhandled).toEqual([]);
});

test('walk-in meeting saves multiple interests and completed meeting notes preserve snapshots', async ({ page }, info) => {
    const state = await setup(page);
    await page.goto('/dashboard/viewings');
    await page.getByRole('button', { name: 'Уулзалт товлох', exact: true }).first().click();
    const dialog = page.getByRole('dialog', { name: 'Уулзалт товлох', exact: true });
    await dialog.getByRole('switch').click();
    await dialog.getByPlaceholder('Б. Болд', { exact: true }).fill('Сараа');
    await dialog.getByPlaceholder('9909 1122', { exact: true }).fill('99091122');
    await dialog.getByPlaceholder('Ойрхон амьдардаг, 12-р давхраас дээш сонирхож байна…').fill('Ойрхон амьдардаг');
    await chooseInterest(dialog, 'Б1', 'E3', '80.32', '50%');
    await expect(dialog).toContainText('321,280,000');
    await expect(dialog).toContainText('160,640,000');
    expect(state.viewingWrites).toHaveLength(0);
    await dialog.getByRole('button', { name: 'Сонголт нэмэх', exact: true }).click();
    await chooseInterest(dialog, 'Б2', 'A', '57.23', '30%');
    await expect(dialog).toContainText('171,690,000');
    await dialog.getByText('Нийт үнэ', { exact: true }).scrollIntoViewIfNeeded();
    await page.screenshot({ path: info.outputPath('meeting-selected-with-quote.png'), fullPage: true });
    await dialog.getByRole('button', { name: 'Бүртгэх', exact: true }).click();
    await expect(dialog).not.toBeVisible();
    expect(state.viewingWrites).toHaveLength(1);
    const saved = state.viewingWrites[0] as CreateViewingInput;
    expect(saved).toMatchObject({ project_id: projectId, walk_in: true, notes: 'Ойрхон амьдардаг' });
    expect(saved.interests).toHaveLength(2);
    expect(saved.interests?.map(selection => selection.block)).toEqual(['Б1', 'Б2']);
    expect(saved.interests?.every(selection => !('quote' in selection) && !('total_amount' in selection))).toBe(true);
    await page.getByRole('button', { name: 'Сараа: уулзалт засах', exact: true }).click();
    const edit = page.getByRole('dialog', { name: 'Уулзалт засах', exact: true });
    await expect(edit.getByLabel('Төлөв', { exact: true })).toHaveValue('completed');
    await expect(edit).toContainText('Хадгалсан сонголт, үнийн санал');
    await expect(edit).toContainText('321,280,000');
    await edit.getByLabel('Сэжим / тэмдэглэл', { exact: true }).fill('Ойрхон амьдардаг · дараа дахин ирнэ');
    await edit.getByRole('button', { name: 'Хадгалах', exact: true }).click();
    await expect(edit).not.toBeVisible();
    expect(state.viewingWrites[1]).toEqual({ agent_notes: 'Ойрхон амьдардаг · дараа дахин ирнэ' });
    expect(state.viewings[0].interests?.map(selection => selection.quote?.version)).toEqual([1, 1]);
    expect(state.errors).toEqual([]); expect(state.unhandled).toEqual([]);
});

test('monthly four fields preserve explicit zero and blank; stale save retains edits', async ({ page }, info) => {
    const state = await setup(page);
    await page.goto('/admin/sales-targets');
    const year = new Date().getFullYear();
    const contractPlan = page.getByLabel(`${year} оны 1-р сар Гэрээний төлөвлөгөө`, { exact: true });
    const cashPlan = page.getByLabel(`${year} оны 1-р сар Орсон мөнгөний төлөвлөгөө`, { exact: true });
    const contractActual = page.getByLabel(`${year} оны 1-р сар Гэрээний гүйцэтгэл`, { exact: true });
    const cashActual = page.getByLabel(`${year} оны 1-р сар Орсон мөнгөний гүйцэтгэл`, { exact: true });
    await contractPlan.fill('100000'); await cashPlan.fill('0'); await contractActual.fill('90000'); await cashActual.fill('');
    await page.getByRole('button', { name: 'Төлөвлөгөө, гүйцэтгэл хадгалах', exact: true }).click();
    await expect(contractPlan).toHaveValue('100,000'); await expect(cashPlan).toHaveValue('0');
    expect(state.monthlyWrites[0]).toEqual({ shopId, year, months: [{ month: 1, expectedRevision: 0,
        target_amount: 100000, cashflow_target_amount: 0, manual_contract_actual_amount: 90000, manual_cashflow_actual_amount: null }] });
    await page.reload();
    await expect(cashPlan).toHaveValue('0'); await expect(cashActual).toHaveValue('');
    await page.screenshot({ path: info.outputPath('monthly-four-fields-zero.png'), fullPage: true });
    state.monthlyConflict = true;
    await contractActual.fill('100001');
    await page.getByRole('button', { name: 'Төлөвлөгөө, гүйцэтгэл хадгалах', exact: true }).click();
    await expect(page.getByRole('alert').filter({ hasText: 'Таны засвар хадгалагдаагүй' })).toBeVisible();
    await expect(contractActual).toHaveValue('100001');
    await expect(page.getByRole('button', { name: 'Төлөвлөгөө, гүйцэтгэл хадгалах', exact: true })).toBeDisabled();
    expect(state.months[0].manual_contract_actual_amount).toBe(90000);
    expect(state.errors).toEqual([]); expect(state.unhandled).toEqual([]);
});

test('pricing dialog begins empty and requires review before activating versioned draft', async ({ page }, info) => {
    const state = await setup(page);
    await page.goto('/admin/projects');
    await page.getByRole('button', { name: 'Үнийн нөхцөл', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Elysium Residence · Үнийн нөхцөл', exact: true });
    await expect(dialog).toContainText('Баталсан үнийн мөр нэмнэ үү.');
    expect((await dialog.boundingBox())?.width).toBeGreaterThan(800);
    const activate = dialog.getByRole('button', { name: 'Баталсан үнийг идэвхжүүлэх', exact: true });
    await expect(activate).toBeDisabled();
    await dialog.getByLabel('Эх сурвалж', { exact: true }).fill('Баталсан үнэ 2026-10-08');
    await dialog.getByLabel('Эхлэх огноо', { exact: true }).fill('2026-10-01');
    await dialog.getByLabel('Дуусах огноо', { exact: true }).fill('2026-12-31');
    await dialog.getByRole('checkbox').check();
    await dialog.getByRole('button', { name: 'Үнийн мөр нэмэх', exact: true }).click();
    for (const [label, value] of [['Блок', 'Б1'], ['Загвар', 'E3'], ['Давхар эхлэх', '2'], ['Давхар дуусах', '8'],
        ['Нөхцөл', '50%'], ['м² үнэ (₮)', '4000000'], ['Эхний урьдчилгаа (%)', '50']]) {
        await dialog.getByLabel(`1-р мөр ${label}`, { exact: true }).fill(value);
    }
    await dialog.getByRole('button', { name: 'Ноорог хадгалах', exact: true }).click();
    await expect(dialog).toContainText('Засаж буй хувилбар: 1');
    expect(state.active).toBeNull(); expect(state.pricingWrites[0].status).toBe('draft');
    await expect(activate).toBeDisabled();
    await dialog.getByRole('button', { name: 'Идэвхжүүлэхийн өмнө хянах', exact: true }).click();
    await expect(activate).toBeEnabled();
    await page.screenshot({ path: info.outputPath('pricing-reviewed-dialog.png'), fullPage: true });
    await activate.click();
    await expect(dialog).toContainText('Идэвхтэй хувилбар 2: Баталсан үнэ 2026-10-08');
    expect(state.pricingWrites[1]).toMatchObject({ expected_version: 1, status: 'active' });
    expect(state.errors).toEqual([]); expect(state.unhandled).toEqual([]);
});

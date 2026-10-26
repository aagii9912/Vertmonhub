import { test, expect, type Page, type TestInfo } from '@playwright/test';
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROLE_PERMISSIONS } from '../src/lib/rbac';
import { CONTRACT_LIST_COLUMNS } from '../src/lib/contracts/list-format';
import { summarizeContracts, type ContractSummaryRow } from '../src/lib/contracts/summary';
import {
    contractListHasWork, parseContractList, planContractListImport, type ContractListContract, type ContractListCounts, type ContractListImportPlan, type ContractListUnit,
} from '../src/lib/contracts/list-import';
import { buildPlanPerformance, type PlanContract } from '../src/lib/sales/plan-performance';
import { emptyMonthlySales, monthlySalesWithBlockTotals, type MonthlySalesMonth } from '../src/lib/sales/monthly';
import { buildWorkbookBuffer, readWorkbookSheets } from '../src/lib/utils/xlsx';
import { formatMNTShort } from '../src/lib/utils/currency';
import { ubDateStr } from '../src/lib/utils/date';

/**
 * «Гэрээ» HUB загвар, «Excel импорт», «Төлөвлөгөөний биелэлт» — бодит Next хуудас, нэвтрэлт (fixture GoTrue);
 * бизнесийн API-г page.route дуурайна. Өгөгдөл зохиомол (нэр бодит биш) боловч Elysium-ийн HUB файлын хэлбэртэй:
 * Б1/Б2 орон сууц, дагавартай зогсоолын код («Б1-10 (01)» / «Б1-10 (B1)»), агуулах, цуцлагдаад дахин зарагдсан
 * байр, хаагдсан, огноогүй гэрээ, төлбөр хоцролт, өмнөх файлын хоцролт, HUB импортын мэдээлэл.
 * Импортын урьдчилсан харагдацыг бодит цэвэр задлагч/төлөвлөгчөөр (parseContractList → planContractListImport)
 * тест өөрөө үүсгэсэн .xlsx-ээс гаргана — сервисийн хариутай ижил хэлбэр. SQL/RPC-г тусад нь шалгадаг.
 *
 * Дэлгэцийн зураг: `E2E_SCREENS_DIR` өгвөл тэнд, эс бөгөөс тестийн output хавтсанд (бараан + цайвар тема).
 */

const adminId = '00000000-0000-4000-8000-000000000101';
const shopId = '00000000-0000-4000-8000-000000000210';
const projectId = '00000000-0000-4000-8000-000000000220';
const LATEST = '2026-10-20';
const STALE = '2026-10-01';
const cid = (n: number) => `50000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

type FixtureContract = ContractListContract & {
    floor: string | null; model: string | null; overdue_days: number | null; balance: number | null; customer_phone: string | null;
};
const contract = (n: number, fields: Partial<FixtureContract>): FixtureContract => ({
    id: cid(n), product_type: 'residential', unit_label: null, block_name: 'Б1', unit_number: null, legacy_unit_number: null,
    contract_status: 'active', order_date: null, contract_date: null, total_price: null, price_per_sqm: null, contracted_area: null,
    prepayment_condition: null, prepayment_due: null, payment_condition: null, overdue_amount: null, overdue_as_of: null,
    customer_name: null, customer_first_name: null, customer_last_name: null, contract_number: null, sales_manager: null,
    // ERP-ээс ирсэн гэрээ: төлсөн дүн, үлдэгдэл мэдэгдэхгүй (NULL) — «—», хэзээ ч 0₮ биш.
    paid_amount: null, balance: null, floor: null, model: null, overdue_days: null, customer_phone: null, ...fields,
});
const dated = (date: string) => ({ order_date: date, contract_date: date });
const holder = (first: string | null, last: string | null) => ({ customer_first_name: first, customer_last_name: last, customer_name: [first, last].filter(Boolean).join('.') || null });

const CONTRACTS: FixtureContract[] = [
    contract(1, { unit_label: 'Б1-16', legacy_unit_number: '16', unit_number: '0', floor: '05', model: 'E3', contracted_area: 80.32, prepayment_condition: '30%',
        price_per_sqm: 4_000_000, total_price: 321_280_000, prepayment_due: 96_384_000, overdue_amount: 12_500_000, overdue_as_of: LATEST,
        ...dated('2026-09-15'), ...holder('Сараа', 'Дорж'), payment_condition: 'Энгийн' }),
    contract(2, { block_name: 'Б2', unit_label: 'Б2-152', legacy_unit_number: '152', unit_number: '0', floor: '10', model: 'A', contracted_area: 57.23,
        prepayment_condition: '10-30%', price_per_sqm: 3_000_000, total_price: 171_690_000, prepayment_due: 17_169_000, overdue_amount: 0, overdue_as_of: LATEST,
        ...dated('2026-10-03'), ...holder('Тэмүүлэн', 'Болд'), payment_condition: 'Хөнгөлөлттэй' }),
    // Зогсоол: ERP М.кв үнийн оронд нэгжийн үнэ (price_per_sqm NULL → «Нийт дүн»-ээс, tooltip-тэй). Нэр салгаагүй (бүтэн нэр бүдэг).
    contract(3, { product_type: 'parking', unit_label: 'Б1-10 (01)', legacy_unit_number: '10', unit_number: '10', floor: '01', model: 'P', contracted_area: 12.5,
        prepayment_condition: '100%', total_price: 79_700_000, prepayment_due: 79_700_000, overdue_amount: 0, overdue_as_of: LATEST,
        ...dated('2026-08-20'), contract_status: 'closed', customer_name: 'Тест.Хэрэглэгч', payment_condition: 'Энгийн' }),
    contract(4, { product_type: 'parking', unit_label: 'Б1-10 (B1)', legacy_unit_number: '10', unit_number: '10', floor: 'B1', model: 'P', contracted_area: 12.5,
        prepayment_condition: '30%', total_price: 66_700_000, prepayment_due: 20_010_000, overdue_amount: 20_010_000, overdue_as_of: LATEST,
        ...dated('2026-09-02'), ...holder('Номин', 'Ганбат'), payment_condition: 'Энгийн' }),
    contract(5, { product_type: 'industry', unit_label: 'Б1-46 (H-1)', legacy_unit_number: '46', unit_number: '46', floor: '01', model: 'H-1', contracted_area: 6.4,
        prepayment_condition: '100%', total_price: 30_000_000, prepayment_due: 30_000_000, overdue_amount: 0, overdue_as_of: LATEST,
        ...dated('2026-07-11'), ...holder('Анар', 'Түвшин'), payment_condition: 'Энгийн' }),
    // Б2-231: цуцлагдаад дахин зарагдсан байр.
    contract(6, { block_name: 'Б2', unit_label: 'Б2-231', legacy_unit_number: '231', unit_number: '0', floor: '22', model: 'A', contracted_area: 58,
        prepayment_condition: '10-30%', price_per_sqm: 7_800_000, total_price: 452_400_000, prepayment_due: 135_720_000,
        ...dated('2026-06-10'), contract_status: 'cancelled', ...holder('Болор', 'Сүх'), payment_condition: 'Энгийн' }),
    contract(7, { block_name: 'Б2', unit_label: 'Б2-231', legacy_unit_number: '231', unit_number: '0', floor: '22', model: 'A', contracted_area: 58,
        prepayment_condition: '10-30%', price_per_sqm: 7_800_000, total_price: 452_400_000, prepayment_due: 135_720_000, overdue_amount: 0, overdue_as_of: LATEST,
        ...dated('2026-10-15'), ...holder('Мөнх', 'Эрдэнэ'), payment_condition: 'Энгийн' }),
    // Огноогүй, сүүлийн файлд байгаагүй (хоцролт нь өмнөх файлынх — нийлбэрт орохгүй).
    contract(8, { unit_label: 'Б1-31', legacy_unit_number: '31', unit_number: '0', floor: '03', model: 'A', contracted_area: 62.1, prepayment_condition: '30%',
        price_per_sqm: 4_830_917.87, total_price: 300_000_000, prepayment_due: 90_000_000, overdue_amount: 3_000_000, overdue_as_of: STALE,
        customer_name: 'Тест.Эзэн' }),
];

const UNITS: ContractListUnit[] = [
    { code: 'Б1-16', category: 'residential', block: 'Б1', floor: '05', model: 'E3', unit_number: '0', legacy_unit_number: '16', status: 'sold' },
    { code: 'Б2-152', category: 'residential', block: 'Б2', floor: '10', model: 'A', unit_number: '0', legacy_unit_number: '152', status: 'sold' },
    { code: 'Б1-10 (01)', category: 'parking', block: 'Б1', floor: '01', model: 'P', unit_number: '10', legacy_unit_number: '10', status: 'sold' },
    { code: 'Б1-10 (B1)', category: 'parking', block: 'Б1', floor: 'B1', model: 'P', unit_number: '10', legacy_unit_number: '10', status: 'sold' },
    { code: 'Б1-46 (H-1)', category: 'industry', block: 'Б1', floor: '01', model: 'H-1', unit_number: '46', legacy_unit_number: '46', status: 'sold' },
    { code: 'Б1-46 (H-2)', category: 'industry', block: 'Б1', floor: '01', model: 'H-2', unit_number: '46', legacy_unit_number: '46', status: 'available' },
    { code: 'Б2-231', category: 'residential', block: 'Б2', floor: '22', model: 'A', unit_number: '0', legacy_unit_number: '231', status: 'sold' },
    { code: 'Б1-31', category: 'residential', block: 'Б1', floor: '03', model: 'A', unit_number: '0', legacy_unit_number: '31', status: 'handed_over' },
    { code: 'Б1-19 (01)', category: 'parking', block: 'Б1', floor: '01', model: 'P', unit_number: '19', legacy_unit_number: '19', status: 'available' },
    { code: 'Б1-19 (B1)', category: 'parking', block: 'Б1', floor: 'B1', model: 'P', unit_number: '19', legacy_unit_number: '19', status: 'available' },
    { code: 'Б2-205', category: 'residential', block: 'Б2', floor: '20', model: 'B', unit_number: '0', legacy_unit_number: '205', status: 'reserved' },
];

// HUB файлын толгой (дагах зайтай) + импортлохгүй нэмэлт багана.
const FILE_HEADERS = ['Төрөл', 'Блок', 'Тоот', 'Давхар', 'Загвар', 'Гэрээлсэн талбай', 'Урьдчилгааны нөхцөл', 'М.кв үнэ', 'Нийт дүн',
    'Урьдчилгааны дүн', 'Төлбөр хоцролт', 'Захиалга өгсөн огноо', 'Төлөв', 'Нэр ', 'Овог ', 'Захиалгын нөхцөл', 'Банкны төлөв'];
const day = (iso: string) => { const [y, m, d] = iso.split('-').map(Number); return new Date(y, m - 1, d); };
const FILE_ROWS: unknown[][] = [
    [' Орон сууц', 'Б1', 16, '5', 'E3', 80.32, '30%', 4_000_000, 321_280_000, 96_384_000, 15_000_000, day('2026-09-15'), 'Гэрээ үүссэн', 'Сараа', 'Дорж', 'Энгийн', 'Зээлтэй'],
    ['Орон сууц', 'Б2', 152, '10', 'A', 57.23, '10-30%', 3_000_000, 171_690_000.00000001, 17_169_000, 0, day('2026-10-03'), 'Гэрээ үүссэн', 'Тэмүүлэн', 'Болд', 'Хөнгөлөлттэй', null],
    ['Зогсоол', 'Б1', 10, '1', 'P', 12.5, '100%', 79_700_000, 79_700_000, 79_700_000, 0, day('2026-08-20'), 'Гэрээ хаасан', 'Тест', 'Хэрэглэгч', 'Энгийн', null],
    ['Зогсоол', 'Б1', 10, 'B1', 'P', 12.5, '30%', 59_000_000, 59_000_000, 20_010_000, 20_010_000, day('2026-09-02'), 'Гэрээ үүссэн', 'Номин', 'Ганбат', 'Энгийн', null],
    ['Агуулах', 'Б1', 46, '1', 'H-1', 6.4, '100%', 30_000_000, 30_000_000, 30_000_000, -1.49e-8, day('2026-07-11'), 'Гэрээ үүссэн', 'Номин', 'Батаа', 'Энгийн', null],
    ['Орон сууц', 'Б2', 231, '22', 'A', 58, '10-30%', 7_800_000, 452_400_000, 135_720_000, 0, day('2026-06-10'), 'Цуцлагдсан', 'Болор', 'Сүх', 'Энгийн', null],
    ['Орон сууц', 'Б2', 231, '22', 'A', 58, '10-30%', 7_800_000, 452_400_000, 135_720_000, 0, day('2026-10-15'), 'Гэрээ үүссэн', 'Мөнх', 'Эрдэнэ', 'Энгийн', null],
    ['Орон сууц', 'Б2', 205, '20', 'B', 64.1, '30%', 7_500_000, 480_750_000, 144_225_000, 0, day('2026-10-18'), 'Гэрээ үүссэн', 'Хулан', 'Ганзориг', 'Энгийн', null],
    ['Зогсоол', 'Б1', 19, 'B1', 'P', 12.5, '30%', 66_700_000, 66_700_000, 20_010_000, 0, day('2026-05-02'), 'Цуцлагдсан', 'Отгон', 'Бат', 'Энгийн', null],
];
// Нэг байранд хоёр идэвхтэй мөр → «unit_taken» (батлах боломжгүй).
const BLOCKING_ROW = ['Орон сууц', 'Б1', 16, '5', 'E3', 80.32, '30%', 4_000_000, 321_280_000, 96_384_000, 0, day('2026-10-01'), 'Гэрээ үүссэн', 'Ариун', 'Төмөр', 'Энгийн', null];

/**
 * Chromium-ийн request interception multipart-ын файлын хэсгийн агуулгыг (blob) дамжуулдаггүй — нэр, төрөл л ирнэ.
 * Тиймээс тестийн үүсгэсэн файлыг нэрээр нь санаж, хөтчөөс агуулга ирээгүй бол түүгээр төлөвлөнө.
 */
const UPLOADS = new Map<string, ArrayBuffer>();
async function hubFile(info: TestInfo, name: string, rows: unknown[][]) {
    const buffer = await buildWorkbookBuffer([{ name: 'Sheet1', aoa: [FILE_HEADERS, ...rows] }]);
    const path = info.outputPath(name);
    writeFileSync(path, buffer);
    UPLOADS.set(name, buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength));
    return path;
}

/** Сервисийн preview хариутай ижил хэлбэр (`previewContractListImport`): бодит задлагч, төлөвлөгчөөр. */
type PreviewResult = { status: 400; body: Record<string, unknown>; plan: null; planHash: null }
    | { status: 200; body: Record<string, unknown>; plan: ContractListImportPlan; planHash: string };
async function previewBody(buffer: ArrayBuffer, fileName: string, reportDate: string): Promise<PreviewResult> {
    const parse = parseContractList(await readWorkbookSheets(buffer), { reportDate });
    if (!parse.found || parse.errors.length) return { status: 400, body: { error: parse.errors[0] ?? 'HUB загварын файл биш', errors: parse.errors }, plan: null, planHash: null };
    const plan = planContractListImport({
        rows: parse.rows, units: UNITS, contracts: CONTRACTS, transferredIds: new Set(), paymentContractIds: new Set(),
        latestImportDate: LATEST, reportDate, fileName,
    });
    if (plan.errors.length) return { status: 400, body: { error: `Файлд ${plan.errors.length} алдаа байна`, errors: plan.errors }, plan: null, planHash: null };
    const { ops, canonical, rows: _rows, summary: _summary, ...view } = plan;
    const planHash = createHash('sha256').update(canonical).digest('hex');
    return { status: 200, plan, planHash, body: {
        ...view, sheetName: parse.sheetName, rowCount: parse.rows.length, extraColumns: parse.extraColumns, ignoredColumns: parse.ignoredColumns,
        skipped: parse.skipped, latestImport: { report_date: LATEST }, planHash,
        opsCount: ops.length, canCommit: contractListHasWork(plan) && plan.blocking.length === 0,
    } };
}

/** Төлөвлөгөө: 9, 10-р сар блокоор (Б1/Б2/Зогсоол), 9-р сарын орсон мөнгийг гараар оруулсан. */
function planMonths(): MonthlySalesMonth[] {
    const months = emptyMonthlySales();
    const set = (month: number, block_amounts: MonthlySalesMonth['block_amounts']) => {
        months[month - 1] = monthlySalesWithBlockTotals({ ...months[month - 1], block_amounts });
    };
    set(9, {
        b1: { target_amount: 400_000_000, contract_count_target: 2, cashflow_target_amount: 150_000_000, manual_cashflow_actual_amount: 120_000_000 },
        b2: { target_amount: 200_000_000, contract_count_target: 1, cashflow_target_amount: 50_000_000, manual_cashflow_actual_amount: 30_000_000 },
        parking: { target_amount: 100_000_000, contract_count_target: 2, cashflow_target_amount: 50_000_000, manual_cashflow_actual_amount: 40_000_000 },
    });
    set(10, {
        b1: { target_amount: 500_000_000, contract_count_target: 2, cashflow_target_amount: 200_000_000 },
        b2: { target_amount: 400_000_000, contract_count_target: 2, cashflow_target_amount: 100_000_000 },
        parking: { target_amount: 100_000_000, contract_count_target: 1, cashflow_target_amount: 50_000_000 },
    });
    return months;
}

function planReport(year: number, finance: boolean) {
    const report = buildPlanPerformance({
        year, now: new Date('2026-10-22T12:00:00+08:00'), months: year === 2026 ? planMonths() : emptyMonthlySales(), planYears: [2026],
        contracts: CONTRACTS as unknown as PlanContract[], receipts: finance ? [] : null, ledgerSince: null, latestImportDate: LATEST,
    });
    return { ...report, shopName: 'Elysium Residence', ...(finance ? {} : { cashHidden: true }) };
}

const KNOWN_CONSOLE_NOISE = [
    /Download the React DevTools/,
    // Хүлээгдэж буй алдааны хариу (409 stale, 403) хөтчийн консолд «Failed to load resource» гэж бичигдэнэ.
    /Failed to load resource: the server responded with a status of (409|403)/,
    // Fixture GoTrue Supabase Realtime-ийг дуурайдаггүй (501) — хуудсууд realtime-гүйгээр ажиллана.
    /WebSocket connection to 'ws:\/\/127\.0\.0\.1:\d+\/realtime\/v1\/websocket/,
];

interface Options { role?: 'super_admin' | 'admin'; finance?: boolean }

async function setup(page: Page, { role = 'super_admin', finance = true }: Options = {}) {
    const shop = { id: shopId, name: 'Elysium Residence', setup_completed: true, is_active: true };
    const modules = ROLE_PERMISSIONS[role].modules.filter(module => finance || module !== 'finance');
    const state = {
        errors: [] as string[], console: [] as string[], unhandled: [] as string[],
        requests: [] as Array<{ path: string; search: string; method: string; shop?: string }>,
        previews: [] as Array<{ fileName: string; reportDate: string; type: string }>, commits: [] as Record<string, string>[],
        lastPreview: null as null | { planHash: string; counts: ContractListCounts },
        planYears: [] as number[],
    };
    page.on('pageerror', error => state.errors.push(error.message));
    page.on('console', message => {
        if (message.type() === 'error' && !KNOWN_CONSOLE_NOISE.some(pattern => pattern.test(message.text()))) state.console.push(message.text());
    });
    await page.route('**/api/**', async route => {
        const request = route.request(); const url = new URL(request.url()); const path = url.pathname;
        const reply = (json: unknown, status = 200) => route.fulfill({ json, status });
        if (path.startsWith('/api/auth/')) return route.continue();
        state.requests.push({ path, search: url.search, method: request.method(), shop: request.headers()['x-shop-id'] });
        if (path === '/api/me') return reply({ user: { fullName: 'Тест Админ' }, role, permissions: { ...ROLE_PERMISSIONS[role], modules }, shops: [shop] });
        if (path === '/api/user/shops') return reply({ shops: [shop] });
        if (path === '/api/dashboard/mode') return reply({ mode: 'org', managerName: null, isManager: false, canViewTeam: true });
        if (path === '/api/dashboard/director') return reply({ available: false });
        if (path === '/api/dashboard/nav-counts') return reply({ leads: 0, inbox: 0, meetings: 0 });
        if (path === '/api/dashboard/managers') return reply({ managers: [{ id: 'm-1', name: 'Чанцалдулам.Раднаа', is_active: true, project_ids: [projectId] }], mineName: null });
        if (path === '/api/dashboard/contracts' && request.method() === 'GET') {
            const sp = url.searchParams;
            const rows = CONTRACTS.filter(c => (sp.get('overdue') !== '1' || Number(c.overdue_amount) > 0 || Number(c.overdue_days) > 0)
                && (!sp.get('status') || c.contract_status === sp.get('status'))
                && (!sp.get('productType') || c.product_type === sp.get('productType'))
                && (!sp.get('block') || c.block_name === sp.get('block'))
                && (sp.get('undated') !== '1' || (!c.contract_date && c.contract_status !== 'cancelled'))
                && (sp.get('notInLatest') !== '1' || c.overdue_as_of !== LATEST)
                && (!sp.get('search') || [c.unit_label, c.customer_name, c.customer_first_name, c.customer_last_name].some(v => v?.includes(sp.get('search')!))));
            const sorted = [...rows].sort((a, b) => (b.contract_date ?? '').localeCompare(a.contract_date ?? '') || a.id.localeCompare(b.id));
            const distinct = (key: 'block_name' | 'payment_condition' | 'product_type') => [...new Set(CONTRACTS.map(c => c[key]).filter((v): v is string => !!v))].sort();
            const options = { latestImportDate: LATEST };
            return reply({
                contracts: sorted, stats: summarizeContracts(CONTRACTS as ContractSummaryRow[], options), footer: summarizeContracts(rows as ContractSummaryRow[], options),
                facets: { blocks: distinct('block_name'), paymentConditions: distinct('payment_condition'), productTypes: distinct('product_type') },
                latestImport: { report_date: LATEST, file_name: 'HUB data.xlsx', row_count: 7, not_in_file: CONTRACTS.filter(c => c.overdue_as_of !== LATEST).length },
                pagination: { page: 1, pageSize: 25, total: rows.length, totalPages: 1, hasMore: false },
            });
        }
        if (path === '/api/dashboard/contracts/import' && request.method() === 'GET') {
            return reply({ latest: { report_date: LATEST, file_name: 'HUB data.xlsx', row_count: 7, created_at: `${LATEST}T02:00:00Z`, created_by_name: 'Тест Админ' }, available: true });
        }
        if (path === '/api/dashboard/contracts/import' && request.method() === 'POST') {
            // multipart-ыг хөтчийн илгээснээр нь задална (Node-ийн Response.formData).
            const form = await new Response(new Uint8Array(request.postDataBuffer() ?? Buffer.alloc(0)), { headers: { 'content-type': request.headers()['content-type'] } }).formData();
            const file = form.get('file') as File;
            const reportDate = String(form.get('reportDate'));
            const sent = await file.arrayBuffer();
            const bytes = sent.byteLength ? sent : UPLOADS.get(file.name);
            if (!bytes) return reply({ error: `Unknown fixture upload ${file.name}` }, 400);
            const result = await previewBody(bytes, file.name, reportDate);
            if (form.get('action') === 'preview') {
                state.previews.push({ fileName: file.name, reportDate, type: file.type });
                if (result.plan) state.lastPreview = { planHash: result.planHash, counts: result.plan.counts };
                return reply(result.body, result.status);
            }
            const fields = Object.fromEntries([...form.entries()].filter(([key]) => key !== 'file').map(([key, value]) => [key, String(value)]));
            state.commits.push(fields);
            if (!result.plan || fields.planHash !== result.planHash) return reply({ error: 'Өгөгдөл өөрчлөгдсөн, дахин шалгана уу', code: 'stale_preview' }, 409);
            const counts = result.plan.counts;
            return reply({ ok: true, import_id: '60000000-0000-4000-8000-000000000001', inserted: counts.insert + counts.insertCancelled, updated: counts.update, replayed: false, reportDate }, 201);
        }
        if (path === '/api/dashboard/reports/plan-performance') {
            const year = Number(url.searchParams.get('year'));
            state.planYears.push(year);
            return reply(planReport(year, finance));
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

const screensDir = (info: TestInfo) => {
    const dir = process.env.E2E_SCREENS_DIR || info.outputPath('screens');
    mkdirSync(dir, { recursive: true });
    return dir;
};
async function shot(page: Page, info: TestInfo, name: string) {
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: join(screensDir(info), `${name}.png`), fullPage: true, animations: 'disabled' });
}
/** Хэрэглэгчийн профайл цэсний тема солигчоор (vh-theme) — хуудсыг дахин ачаалахгүй. */
async function setTheme(page: Page, theme: 'light' | 'dark') {
    if (await page.evaluate(() => document.documentElement.getAttribute('data-theme')) === theme) return;
    await page.getByRole('button', { name: /^Профайл:/ }).click();
    await page.getByRole('menuitem', { name: theme === 'light' ? 'Цайвар тема' : 'Бараан тема' }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
}
async function bothThemes(page: Page, info: TestInfo, name: string) {
    await setTheme(page, 'dark');
    await shot(page, info, `${name}-dark`);
    await setTheme(page, 'light');
    await shot(page, info, `${name}-light`);
    await setTheme(page, 'dark');
}
const noPageOverflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
/** StatBar-ын хавтан (гэрээ, импорт) эсвэл төлөвлөгөөний «Товч үзүүлэлт»-ийн хавтан — шошгоор. */
const tile = (page: Page, label: string) => page.locator('#workspace-content div.grid.gap-px > div, #workspace-content section[aria-label="Товч үзүүлэлт"] > div')
    .filter({ has: page.getByText(label, { exact: true }) });
const expectClean = (state: { errors: string[]; console: string[]; unhandled: string[] }) => {
    expect(state.errors).toEqual([]);
    expect(state.console).toEqual([]);
    expect(state.unhandled).toEqual([]);
};

for (const viewport of [{ width: 1440, height: 1000 }, { width: 1366, height: 800 }]) {
    test(`гэрээний HUB жагсаалт: 16 багана, хөл, хавтан, харагдац, хоцролт (${viewport.width}px)`, async ({ page }, info) => {
        await page.setViewportSize(viewport);
        const state = await setup(page);
        await page.goto('/dashboard/contracts');
        await expect(page.getByRole('heading', { name: 'Гэрээнүүд', exact: true })).toBeVisible();
        const workspace = page.locator('#workspace-content');
        const table = workspace.locator('table');
        await expect(table.getByRole('columnheader')).toHaveText([...CONTRACT_LIST_COLUMNS]);
        await expect(table.locator('tbody tr')).toHaveCount(CONTRACTS.length);
        await expect(workspace.getByText('Сүүлийн HUB файл:')).toContainText(`${LATEST} · 7 мөр · 2 гэрээ файлд байхгүй`);
        await expect(workspace.getByRole('link', { name: 'Excel импорт' })).toBeVisible();
        await expect(workspace.getByRole('link', { name: 'Төлөвлөгөөний биелэлт' })).toHaveAttribute('href', '/dashboard/reports/plan');

        // Хавтан: төслийн бүх гэрээ; цуцалсныг мөнгөн дүнд оруулахгүй, төлсөн дүн мэдэгдэхгүй тул төлөлтийн хавтан алга.
        const stats = summarizeContracts(CONTRACTS as ContractSummaryRow[], { latestImportDate: LATEST });
        expect(stats).toMatchObject({ total: 8, active: 6, closed: 1, cancelled: 1, total_sales: 1_421_770_000, prepayment_due: 468_983_000,
            overdue_amount: 32_510_000, overdue_count: 2, overdue_stale: 1, unknown_paid: 7, area: 289.05 });
        await expect(tile(page, 'Нийт гэрээ')).toContainText('8');
        await expect(tile(page, 'Нийт гэрээ')).toContainText('6 идэвхтэй · 1 хаагдсан · 1 цуцалсан');
        await expect(tile(page, 'Нийт дүн')).toContainText(formatMNTShort(1_421_770_000));
        await expect(tile(page, 'Нийт дүн')).toContainText('Цуцалсан 1 гэрээ хассан');
        await expect(tile(page, 'Төлөх урьдчилгаа')).toContainText(formatMNTShort(468_983_000));
        await expect(tile(page, 'Төлөх урьдчилгаа')).toContainText('Гэрээний нөхцлөөр · орсон мөнгө биш');
        const overdueTile = tile(page, 'Төлбөр хоцролт');
        await expect(overdueTile).toContainText(formatMNTShort(32_510_000));
        await expect(overdueTile).toContainText(`2 гэрээ · ${LATEST}-ны файлаар · 1 гэрээний хоцролт өмнөх файлынх`);
        await expect(overdueTile.locator('.text-status-danger').first()).toBeVisible();
        await expect(page.getByText('Гэрээнд бүртгэсэн төлөлт', { exact: true })).toHaveCount(0);

        // Мөрүүд: дагавартай зогсоолын «Тоот» = 10, давхар «1» / «B1», нэгжийн үнэ tooltip-тэй, огноогүйд «—».
        const parking = table.locator('tbody tr').filter({ hasText: '79,700,000' });
        await expect(parking.locator('td').nth(0)).toHaveText('Зогсоол');
        await expect(parking.locator('td').nth(2)).toHaveText('10');
        await expect(parking.locator('td').nth(3)).toHaveText('1');
        await expect(parking.locator('td').nth(7).locator('span[title="Нэгжийн үнэ (ERP-ийн загвараар)"]')).toHaveText('79,700,000');
        await expect(parking.locator('td').nth(12)).toHaveText('Гэрээ хаасан');
        await expect(parking.locator('td').nth(13).locator('span[title="Нэр, овог салгаагүй — бүтэн нэр"]')).toHaveText('Тест.Хэрэглэгч');
        const undated = table.locator('tbody tr').filter({ hasText: 'Тест.Эзэн' });
        await expect(undated.locator('td').nth(11)).toHaveText('—');
        await expect(undated.locator('td').nth(10).locator('span[title$="сүүлийн файлд байхгүй"]')).toHaveText('3,000,000');
        const overdue = table.locator('tbody tr').filter({ hasText: 'Дорж' });
        await expect(overdue.locator('td').nth(10).locator('.text-status-danger')).toHaveText('12,500,000');
        await expect(table.locator('tbody tr').filter({ hasText: 'Болор' }).locator('td').nth(12)).toHaveText('Цуцлагдсан');

        // Хөл: шүүсэн гэрээний нийлбэр (талбай, Нийт дүн, Урьдчилгааны дүн, Төлбөр хоцролт).
        const footer = table.locator('tfoot tr td');
        await expect(footer.nth(0)).toHaveText('Нийт · 8 гэрээ');
        await expect(footer.nth(2)).toHaveText('289.05');
        await expect(footer.nth(4)).toHaveText('1,421,770,000');
        await expect(footer.nth(5)).toHaveText('468,983,000');
        await expect(footer.nth(6)).toHaveText('32,510,000');

        // Хэвтээ гүйлт зөвхөн хүснэгтийн хайрцган дотор.
        expect(await noPageOverflow(page)).toBe(true);
        const box = table.locator('xpath=..');
        expect(await box.evaluate(el => el.scrollWidth > el.clientWidth)).toBe(true);
        expect(await box.evaluate(el => getComputedStyle(el).overflowX)).toBe('auto');
        // Наалттай толгой тунгалаг биш.
        expect(await table.locator('thead th').first().evaluate(el => getComputedStyle(el).backgroundColor)).not.toMatch(/rgba\(.+, 0\)|transparent/);
        if (viewport.width === 1440) await bothThemes(page, info, 'contracts-hub');

        // «Төлбөр, менежер»: Төлсөн, Үлдэгдэл мэдэгдэхгүй тул «—», хөлд ч «—» (0₮ биш).
        await page.getByRole('button', { name: 'Төлбөр, менежер', exact: true }).click();
        await expect(page.getByRole('button', { name: 'Төлбөр, менежер', exact: true })).toHaveAttribute('aria-pressed', 'true');
        await expect(table.getByRole('columnheader')).toHaveText(['Гэрээ', 'Харилцагч', 'Блок / Тоот', 'Нийт үнэ', 'Төлсөн', 'Үлдэгдэл', 'Менежер', 'Төлөв']);
        const paidCells = table.locator('tbody tr td:nth-child(5)');
        await expect(paidCells).toHaveCount(CONTRACTS.length);
        for (const text of await paidCells.allInnerTexts()) expect(text.trim()).toBe('—');
        await expect(table.locator('tfoot tr td').nth(2)).toHaveText('—');
        await expect(table.locator('tfoot tr td').nth(3)).toHaveText('—');
        expect(await noPageOverflow(page)).toBe(true);
        expect(await page.evaluate(() => localStorage.getItem('vh-contracts-view'))).toBe('payments');
        if (viewport.width === 1440) await shot(page, info, 'contracts-payments-dark');

        // «Хоцролттой»: ₮ хоцролттой гэрээ (өмнөх файлынх ч) — хөл шүүлтийн нийлбэр.
        await page.getByRole('button', { name: 'HUB загвар', exact: true }).click();
        await page.getByRole('button', { name: 'Хоцролттой', exact: true }).click();
        await expect(page.getByRole('button', { name: 'Хоцролттой', exact: true })).toHaveAttribute('aria-pressed', 'true');
        await expect.poll(() => state.requests.some(r => r.path === '/api/dashboard/contracts' && r.search.includes('overdue=1'))).toBe(true);
        await expect(table.locator('tbody tr')).toHaveCount(3);
        await expect(table.locator('tfoot tr td').nth(0)).toHaveText('Нийт · 3 гэрээ');
        await expect(table.locator('tfoot tr td').nth(6)).toHaveText('32,510,000');
        await expect(table.getByText('Тэмүүлэн', { exact: true })).toHaveCount(0);
        // Хавтан шүүлтгүй хэвээр.
        await expect(tile(page, 'Нийт гэрээ')).toContainText('6 идэвхтэй · 1 хаагдсан · 1 цуцалсан');
        expect(state.requests.filter(r => r.path === '/api/dashboard/contracts').every(r => r.shop === shopId)).toBe(true);
        expectClean(state);
    });
}

test('гэрээний Excel импорт: файл → шалгах (тоо, шалгах, батлах боломжгүй) → хадгалсан', async ({ page }, info) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    const state = await setup(page);
    await page.goto('/dashboard/contracts/import');
    await expect(page.getByRole('heading', { name: 'Гэрээний Excel импорт', exact: true })).toBeVisible();
    await expect(page.getByText(/Сүүлийн импорт:/)).toContainText(`${LATEST} · HUB data.xlsx · 7 мөр`);
    const today = ubDateStr();
    await expect(page.getByLabel('Файлын огноо', { exact: true })).toHaveValue(today);
    const check = page.getByRole('button', { name: 'Файл шалгах', exact: true });
    await expect(check).toBeDisabled();
    // Файл сонгох талбар хүрээтэй (Preflight товчийг цэвэрлэсэн ч сонгох газар харагдана).
    expect(await page.getByLabel('Файл', { exact: true }).evaluate(el => getComputedStyle(el).borderTopWidth)).not.toBe('0px');
    await shot(page, info, 'contracts-import-file-dark');

    // 1) Нэг байранд хоёр идэвхтэй мөр — батлах боломжгүй.
    await page.getByLabel('Файл', { exact: true }).setInputFiles(await hubFile(info, 'HUB-blocking.xlsx', [...FILE_ROWS, BLOCKING_ROW]));
    await check.click();
    await expect(page.getByText('Файлын нийлбэр', { exact: true })).toBeVisible();
    const blocked = page.getByRole('alert').filter({ hasText: 'Батлах боломжгүй' });
    await expect(blocked).toBeVisible();
    await expect(blocked).toContainText('Б1-16');
    await expect(page.getByRole('button', { name: 'Батлах', exact: true })).toBeDisabled();
    expect(state.previews.at(-1)).toEqual({ fileName: 'HUB-blocking.xlsx', reportDate: today, type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    await shot(page, info, 'contracts-import-blocking-dark');
    await page.getByRole('button', { name: 'Болих', exact: true }).click();

    // 2) Зөв файл: тоо, файлын нийлбэр, шалгах шаардлагатай, шинэ, файлд байхгүй, байрны төлөв, мэдээлэл, импортлохгүй багана.
    await page.getByLabel('Файл', { exact: true }).setInputFiles(await hubFile(info, 'HUB data.xlsx', FILE_ROWS));
    await page.getByRole('button', { name: 'Файл шалгах', exact: true }).click();
    await expect(page.getByText('Файлын нийлбэр', { exact: true })).toBeVisible();
    const preview = state.lastPreview!;
    expect(preview.counts).toMatchObject({ insert: 1, insertCancelled: 1, review: 1, blocking: 0, missing: 1 });
    await expect(page.getByText(/HUB data\.xlsx · 9 мөр · 16 багана танигдлаа/)).toBeVisible();
    await expect(tile(page, 'Шинэ гэрээ')).toContainText('2');
    await expect(tile(page, 'Шинэ гэрээ')).toContainText('1 идэвхтэй · 1 цуцлагдсан');
    await expect(tile(page, 'Шинэчлэгдэх')).toContainText(String(preview.counts.update));
    await expect(tile(page, 'Шалгах')).toContainText('1');
    await expect(tile(page, 'Файлд байхгүй')).toContainText('1 нь огноогүй');
    await expect(tile(page, 'Байрны төлөв зөрүүтэй')).toContainText('1');
    const totals = page.locator('section, div').filter({ has: page.getByText('Файлын нийлбэр', { exact: true }) }).locator('table').first();
    await expect(totals.locator('tbody tr').filter({ hasText: 'Гэрээ үүссэн' })).toContainText('1,515,120,000');
    await expect(totals.locator('tbody tr').filter({ hasText: 'Гэрээ үүссэн' })).toContainText('35,010,000');
    await expect(page.getByText('Нийт дүн 66,700,000 → 59,000,000', { exact: false })).toBeVisible();
    await expect(page.getByText('Шинэ гэрээ', { exact: true }).last()).toBeVisible();
    await expect(page.getByRole('cell', { name: 'Б2-205', exact: true }).first()).toBeVisible();
    await expect(page.getByText('Файлд байхгүй — өөрчлөхгүй', { exact: true })).toBeVisible();
    await expect(page.getByRole('cell', { name: 'Б1-31', exact: true })).toBeVisible();
    await expect(page.getByText('Байрны төлөв зөрүүтэй — импорт байрны төлөвийг өөрчлөхгүй', { exact: true })).toBeVisible();
    await expect(page.getByRole('cell', { name: 'Агуулах Б1-46 (H-1)', exact: true })).toBeVisible();
    await expect(page.getByText('Импортлохгүй багана: Банкны төлөв', { exact: true })).toBeVisible();
    await expect(page.getByText('Төлсөн дүн, үлдэгдлийг энэ импорт өөрчлөхгүй.', { exact: true })).toBeVisible();
    expect(await noPageOverflow(page)).toBe(true);

    // Шалгах шаардлагатай өөрчлөлтийг баталгаажуулах хүртэл «Батлах» идэвхгүй.
    const confirm = page.getByRole('button', { name: 'Батлах', exact: true });
    await expect(confirm).toBeDisabled();
    const reviewed = page.getByRole('checkbox', { name: 'Дүн, төлөв өөрчлөгдөх гэрээг шалгасан' });
    await reviewed.click();
    await expect(confirm).toBeEnabled();
    await reviewed.click();
    await expect(confirm).toBeDisabled();
    await reviewed.click();
    await bothThemes(page, info, 'contracts-import-review');
    expect(state.commits).toEqual([]);

    await confirm.click();
    const dialog = page.getByRole('dialog', { name: 'Импортыг батлах уу?' });
    await expect(dialog).toContainText(`2 шинэ гэрээ, ${preview.counts.update} гэрээний шинэчлэл хадгалагдана. Төлсөн дүн, үлдэгдэл өөрчлөгдөхгүй.`);
    await dialog.getByRole('button', { name: 'Батлах', exact: true }).click();

    // 3) Хадгалсан.
    await expect(page.getByText('Хадгалсан', { exact: true }).last()).toBeVisible();
    await expect(page.getByText(`2 шинэ · ${preview.counts.update} шинэчилсэн · ${preview.counts.unchanged} хэвээр · ${today}-ны файл`, { exact: false })).toBeVisible();
    expect(state.commits).toHaveLength(1);
    expect(state.commits[0]).toMatchObject({ action: 'commit', reportDate: today, planHash: preview.planHash, acceptReview: 'true', allowOlder: 'false' });
    expect(state.commits[0].requestId).toMatch(/^[0-9a-f-]{36}$/);
    const ws = page.locator('#workspace-content');
    await expect(ws.getByRole('link', { name: 'Гэрээ харах' })).toHaveAttribute('href', '/dashboard/contracts');
    await expect(ws.getByRole('link', { name: 'Огноогүй 1 гэрээ' })).toHaveAttribute('href', '/dashboard/contracts?filter=undated');
    await expect(ws.getByRole('link', { name: 'Төлөвлөгөөний биелэлт' })).toHaveAttribute('href', '/dashboard/reports/plan');
    await expect(ws.getByRole('link', { name: 'Өөрчлөлтийн түүх' })).toHaveAttribute('href', '/admin/history');
    await bothThemes(page, info, 'contracts-import-done');
    expect(state.requests.filter(r => r.path === '/api/dashboard/contracts/import').every(r => r.shop === shopId)).toBe(true);
    expectClean(state);
});

test('төлөвлөгөөний биелэлт: төлөвлөгөө / гүйцэтгэл / %, «+» доод хязгаар, төлөвлөгөөгүй мөр, санхүүтэй бол мөнгөн урсгал', async ({ page }, info) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    const state = await setup(page);
    await page.goto('/dashboard/reports/plan');
    await expect(page.getByRole('heading', { name: 'Төлөвлөгөөний биелэлт', exact: true })).toBeVisible();
    const contracts = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Гэрээ · Нийт' }) });
    const table = contracts.locator('table');
    await expect(table.getByRole('columnheader', { name: 'Гэрээний тоо', exact: true })).toHaveAttribute('colspan', '3');
    await expect(table.getByRole('columnheader', { name: 'Гэрээний дүн', exact: true })).toHaveAttribute('colspan', '3');
    const month = (n: number) => table.locator('tbody tr').filter({ has: page.getByRole('rowheader', { name: new RegExp(`^${n}-р сар`) }) });

    // 9-р сар: Б1-д огноогүй гэрээ байгаа тул системийн дүн доод хязгаар «+»; 387,980,000 / 700,000,000 = 55.4%.
    const sep = month(9).locator('td');
    await expect(sep.nth(0)).toHaveText('5');
    await expect(sep.nth(1)).toHaveText('2+*');
    await expect(sep.nth(2)).toHaveText('40%+');
    await expect(sep.nth(3)).toHaveText('700,000,000');
    await expect(sep.nth(4)).toHaveText('387,980,000+*');
    await expect(sep.nth(5)).toHaveText('55.4%+');
    // Нөхцлөөр төлөх урьдчилгаа ч доод хязгаар: огноогүй Б1 гэрээ 9-р сарынх байж болно.
    await expect(sep.nth(6)).toHaveText('116,394,000+');
    // 10-р сар (явцын): Б1-д энэ сард гэрээгүй + огноогүй → тодорхойгүй, нийт нь Б2 + Зогсоолын доод хязгаар.
    await expect(month(10).getByRole('rowheader')).toContainText('явцын');
    await expect(month(10).locator('td').nth(4)).toHaveText('624,090,000+*');
    await expect(month(10).locator('td').nth(5)).toHaveText('62.4%+');
    // Төлөвлөгөөгүй сар: хувь «—»; ирээдүйн сар гүйцэтгэлгүй.
    await expect(month(8).locator('td').nth(4)).toHaveText('79,700,000+*');
    await expect(month(8).locator('td').nth(5)).toHaveText('—');
    await expect(month(12).locator('td').nth(4)).toHaveText('—');
    // Төлөвлөгөө оруулаагүй нүд бусад тодорхойгүйтэй адил бүдэг «—».
    await expect(month(1).locator('td').nth(0).locator('span.text-muted-foreground')).toHaveText('—');
    await expect(table.locator('tfoot tr').filter({ hasText: 'Он эхнээс (1–10 сар)' })).toBeVisible();
    await expect(table.locator('tfoot tr').filter({ hasText: 'Төлөвлөгөөгүй' })).toContainText('Агуулах — 1 гэрээ · 30,000,000');
    await expect(page.getByText(/Огноогүй 1 гэрээ сарын гүйцэтгэлд ороогүй/)).toBeVisible();
    await expect(page.getByRole('link', { name: 'Гэрээний жагсаалтаас харах' })).toHaveAttribute('href', '/dashboard/contracts?filter=undated');
    await expect(contracts).toContainText('Энэ онд цуцлагдсан: 1 гэрээ · 452,400,000');
    await expect(tile(page, 'Төлбөр хоцролт')).toContainText(`2 гэрээ · ${LATEST}-ны файлаар · 1 хуучирсан`);

    // Блокоор: Б2 10-р сар 624,090,000 / 400,000,000 = 156% (алтан — биелсэн).
    await page.getByRole('group', { name: 'Блок' }).getByRole('button', { name: 'Б2', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Гэрээ · Б2' })).toBeVisible();
    const b2 = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Гэрээ · Б2' }) }).locator('table');
    const b2Oct = b2.locator('tbody tr').filter({ has: page.getByRole('rowheader', { name: /^10-р сар/ }) }).locator('td');
    await expect(b2Oct.nth(4)).toHaveText('624,090,000*');
    await expect(b2Oct.nth(5)).toHaveText('156%');
    await expect(b2Oct.nth(5).locator('span')).toHaveClass(/text-gold/);
    // Б2-т огноогүй гэрээгүй — урьдчилгаа бүрэн дүн («+»-гүй).
    await expect(b2Oct.nth(6)).toHaveText(/^[\d,]+$/);
    await page.getByRole('group', { name: 'Блок' }).getByRole('button', { name: 'Нийт', exact: true }).click();

    // Санхүүтэй (super_admin): мөнгөн урсгал — 9-р сар гараар 190,000,000 / 250,000,000 = 76%.
    const cash = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Мөнгөн урсгал · Нийт' }) });
    await expect(cash).toBeVisible();
    // HUB-д төлсөн дүн алга, харин 9-р сард гараар оруулсан дүн бий — «бүртгэгдээгүй» биш (c9e92d6f).
    await expect(cash.getByText('Зөвхөн гараар оруулсан орсон мөнгө', { exact: true })).toBeVisible();
    await expect(cash.getByText('Орсон мөнгө бүртгэгдээгүй', { exact: true })).toHaveCount(0);
    // Гэрээний хүснэгттэй адил «Жилийн төлөвлөгөөнөөс» мөр.
    await expect(cash.getByRole('rowheader', { name: 'Жилийн төлөвлөгөөнөөс' })).toBeVisible();
    const cashSep = cash.locator('tbody tr').filter({ has: page.getByRole('rowheader', { name: '9-р сар', exact: true }) }).locator('td');
    await expect(cashSep.nth(0)).toHaveText('250,000,000');
    await expect(cashSep.nth(1)).toHaveText('190,000,000');
    await expect(cashSep.nth(2)).toHaveText('76%');
    await expect(tile(page, 'Орсон мөнгө (он эхнээс)')).toBeVisible();
    expect(await noPageOverflow(page)).toBe(true);
    expect(state.planYears).toContain(2026);
    await bothThemes(page, info, 'plan-performance-finance');
    expectClean(state);
});

test('төлөвлөгөөний биелэлт: санхүүгийн эрхгүй бол мөнгөн урсгал харагдахгүй', async ({ page }, info) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    const state = await setup(page, { role: 'admin', finance: false });
    await page.goto('/dashboard/reports/plan');
    await expect(page.getByRole('heading', { name: 'Гэрээ · Нийт' })).toBeVisible();
    await expect(page.getByRole('heading', { name: /Мөнгөн урсгал/ })).toHaveCount(0);
    await expect(tile(page, 'Орсон мөнгө')).toContainText('Санхүүгийн эрх шаардлагатай');
    // Хавтангийн тайлбар ба мөнгөн урсгалын хүснэгтийн оронд — хоёуланд нь ижил өгүүлбэр.
    await expect(page.getByText('Мөнгөн урсгалыг санхүүгийн эрхтэй ажилтан харна.', { exact: true })).toHaveCount(2);
    await expect(page.getByText('190,000,000')).toHaveCount(0);
    await expect(page.getByText('Орсон мөнгө (он эхнээс)', { exact: true })).toHaveCount(0);
    expect(await noPageOverflow(page)).toBe(true);
    await shot(page, info, 'plan-performance-no-finance-dark');
    expectClean(state);
});

test('гэрээний хуудас: «Цуцлах» баталгаажуулалт → цуцалсан төлөв → «Сэргээх» (байрны зөрчил 409)', async ({ page }, info) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    const state = await setup(page);
    // Огноогүй хуучин гэрээ (Лхагвын тайлангийн «Огноогүй» жагсаалт — шалгаад огноо оруулах эсвэл цуцлах).
    const id = cid(8);
    let current: FixtureContract = { ...CONTRACTS.find(c => c.id === id)! };
    const patches: Array<{ body: unknown; shop?: string }> = [];
    let refuseRestore = true;
    // setup-ийн дараа бүртгэсэн тул түрүүлж шалгагдана; бусад замыг setup-ийн handler руу дамжуулна.
    await page.route(url => url.pathname.startsWith(`/api/dashboard/contracts/${id}`)
        || url.pathname === '/api/dashboard/referral-sources' || url.pathname === '/api/dashboard/ai-attachments', async route => {
        const request = route.request(); const url = new URL(request.url()); const path = url.pathname;
        const reply = (json: unknown, status = 200) => route.fulfill({ json, status });
        state.requests.push({ path, search: url.search, method: request.method(), shop: request.headers()['x-shop-id'] });
        if (path === '/api/dashboard/referral-sources') return reply({ sources: [], available: true });
        if (path === '/api/dashboard/ai-attachments') return reply({ attachments: [] });
        if (path === `/api/dashboard/contracts/${id}/payments`) return reply({ payments: [] });
        if (path === `/api/dashboard/contracts/${id}/transfer`) return reply({ transfers: [], available: true });
        if (path === `/api/dashboard/contracts/${id}` && request.method() === 'GET') return reply({ contract: current });
        if (path === `/api/dashboard/contracts/${id}` && request.method() === 'PATCH') {
            const body = request.postDataJSON() as { contract_status: string };
            patches.push({ body, shop: request.headers()['x-shop-id'] });
            // Сервисийн дүрэм: байранд өөр идэвхтэй гэрээ байвал сэргээхгүй (эхний оролдлого).
            if (body.contract_status === 'active' && refuseRestore) {
                refuseRestore = false;
                return reply({ error: '«Б1-31» байранд өөр идэвхтэй гэрээ байна — нэг байранд хоёр идэвхтэй гэрээ үүсгэхгүй. Тэр гэрээг шалгаад дахин оролдоно уу.' }, 409);
            }
            current = { ...current, contract_status: body.contract_status };
            return reply({ contract: current });
        }
        return route.fallback();
    });

    await page.goto(`/dashboard/contracts/${id}`);
    const workspace = page.locator('#workspace-content');
    await expect(workspace.getByText('Б1-31', { exact: true })).toBeVisible();
    await expect(workspace.getByText('Идэвхтэй', { exact: true })).toBeVisible();
    const cancel = workspace.getByRole('button', { name: 'Цуцлах', exact: true });

    // 1) Цонх юу болохыг хэлнэ; «Болих» бол юу ч илгээхгүй.
    await cancel.click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByRole('heading', { name: '«Б1-31» гэрээг цуцлах уу?' })).toBeVisible();
    await expect(dialog).toContainText('«Гэрээтэй»-гээс зөвхөн HUB гэрээний жагсаалтын сүүлийн импорт ERP бүтээгдэхүүний экспортоос шинэ');
    await expect(dialog).toContainText('Бүртгэсэн төлбөр, төлбөрийн график устахгүй');
    await expect(dialog).toContainText('«Сэргээх»-ээр «Идэвхтэй» төлөвт буцаана');
    await expect(dialog).toContainText('Байрны төлөв, холбоотой лидийн төлөв энэ үйлдлээр өөрчлөгдөхгүй');
    await expect(dialog.getByRole('button', { name: 'Гэрээг цуцлах', exact: true })).toHaveClass(/bg-destructive/);
    await shot(page, info, 'contract-cancel-dialog-dark');
    await dialog.getByRole('button', { name: 'Болих', exact: true }).click();
    await expect(dialog).toBeHidden();
    expect(patches).toEqual([]);

    // 2) Цуцлах: PATCH contract_status, toast, цуцалсан төлөв тод, «Сэргээх».
    await cancel.click();
    await dialog.getByRole('button', { name: 'Гэрээг цуцлах', exact: true }).click();
    await expect(page.getByText('Гэрээ цуцлагдлаа', { exact: true })).toBeVisible();
    await expect(dialog).toBeHidden();
    expect(patches).toEqual([{ body: { contract_status: 'cancelled' }, shop: shopId }]);
    const banner = workspace.getByRole('status').filter({ hasText: 'Энэ гэрээ цуцлагдсан' });
    await expect(banner).toBeVisible();
    await expect(workspace.getByText('Цуцалсан', { exact: true })).toBeVisible();
    await expect(workspace.getByRole('button', { name: 'Цуцлах', exact: true })).toHaveCount(0);
    const restore = workspace.getByRole('button', { name: 'Сэргээх', exact: true });
    await expect(restore).toBeVisible();
    expect(await noPageOverflow(page)).toBe(true);
    await bothThemes(page, info, 'contract-cancelled');

    // 3) Сэргээх: серверийн 409-ийг цонхонд харуулж нээлттэй үлдээнэ, дахин оролдоход сэргээнэ.
    await restore.click();
    await expect(dialog.getByRole('heading', { name: '«Б1-31» гэрээг сэргээх үү?' })).toBeVisible();
    await dialog.getByRole('button', { name: 'Сэргээх', exact: true }).click();
    await expect(dialog.getByRole('alert')).toContainText('байранд өөр идэвхтэй гэрээ байна');
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: 'Сэргээх', exact: true }).click();
    await expect(page.getByText('Гэрээ сэргээгдлээ', { exact: true })).toBeVisible();
    await expect(dialog).toBeHidden();
    await expect(banner).toHaveCount(0);
    await expect(workspace.getByRole('button', { name: 'Цуцлах', exact: true })).toBeVisible();
    expect(patches.map(p => p.body)).toEqual([{ contract_status: 'cancelled' }, { contract_status: 'active' }, { contract_status: 'active' }]);
    expect(patches.every(p => p.shop === shopId)).toBe(true);
    expectClean(state);
});

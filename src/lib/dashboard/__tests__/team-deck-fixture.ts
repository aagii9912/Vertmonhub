/**
 * Багийн загварын илтгэлийн (team-deck) тестийн өгөгдөл — Elysium-ийн 2026-10-21-ний хурлын бодит дүнтэй ойролцоо:
 * 10-р сарын Б2 төлөвлөгөө 2,245,776,000 / гүйцэтгэл 2,195,395,000 (98%), мөнгөн урсгал гар/дэвтэр холимог.
 */
import { buildPlanPerformance, type PlanContract } from '@/lib/sales/plan-performance';
import { emptyMonthlySales, type MonthlySalesMonth } from '@/lib/sales/monthly';
import type { ErpProduct } from '@/lib/erp/records';
import { buildWeeklySales, type ContractLine } from '../weekly-sales';
import { activityBuckets, ACTIVITY_METRICS, type ActivityMetric, type SalesActivityReport } from '../sales-activity';
import { meetingDetailWeeks, type MeetingDetailsReport } from '../meeting-details';
import type { NegotiationsReport } from '../negotiations';
import type { WeeklySlide } from '../weekly-slides';
import type { DeckImage } from '../weekly-deck';
import type { TeamDeckInput, TeamPlanReport } from '../team-deck';

export const meetingDate = '2026-10-21';
export const range = { from: '2026-10-14', to: '2026-10-20' };
const shop = '00000000-0000-4000-8000-000000000001';
const user = '00000000-0000-4000-8000-000000000002';
export const media = (n: number) => `${shop}/${user}/00000000-0000-4000-8000-0000000000${String(n).padStart(2, '0')}.png`;
export const brandingPath = (n: number) => `branding/${shop}/00000000-0000-4000-8000-0000000001${String(n).padStart(2, '0')}.png`;
export const PNG = 'image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

/** Бэлэн мөнгөний (санхүүгийн эрхтэйд л харагдах) дүнгүүд — `cashHidden` үед хаана ч гарахгүй. */
export const CASH_NUMBERS = ['842,166,000', '673,732,800', '161,844,800', '90,000,000', '1,605,898,800', '2,145,898,800', '187,824,800'];

function months(): MonthlySalesMonth[] {
    const rows = emptyMonthlySales();
    rows[9] = {
        ...rows[9], revision: 3,
        target_amount: 5_352_996_000, cashflow_target_amount: 1_605_898_800, contract_count_target: 14,
        stretch_target_amount: 7_152_996_000, stretch_cashflow_target_amount: 2_145_898_800,
        block_amounts: {
            b1: { target_amount: 2_807_220_000, cashflow_target_amount: 842_166_000, contract_count_target: 5, manual_contract_actual_amount: 1_128_031_000, manual_contract_count_actual: 2 },
            b2: { target_amount: 2_245_776_000, cashflow_target_amount: 673_732_800, contract_count_target: 4, manual_contract_actual_amount: 2_195_395_000, manual_contract_count_actual: 4, manual_cashflow_actual_amount: 161_844_800 },
            parking: { target_amount: 300_000_000, cashflow_target_amount: 90_000_000, contract_count_target: 5, manual_contract_actual_amount: 86_600_000, manual_contract_count_actual: 1, manual_cashflow_actual_amount: 25_980_000 },
        },
    };
    return rows;
}

const contract = (id: string, over: Partial<PlanContract>): PlanContract => ({
    id, contract_date: '2026-10-15', contract_status: 'active', product_type: 'residential', block_name: 'Б2', total_price: 548_848_750, prepayment_due: 164_654_625, ...over,
});
const CONTRACTS: PlanContract[] = [
    ...[0, 1, 2, 3].map(index => contract(`b2-${index}`, { contract_date: `2026-10-1${index + 2}` })),
    contract('b1-0', { block_name: 'Б1', total_price: 564_015_500, prepayment_due: 169_204_650 }),
    contract('b1-1', { block_name: 'Б1', total_price: 564_015_500, prepayment_due: 112_803_100 }),
    contract('p-0', { product_type: 'parking', block_name: 'Б1', total_price: 86_600_000, prepayment_due: 25_980_000 }),
];

/**
 * `cashHidden` = санхүүгийн эрхгүй хэрэглэгчийн хариу (мөнгөн урсгал огт ирэхгүй); `hubPaid` = HUB файлын «Нийт төлсөн дүн»
 * (Б1-ийн хоёр гэрээ, файлын огноо 2026-10-20) — үгүй бол дэвтэр (гэрээний төлсөн дүн тодорхойгүй).
 */
export function plan({ cashHidden = false, stretch = true, hubPaid = false, manualCounts = true, undated = false }: { cashHidden?: boolean; stretch?: boolean; hubPaid?: boolean; manualCounts?: boolean; undated?: boolean } = {}): TeamPlanReport {
    const rows = months();
    if (!stretch) rows[9] = { ...rows[9], stretch_target_amount: null, stretch_cashflow_target_amount: null };
    if (!manualCounts) {
        const blocks = rows[9].block_amounts!;
        rows[9] = { ...rows[9], block_amounts: Object.fromEntries(Object.entries(blocks).map(([block, cells]) => [block, { ...cells, manual_contract_count_actual: undefined }])) };
    }
    const report = buildPlanPerformance({
        year: 2026, now: new Date('2026-10-20T12:00:00+08:00'), months: rows, planYears: [2026],
        // `undated`: Б1, Б2-т огноогүй амьд гэрээ (прод-д HUB импортын дараа ч ~10 үлддэг) — аль ч сарынх байж болно.
        contracts: undated ? [...CONTRACTS, contract('u-b2', { contract_date: null }), contract('u-b1', { contract_date: null, block_name: 'Б1' })] : CONTRACTS,
        receipts: cashHidden ? null : [], ledgerSince: cashHidden ? undefined : '2026-10-01', latestImportDate: null,
        hubPaid: hubPaid ? { asOf: '2026-10-20', paid: new Map([['b1-0', 169_204_650], ['b1-1', 112_803_100]]) } : null,
    });
    return cashHidden ? { ...report, cashHidden: true } : report;
}

const values = (over: Partial<Record<ActivityMetric, number | null>> = {}) =>
    ({ ...Object.fromEntries(ACTIVITY_METRICS.map(metric => [metric, null])), ...over }) as Record<ActivityMetric, number | null>;
const flags = (over: Partial<Record<ActivityMetric, boolean>> = {}) =>
    ({ ...Object.fromEntries(ACTIVITY_METRICS.map(metric => [metric, false])), ...over }) as Record<ActivityMetric, boolean>;

export function activity(): SalesActivityReport {
    const buckets = activityBuckets(range.to);
    const filled: Record<string, { values: Record<ActivityMetric, number | null>; partial?: Record<ActivityMetric, boolean>; known: number }> = {
        '10/01–10/06': { values: values({ newMeetings: 2 }), partial: flags({ newMeetings: true }), known: 0 },
        '10/07–10/13': { values: values({ hotline: 40, managerLine: null, newMeetings: 10, repeatMeetings: 1, chats: 33 }), known: 5 },
        '10/14–10/20': { values: values({ hotline: 53, managerLine: 65, newMeetings: 12, repeatMeetings: 3, chats: 45 }), known: 7 },
    };
    return {
        meetingDate, range,
        buckets: buckets.map(bucket => ({
            ...bucket, values: filled[bucket.label]?.values ?? values(), partial: filled[bucket.label]?.partial ?? flags(),
            confirmedDays: 0, knownDays: filled[bucket.label]?.known ?? 0, days: 7,
        })),
        month: { month: '2026-10', from: '2026-10-01', to: range.to, metrics: {
            hotline: { actual: 145, plan: 550, planToDate: 367, pct: 40, partial: false },
            managerLine: { actual: 142, plan: 300, planToDate: 200, pct: 71, partial: false },
            newMeetings: { actual: 24, plan: 110, planToDate: 73, pct: null, partial: true },
            repeatMeetings: { actual: 4, plan: 30, planToDate: 20, pct: 20, partial: false },
            chats: { actual: null, plan: null, planToDate: null, pct: null, partial: false },
        } },
        lines: { hotline: '7786 Оператор', managerLine: '3374', chats: ['Пэйж FB', 'Хувь чат'] },
        dataSince: '2026-10-05',
        notes: ['Уулзалтын бүртгэл 2026-10-05-нээс эхэлсэн.'],
    };
}

export function meetings(): MeetingDetailsReport {
    const weeks = meetingDetailWeeks(meetingDate);
    const e7 = { key: 'B1|E7', label: 'Б1 E7 · 89.73 м² · 3 өрөө' };
    const a = { key: 'B2|A', label: 'Б2 A · 57.87 м² · 2 өрөө' };
    return {
        range,
        weeks: weeks.map((week, index) => index === 0 ? { ...week, total: 0, withoutInterest: 0, byModel: [], coverage: 'none' as const } : {
            ...week, total: 6 + index, withoutInterest: 1, coverage: 'full' as const,
            byModel: [{ ...e7, count: 3 + index }, { ...a, count: 2 }],
        }),
        referral: { rows: [{ label: 'Ойрхон амьдардаг', count: 5 }, { label: 'Сошиал медиа', count: 3 }, { label: 'Мандала Гарден ОС', count: 2 }], unknown: 2, total: 12, available: true },
        notes: [],
    };
}

export function negotiations(empty = false): NegotiationsReport {
    const row = (leadId: string, over: Partial<NegotiationsReport['rows'][number]>): NegotiationsReport['rows'][number] => ({
        leadId, status: 'negotiating', manager: 'Хонгорзул.Мөнхгэрэл', block: 'Б2', rooms: 2, floor: 12, area: 57.87, condition: '10-30%',
        pricePerSqm: 5_400_000, total: 312_498_000, advance: 93_749_400, conditionNote: null, referral: 'Инстаграм', viewedAt: '2026-10-18', priceReason: null, ...over,
    });
    const rows = empty ? [] : [row('l1', {}), row('l2', { block: 'Б1', rooms: 3, floor: 7, area: 89.73, pricePerSqm: null, total: null, advance: null, priceReason: 'Үнийн дүрэм олдсонгүй', referral: null })];
    return {
        asOf: '2026-10-21', rows,
        totals: empty
            ? { count: 0, area: { sum: 0, known: 0, partial: false }, total: { sum: 0, known: 0, partial: false }, advance: { sum: 0, known: 0, partial: false } }
            : { count: 2, area: { sum: 147.6, known: 147.6, partial: false }, total: { sum: null, known: 312_498_000, partial: true }, advance: { sum: null, known: 93_749_400, partial: true } },
        pricing: empty ? null : { version: 3, source: 'Elysium үнийн жагсаалт' },
        notes: empty ? [] : ['Үнийг өнөөдрийн (2026-10-21) баталсан үнийн тохиргоогоор (v3) тооцов.'],
    };
}

const line = (key: string, over: Partial<ContractLine>): ContractLine => ({
    key, contractNumber: null, date: '2026-10-15', kind: 'residential', kindLabel: 'Орон сууц', block: 'Б2', unit: key, customer: 'Б.Мэндбаяр',
    rooms: 2, floor: 12, referral: 'Инстаграм', area: 57.87, pricePerSqm: 5_400_000, advanceCondition: '30%', total: 312_498_000, advance: 93_749_400,
    paid: null, manager: 'Хонгорзул.Мөнхгэрэл', channel: null, status: 'active', ...over,
});

export function weeklySales() {
    const units: ErpProduct[] = [];
    for (const block of ['Б1', 'Б2']) for (let floor = 2; floor <= 23; floor++) for (const model of ['E1', 'E2', 'E3']) {
        const index = units.length;
        units.push({ key: `u${index}`, code: `${block}-${index + 1}`, block, floor, model, kind: 'residential', rooms: 2, area: 57.87, price: null,
            status: index % 5 === 0 ? 'sold' : 'available', statusLabel: '', barter: index === 7, manager: index % 5 === 0 ? 'Хонгорзул.Мөнхгэрэл' : null });
    }
    return buildWeeklySales({
        range, sales: null, previousSales: null, monthTarget: 5_352_996_000,
        crmContracts: [
            line('А1-013', { kind: 'parking', kindLabel: 'Зогсоол', block: 'Б1', rooms: null, floor: null, referral: null, area: 12.5, pricePerSqm: null, total: 86_600_000, advance: 25_980_000, customer: 'Б.Мэндбаяр', date: '2026-10-08' }),
            line('Б2-1201', { date: '2026-10-02' }),
            line('Б2-1402', { rooms: 3, floor: 14, area: 89.73, total: 484_542_000, advance: 145_362_600, advanceCondition: '10-30%', referral: 'Ойрхон амьдардаг', customer: null }),
            line('Б1-0703', { block: 'Б1', floor: 7, advance: null, referral: null }),
            line('Б3-0101', { kind: 'industry', kindLabel: 'Агуулах', block: 'Б3', rooms: null, floor: null, area: 3.4, total: 10_700_000, advance: null }),
        ],
        inventory: { info: { date: '2026-10-20', source: 'HUB гэрээ + байрны бүртгэл', kind: 'contracts' }, rows: units },
    });
}

/**
 * Elysium-ийн бодит хэлбэрийн давхрын зураглал: Б1 7 загвар (E1–E7), Б2 8 загвар (E1, E2, A–F), 2–23 давхар; урт нэртэй
 * менежер (Чанцалдулам, Номин-Эрдэнэ) гэрээтэй байр, бартер, нэг давхар × загварт хоёр байр (Б2 12 давхар A).
 */
export function elysiumFloorMaps() {
    const models: Record<string, Array<[string, number]>> = {
        'Б1': [['E1', 89.73], ['E2', 89.73], ['E3', 80.32], ['E4', 62.1], ['E5', 57.87], ['E6', 71.2], ['E7', 89.73]],
        'Б2': [['E1', 89.73], ['E2', 89.73], ['A', 57.87], ['B', 62.1], ['C', 45.5], ['D', 71.2], ['E', 57.87], ['F', 80.32]],
    };
    const managers = ['Чанцалдулам.Раднаа', 'Номин-Эрдэнэ.Бат', 'Хонгорзул.Мөнхгэрэл'];
    const units: ErpProduct[] = [];
    for (const [block, list] of Object.entries(models)) for (let floor = 2; floor <= 23; floor++) for (const [model, size] of list) {
        const index = units.length;
        const sold = index % 3 === 0;
        units.push({ key: `u${index}`, code: `${block}-${floor}${model}`, block, floor, model, kind: 'residential', rooms: 2, area: size, price: null,
            status: sold ? 'sold' : 'available', statusLabel: '', barter: index === 10, manager: sold ? managers[index % managers.length] : null });
    }
    units.push({ key: 'double', code: 'Б2-12A2', block: 'Б2', floor: 12, model: 'A', kind: 'residential', rooms: 2, area: 57.87, price: null,
        status: 'sold', statusLabel: '', barter: false, manager: managers[0] });
    return buildWeeklySales({
        range, sales: null, previousSales: null, monthTarget: null, crmContracts: [],
        inventory: { info: { date: '2026-10-20', source: 'HUB гэрээ + байрны бүртгэл', kind: 'contracts' }, rows: units },
    });
}

const slide = (id: string, over: Partial<WeeklySlide>): WeeklySlide => ({
    id, meeting_date: meetingDate, part: 'sales', section: 'event', title: '', note: '', image_paths: [], position: 0,
    author_id: user, author_name: 'Номин', updated_at: '2026-10-20T10:00:00Z', ...over,
});

export function slides(): WeeklySlide[] {
    return [
        slide('s-plan', { section: 'plan', position: 5, note: '• Showroom тохижуулах\nБорлуулалтын оффис\n- Vertmon HUB хөгжүүлэлт' }),
        slide('s-build', { section: 'construction', position: 2, image_paths: [media(3), media(4)] }),
        slide('s-event', { section: 'event', position: 1, title: 'Нээлттэй хаалганы өдөр', image_paths: [media(1), media(2)] }),
        slide('s-neg', { section: 'negotiation', position: 0, title: 'Банкны зээлийн нөхцөл', note: 'Хоёр харилцагч банкны хариу хүлээж байна.' }),
        slide('s-mkt', { part: 'marketing', section: 'social', title: 'Маркетингийн пост', image_paths: [media(5)] }),
    ];
}

export const images = (): Record<string, DeckImage> => Object.fromEntries([1, 2, 3, 4, 5].map(n => [media(n), { data: PNG, width: 1600, height: 1200 }]));

export function teamInput(over: Partial<TeamDeckInput> = {}): TeamDeckInput {
    return {
        projectName: 'Elysium Residence', meetingDate, range, generatedAt: '2026.10.21 09:05',
        branding: { displayName: 'ЭЛИЗИУМ', footerText: 'ВЕРТМОН ПРОПЕРТИС ХХК', coverImagePath: brandingPath(1), logoPath: brandingPath(2), updatedAt: '2026-10-20T10:00:00Z' },
        coverImage: { data: PNG, width: 1600, height: 1200 }, logo: { data: PNG, width: 600, height: 200 },
        plan: plan(), activity: activity(), meetings: meetings(), negotiations: negotiations(), weeklySales: weeklySales(),
        slides: slides(), images: images(), failed: {},
        ...over,
    };
}

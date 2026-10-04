/**
 * Лхагва гарагийн хурлын БОРЛУУЛАЛТЫН тайлан (нэг төсөл = нэг shop).
 *
 * Эх сурвалж:
 *  - ERP-ийн гэрээний экспорт (`property.sale`) — тайлант долоо хоног болон сарын гэрээ,
 *    менежерээр, хоцролт/үлдэгдэл. Хоёр snapshot байвал «Нийт төлсөн дүн»-гийн зөрүүгээр
 *    мөнгөн орлогыг тооцно (snapshot-ын огноогоор, тайлант долоо хоногтой яг давхцахгүй байж болно).
 *  - ERP-ийн бүтээгдэхүүний экспорт эсвэл CRM-ийн `property_units` — үлдэгдэл, давхрын зураглал.
 *  - ERP гэрээ алга бол CRM-ийн `property_contracts`.
 * Лид, уулзалтын тоо үйл ажиллагааны тайлангаас (`/api/dashboard/reports/operations`) ирнэ.
 *
 * Дүрэм: хоосон дүнг 0 гэж таамаглахгүй; гэрээний дүн, мөнгөн орлого, бартер тусдаа.
 */
import type { ErpProduct, ErpSale, ProductKind } from '@/lib/erp/records';
import { PRODUCT_KIND_LABEL } from '@/lib/erp/records';
import type { InventoryStatus } from '@/lib/inventory/labels';
import { UNIT_STATUS_LABEL } from '@/lib/inventory/labels';

const DAY = 86_400_000;
const shift = (date: string, days: number) => new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY).toISOString().slice(0, 10);
const weekday = (date: string) => new Date(`${date}T00:00:00Z`).getUTCDay();
const within = (date: string | null, from: string, to: string) => !!date && date >= from && date <= to;

/** Сарыг Лхагва–Мягмар долоо хоногт хуваана (сарын хилээр тасална, 1 өдрийн эхний хэсгийг дараагийнхтай нийлүүлнэ). */
export function monthWeeks(month: string): Array<{ label: string; from: string; to: string }> {
    const first = `${month}-01`;
    const last = shift(shift(`${month}-28`, 4).slice(0, 7) + '-01', -1);
    const segments: Array<{ from: string; to: string }> = [];
    for (let start = first; start <= last;) {
        const tuesday = shift(start, (2 - weekday(start) + 7) % 7);
        const end = tuesday < last ? tuesday : last;
        segments.push({ from: start, to: end });
        start = shift(end, 1);
    }
    if (segments.length > 1 && segments[0].from === segments[0].to) {
        segments[1] = { from: segments[0].from, to: segments[1].to };
        segments.shift();
    }
    return segments.map((segment, index) => ({ ...segment, label: `${index + 1}-р долоо хоног` }));
}

export interface ContractLine {
    key: string;
    contractNumber: string | null;
    date: string | null;
    kind: ProductKind;
    kindLabel: string;
    block: string | null;
    unit: string | null;
    customer: string | null;
    area: number | null;
    pricePerSqm: number | null;
    advanceCondition: string | null;
    total: number | null;
    advance: number | null;
    paid: number | null;
    manager: string | null;
    channel: string | null;
    status: string;
}

export interface SnapshotInfo { date: string; source: string }

export interface WeeklySalesInput {
    range: { from: string; to: string };
    /** ERP гэрээний сүүлийн snapshot (хурлын өдрөөс өмнөх). */
    sales: { info: SnapshotInfo; rows: ErpSale[] } | null;
    /** Өмнөх хурлын үеийн snapshot — мөнгөн орлогын зөрүүнд. */
    previousSales: { info: SnapshotInfo; rows: ErpSale[] } | null;
    /** ERP-гүй үед CRM-ийн гэрээ. */
    crmContracts: ContractLine[] | null;
    /** ERP бүтээгдэхүүн эсвэл CRM нэгж (ижил хэлбэрт хувиргасан). */
    inventory: { info: SnapshotInfo & { kind: 'erp' | 'crm' }; rows: ErpProduct[] } | null;
    /** Сарын гэрээний төлөвлөгөө (₮). Тохируулаагүй бол null. */
    monthTarget: number | null;
}

const sum = (values: Array<number | null>) => values.reduce<number>((total, value) => total + (value ?? 0), 0);
const missing = (values: Array<number | null>) => values.filter(value => value === null).length;

export function saleToLine(sale: ErpSale): ContractLine {
    return {
        key: sale.key, contractNumber: sale.contractNumber, date: sale.orderDate, kind: sale.kind, kindLabel: PRODUCT_KIND_LABEL[sale.kind],
        block: sale.block, unit: sale.unitCode, customer: sale.customer, area: sale.area, pricePerSqm: sale.pricePerSqm,
        advanceCondition: sale.advanceCondition, total: sale.total, advance: sale.advanceAmount, paid: sale.paid,
        manager: sale.manager, channel: sale.channel, status: sale.statusLabel,
    };
}

function summarize(lines: ContractLine[]) {
    const byKind = new Map<ProductKind, ContractLine[]>();
    for (const line of lines) byKind.set(line.kind, [...(byKind.get(line.kind) ?? []), line]);
    return {
        count: lines.length,
        total: sum(lines.map(line => line.total)),
        missingTotals: missing(lines.map(line => line.total)),
        barter: lines.filter(line => /бартер/i.test(line.channel ?? '')).length,
        byKind: [...byKind].map(([kind, rows]) => ({
            kind, label: PRODUCT_KIND_LABEL[kind], count: rows.length, total: sum(rows.map(row => row.total)),
            advance: sum(rows.map(row => row.advance)), paid: sum(rows.map(row => row.paid)),
        })).sort((a, b) => b.total - a.total),
    };
}

type FloorCell = { code: string; model: string | null; area: number | null; status: InventoryStatus | null; statusLabel: string; barter: boolean; manager: string | null };

export function buildWeeklySales(input: WeeklySalesInput) {
    const { range } = input;
    const month = range.to.slice(0, 7);
    const weeks = monthWeeks(month);
    const notes: string[] = [];

    // Гэрээ: ERP байвал түүнээс, үгүй бол CRM-ээс. Цуцлагдсан гэрээг тоолохгүй.
    const allLines = input.sales
        ? input.sales.rows.filter(sale => sale.status !== 'cancelled').map(saleToLine)
        : input.crmContracts ?? [];
    if (!input.sales) notes.push(input.crmContracts ? 'ERP гэрээний экспорт оруулаагүй тул CRM-ийн гэрээг ашиглав.' : 'Гэрээний мэдээлэл алга.');
    const weekLines = allLines.filter(line => within(line.date, range.from, range.to)).sort((a, b) => (a.date ?? '').localeCompare(b.date ?? '') || a.key.localeCompare(b.key));
    const monthLines = allLines.filter(line => line.date?.startsWith(month));
    const previousWeek = { from: shift(range.from, -7), to: shift(range.to, -7) };
    const undated = allLines.filter(line => !line.date).length;
    if (undated) notes.push(`${undated} гэрээний огноо хоосон тул хугацаанд ороогүй.`);

    const kinds = [...new Set(monthLines.map(line => line.kind))];
    const monthByWeek = kinds.map(kind => {
        const rows = monthLines.filter(line => line.kind === kind);
        return { kind, label: PRODUCT_KIND_LABEL[kind], weeks: weeks.map(week => rows.filter(line => within(line.date, week.from, week.to)).length), count: rows.length, total: sum(rows.map(row => row.total)) };
    });

    // Мөнгөн орлого: хоёр ERP snapshot-ын «Нийт төлсөн дүн»-гийн зөрүү.
    let cash: { from: string; to: string; delta: number; perManager: Map<string, number>; unknown: number } | null = null;
    if (input.sales && input.previousSales && input.previousSales.info.date < input.sales.info.date) {
        const before = new Map(input.previousSales.rows.map(sale => [sale.key, sale.paid]));
        const perManager = new Map<string, number>();
        let delta = 0;
        let unknown = 0;
        for (const sale of input.sales.rows) {
            if (sale.paid === null) { unknown++; continue; }
            const change = sale.paid - (before.get(sale.key) ?? 0);
            if (!change) continue;
            delta += change;
            const name = sale.manager ?? 'Менежергүй';
            perManager.set(name, (perManager.get(name) ?? 0) + change);
        }
        cash = { from: input.previousSales.info.date, to: input.sales.info.date, delta, perManager, unknown };
    } else if (input.sales) {
        notes.push('Мөнгөн орлогыг тооцоход өмнөх долоо хоногийн ERP гэрээний snapshot хэрэгтэй.');
    }

    // Менежерээр (долоо хоног, сар, мөнгөн орлого).
    // Долоо хоног хоёр сар дамнаж болох тул долоо хоног, сарыг тус тусад нь тоолно.
    const managers = new Map<string, { manager: string; weekCount: number; weekTotal: number; monthCount: number; monthTotal: number }>();
    const managerRow = (name: string) => managers.get(name) ?? managers.set(name, { manager: name, weekCount: 0, weekTotal: 0, monthCount: 0, monthTotal: 0 }).get(name)!;
    for (const line of weekLines) {
        const row = managerRow(line.manager ?? 'Менежергүй');
        row.weekCount++;
        row.weekTotal += line.total ?? 0;
    }
    for (const line of monthLines) {
        const row = managerRow(line.manager ?? 'Менежергүй');
        row.monthCount++;
        row.monthTotal += line.total ?? 0;
    }
    for (const name of cash?.perManager.keys() ?? []) managerRow(name);
    const byManager = [...managers.values()].map(row => ({ ...row, cash: cash ? cash.perManager.get(row.manager) ?? 0 : null }))
        .sort((a, b) => b.monthTotal - a.monthTotal || b.weekTotal - a.weekTotal || a.manager.localeCompare(b.manager, 'mn'));

    // Авлага: одоогийн ERP snapshot-ын идэвхтэй гэрээ.
    const active = input.sales?.rows.filter(sale => sale.status === 'active') ?? [];
    const receivables = input.sales ? {
        balance: sum(active.map(sale => sale.balance)),
        overdue: sum(active.map(sale => sale.overdue)),
        overdueContracts: new Set(active.filter(sale => (sale.overdue ?? 0) > 0).map(sale => sale.contractNumber)).size,
        penalty: sum(active.map(sale => sale.penalty)),
        missing: missing(active.map(sale => sale.balance)),
    } : null;

    // Үлдэгдэл ба давхрын зураглал.
    const inventory = input.inventory ? (() => {
        const groups = new Map<string, { block: string; kind: ProductKind; label: string; total: number; barter: number; statuses: Record<string, number> }>();
        for (const unit of input.inventory.rows) {
            const block = unit.block ?? 'Блокгүй';
            const id = `${block}|${unit.kind}`;
            const group = groups.get(id) ?? { block, kind: unit.kind, label: PRODUCT_KIND_LABEL[unit.kind], total: 0, barter: 0, statuses: {} };
            group.total++;
            if (unit.barter) group.barter++;
            const status = unit.status ?? 'unknown';
            group.statuses[status] = (group.statuses[status] ?? 0) + 1;
            groups.set(id, group);
        }
        const residential = input.inventory.rows.filter(unit => unit.kind === 'residential' && unit.floor !== null);
        const floorMaps = [...new Set(residential.map(unit => unit.block ?? 'Блокгүй'))].sort().map(block => {
            const units = residential.filter(unit => (unit.block ?? 'Блокгүй') === block);
            const models = [...new Set(units.map(unit => unit.model ?? '—'))].sort((a, b) => a.localeCompare(b, 'mn', { numeric: true }));
            const floors = [...new Set(units.map(unit => unit.floor!))].sort((a, b) => b - a).map(floor => {
                const cells: Record<string, FloorCell[]> = {};
                for (const unit of units.filter(unit => unit.floor === floor)) {
                    (cells[unit.model ?? '—'] ||= []).push({ code: unit.code, model: unit.model, area: unit.area, status: unit.status, statusLabel: unit.statusLabel, barter: unit.barter, manager: unit.manager });
                }
                const list = Object.values(cells).flat();
                return {
                    floor, cells,
                    counts: {
                        sold: list.filter(cell => !cell.barter && (cell.status === 'sold' || cell.status === 'handed_over')).length,
                        available: list.filter(cell => cell.status === 'available').length,
                        other: list.filter(cell => !cell.barter && cell.status !== 'sold' && cell.status !== 'handed_over' && cell.status !== 'available').length,
                        barter: list.filter(cell => cell.barter && cell.status !== 'available').length,
                    },
                };
            });
            const totals = floors.reduce((acc, row) => ({ sold: acc.sold + row.counts.sold, available: acc.available + row.counts.available, other: acc.other + row.counts.other, barter: acc.barter + row.counts.barter }), { sold: 0, available: 0, other: 0, barter: 0 });
            return { block, models, floors, totals };
        });
        return {
            source: input.inventory.info,
            blocks: [...groups.values()].sort((a, b) => a.block.localeCompare(b.block, 'mn', { numeric: true }) || a.kind.localeCompare(b.kind)),
            statusLabels: { ...UNIT_STATUS_LABEL, unknown: 'Тодорхойгүй' } as Record<string, string>,
            floorMaps,
        };
    })() : null;
    if (!inventory) notes.push('Байрны үлдэгдлийн мэдээлэл алга (ERP бүтээгдэхүүний экспорт эсвэл байрны бүртгэл).');

    const week = summarize(weekLines);
    const monthSummary = summarize(monthLines);
    const previousWeekLines = allLines.filter(line => within(line.date, previousWeek.from, previousWeek.to));
    return {
        range,
        month: { month, weeks, ...monthSummary, byWeek: monthByWeek,
            target: input.monthTarget, attainmentPct: input.monthTarget ? Math.round(monthSummary.total / input.monthTarget * 100) : null },
        week: { ...week, lines: weekLines },
        previousWeek: { ...previousWeek, count: previousWeekLines.length, total: sum(previousWeekLines.map(line => line.total)) },
        byManager,
        cash: cash ? { from: cash.from, to: cash.to, delta: cash.delta, unknown: cash.unknown,
            basis: `ERP-ийн «Нийт төлсөн дүн»-гийн зөрүү (${cash.from} → ${cash.to}). Бартер, буцаалт ERP-д бүртгэгдсэнээрээ орно; банкны хуулгатай тулгаагүй.` } : null,
        receivables,
        inventory,
        sources: {
            sales: input.sales?.info ?? null,
            previousSales: input.previousSales?.info ?? null,
            contracts: input.sales ? 'erp' as const : input.crmContracts ? 'crm' as const : null,
        },
        notes,
    };
}

export type WeeklySalesReport = ReturnType<typeof buildWeeklySales>;

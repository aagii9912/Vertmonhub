import type { SupabaseClient } from '@supabase/supabase-js';
import { parseErpSale, type ErpSale } from '@/lib/erp/records';
import { listErpSnapshots, loadErpDatasets, snapshotRecords } from '@/lib/erp/snapshots';
import { ACTIVE_STATUSES } from '@/lib/leads/labels';
import { getLeadWorkQueues } from '@/lib/leads/work-queue';
import { fetchAllRows } from '@/lib/utils/pagination';
import { scoreKpi, type KpiActuals, type KpiItemKey } from './kpi';
import { readDailyTargets } from './activity';
import { loadManagerActivity } from './activity-load';

const DAY = 86_400_000;
const shift = (date: string, days: number) => new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY).toISOString().slice(0, 10);

type KpiRow = { manager_name: string; plans: Record<string, number>; manual: Record<string, number | null>; daily: unknown; review: { management?: number | null; note?: string } };
type LeadRow = { sales_manager_name: string | null; status: string; last_contact_at: string | null; next_followup_at: string | null; viewing_scheduled_at: string | null; created_at: string };

/**
 * Сарын KPI картын эх өгөгдөл (нэг shop = нэг төсөл). Менежерүүд = идэвхтэй бүртгэл болон
 * тухайн сард ERP-д гэрээтэй, KPI мөртэй нэрс. ERP-ийн тооцоо:
 *  - гэрээний дүн: сарын дараах 7 хоногийн доторх хамгийн сүүлийн гэрээний snapshot;
 *  - орсон мөнгө, хоцролтын бууралт: сарын эхний өдөр хүртэлх snapshot ↔ дээрх snapshot.
 * Snapshot дутуу бол тухайн үзүүлэлт `null` (0 биш).
 * CRM-ийн идэвх (шинэ харилцагчтай уулзалт, дуудлага, санал хүсэлтийн SLA) нь өдрийн идэвхийн
 * тайлантай (loadManagerActivity) нэг дүрмээр тооцогдоно. Дуудлага = гараар оруулсан тоо ?? CRM (нэмэхгүй).
 */
export async function loadSalesKpi(db: SupabaseClient, options: { shopId: string; year: number; month: number; only?: string | null; now?: Date }) {
    const { shopId, year, month } = options;
    const firstDay = `${year}-${String(month).padStart(2, '0')}-01`;
    const nextFirst = month === 12 ? `${year + 1}-01-01` : `${year}-${String(month + 1).padStart(2, '0')}-01`;
    const now = options.now ?? new Date();

    const metas = await listErpSnapshots(db, shopId, shift(nextFirst, 6));
    const endMeta = metas.find(meta => meta.kind === 'sales') ?? null;
    const startMeta = metas.find(meta => meta.kind === 'sales' && meta.report_date <= firstDay && meta.id !== endMeta?.id) ?? null;
    const datasets = await loadErpDatasets(db, shopId, [endMeta, startMeta].flatMap(meta => meta ? [meta.id] : []));
    const endSales = snapshotRecords(endMeta, datasets, parseErpSale);
    const startSales = snapshotRecords(startMeta, datasets, parseErpSale);

    const [rosterResult, kpiResult, activity, leads] = await Promise.all([
        db.from('sales_managers').select('name, is_active').eq('shop_id', shopId),
        db.from('sales_kpi_months').select('manager_name, plans, manual, daily, review').eq('shop_id', shopId).eq('year', year).eq('month', month),
        loadManagerActivity(db, { shopId, from: firstDay, to: shift(nextFirst, -1), group: 'month', only: options.only ?? null, now }),
        fetchAllRows<LeadRow>((from, to) => db.from('leads').select('sales_manager_name, status, last_contact_at, next_followup_at, viewing_scheduled_at, created_at')
            .eq('shop_id', shopId).is('deleted_at', null).in('status', [...ACTIVE_STATUSES]).not('sales_manager_name', 'is', null).order('id').range(from, to)),
    ]);
    if (rosterResult.error) throw rosterResult.error;
    if (kpiResult.error) throw kpiResult.error;
    const kpiRows = new Map(((kpiResult.data ?? []) as KpiRow[]).map(row => [row.manager_name, row]));

    const monthSales = (endSales?.rows ?? []).filter(sale => sale.status !== 'cancelled' && sale.orderDate && sale.orderDate >= firstDay && sale.orderDate < nextFirst);
    const byManager = <T>(rows: T[], name: (row: T) => string | null) => {
        const map = new Map<string, T[]>();
        for (const row of rows) { const key = name(row); if (key) map.set(key, [...(map.get(key) ?? []), row]); }
        return map;
    };
    const salesByManager = byManager(monthSales, sale => sale.manager);
    const before = new Map((startSales?.rows ?? []).map(sale => [sale.key, sale]));
    const cash = new Map<string, number>();
    const overdue = new Map<string, number>();
    if (endSales && startSales) {
        for (const sale of endSales.rows) {
            if (!sale.manager) continue;
            const prior: ErpSale | undefined = before.get(sale.key);
            if (sale.paid !== null) cash.set(sale.manager, (cash.get(sale.manager) ?? 0) + sale.paid - (prior?.paid ?? 0));
            if (prior && prior.overdue !== null && sale.overdue !== null)
                overdue.set(sale.manager, (overdue.get(sale.manager) ?? 0) + Math.max(0, prior.overdue - sale.overdue));
        }
    }
    const activityByManager = new Map(activity.managers.map(row => [row.manager, row.totals]));
    const leadsByManager = byManager(leads, row => row.sales_manager_name);

    const names = new Set<string>([
        ...(rosterResult.data ?? []).filter(row => row.is_active).map(row => row.name as string),
        ...salesByManager.keys(), ...kpiRows.keys(),
    ]);
    const active = new Set((rosterResult.data ?? []).filter(row => row.is_active).map(row => row.name as string));
    const managers = [...names].filter(name => !options.only || name === options.only).sort((a, b) => a.localeCompare(b, 'mn')).map(manager => {
        const row = kpiRows.get(manager);
        const managerLeads = leadsByManager.get(manager) ?? [];
        const onTime = managerLeads.filter(lead => !getLeadWorkQueues(lead, now).includes('overdue')).length;
        const crm = activityByManager.get(manager);
        const manualCalls = typeof row?.manual?.calls_chats === 'number' ? row.manual.calls_chats : null;
        const actuals: KpiActuals = {
            contract_amount: endSales ? (salesByManager.get(manager) ?? []).reduce((sum, sale) => sum + (sale.total ?? 0), 0) : null,
            cash_collected: endSales && startSales ? cash.get(manager) ?? 0 : null,
            overdue_collected: endSales && startSales ? overdue.get(manager) ?? 0 : null,
            new_meetings: crm?.meetingsNew ?? 0,
            calls_chats: manualCalls ?? crm?.calls ?? 0,
            followup: managerLeads.length ? Math.round(onTime / managerLeads.length * 1000) / 10 : null,
            service_resolution: crm?.requests.onTimePct ?? null,
        };
        const plans = Object.fromEntries(Object.entries(row?.plans ?? {}).filter(([, value]) => typeof value === 'number')) as Partial<Record<KpiItemKey, number>>;
        return {
            manager,
            active: active.has(manager),
            contracts: (salesByManager.get(manager) ?? []).length,
            review: { management: row?.review?.management ?? null, note: row?.review?.note ?? '' },
            plans,
            manual: { calls_chats: manualCalls },
            crm: { calls: crm?.calls ?? 0, requests: crm?.requests ?? null },
            daily: readDailyTargets(row?.daily),
            ...scoreKpi({ plans, actuals, management: row?.review?.management ?? null }),
        };
    });
    return {
        year, month,
        sources: {
            contracts: endMeta ? { date: endMeta.report_date, source: endMeta.source } : null,
            cashFrom: startMeta ? { date: startMeta.report_date, source: startMeta.source } : null,
        },
        managers,
    };
}

export type SalesKpiReport = Awaited<ReturnType<typeof loadSalesKpi>>;

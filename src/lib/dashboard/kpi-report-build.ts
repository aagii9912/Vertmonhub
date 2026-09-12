/**
 * Сарын KPI тайлангийн тооцоолол — API route (`/api/dashboard/kpi-report`) ба AI tool
 * (`get_kpi_report`) хоёулаа энд дамжина. Эрхийн шалгалт (хэний тайланг харах) дуудагч дээр.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { ManagerIdentity } from '@/lib/sales/manager-identity';
import { getTeamTargets, getMonthlyActualsByManager } from '@/lib/sales/targets';
import {
    monthRange, prevMonthOf, countBy, buildKpiSummary,
    type KpiLeadRow, type KpiViewingRow, type KpiContractRow, type KpiTaskRow,
} from '@/lib/dashboard/kpi-report';

interface QueryResult {
    data: unknown[] | null;
    error: { message?: string } | null;
}

/** Best-effort мөр татагч: deleted_at байхгүй бол шүүлтгүй дахин оролдоно, бусад алдаанд хоосон буцна. */
async function safeManagerRows(
    run: (opts: { excludeDeleted: boolean }) => PromiseLike<QueryResult>,
): Promise<Record<string, unknown>[]> {
    let res = await run({ excludeDeleted: true });
    if (res.error && /deleted_at/i.test(res.error.message || '')) {
        res = await run({ excludeDeleted: false });
    }
    if (res.error) return [];
    return (res.data || []) as Record<string, unknown>[];
}

/** Head count — алдаанд 0 буцаана (миграци ороогүй орчин г.м). */
async function safeCount(
    run: (opts: { excludeDeleted: boolean }) => PromiseLike<{ count: number | null; error: { message?: string } | null }>,
): Promise<number> {
    let res = await run({ excludeDeleted: true });
    if (res.error && /deleted_at/i.test(res.error.message || '')) {
        res = await run({ excludeDeleted: false });
    }
    if (res.error) return 0;
    return res.count || 0;
}

export interface KpiReportInput {
    shopId: string;
    shopName: string | null;
    identity: ManagerIdentity;
    targetName: string;
    /** Нэвтэрсэн хэрэглэгч (өөрийн тайлан бол user_tasks-ийг үүгээр уншина) */
    uid: string;
    year: number;
    month: number;
}

export async function computeKpiReport(db: SupabaseClient, { shopId, shopName, identity, targetName, uid, year, month }: KpiReportInput) {
    const isSelf = targetName === identity.managerName;

    const { start, end } = monthRange(year, month);
    const prev = prevMonthOf(year, month);
    const { start: prevStart, end: prevEnd } = monthRange(prev.year, prev.month);
    const startIso = start.toISOString();
    const endIso = end.toISOString();

    // Дууссан ажлын эзэн: өөрөө бол uid, өөр менежер бол roster-ийн данс холбоос
    const targetUserId = isSelf
        ? uid
        : identity.roster.find((r) => r.name === targetName)?.user_id || null;

    const [
        leadRows,
        viewingRows,
        contractRows,
        taskRows,
        prevLeads,
        prevViewings,
        targets,
        byManager,
        prevYearByManager,
    ] = await Promise.all([
        safeManagerRows(({ excludeDeleted }) => {
            let q = db
                .from('leads')
                .select('id, customer_name, status, source, created_at')
                .eq('shop_id', shopId)
                .eq('sales_manager_name', targetName)
                .gte('created_at', startIso)
                .lt('created_at', endIso)
                .order('created_at', { ascending: true })
                .limit(1000);
            if (excludeDeleted) q = q.is('deleted_at', null);
            return q;
        }),
        safeManagerRows(({ excludeDeleted }) => {
            let q = db
                .from('property_viewings')
                .select('id, scheduled_at, status, properties(name), leads(customer_name)')
                .eq('shop_id', shopId)
                .eq('sales_manager_name', targetName)
                .gte('scheduled_at', startIso)
                .lt('scheduled_at', endIso)
                .order('scheduled_at', { ascending: true })
                .limit(500);
            if (excludeDeleted) q = q.is('deleted_at', null);
            return q;
        }),
        safeManagerRows(({ excludeDeleted }) => {
            let q = db
                .from('property_contracts')
                .select('id, contract_number, customer_name, total_price, contract_status, contract_date')
                .eq('shop_id', shopId)
                .eq('sales_manager', targetName)
                .gte('contract_date', startIso)
                .lt('contract_date', endIso)
                .order('contract_date', { ascending: true })
                .limit(500);
            if (excludeDeleted) q = q.is('deleted_at', null);
            return q;
        }),
        // Дуусгасан хувийн ажлууд (user_tasks миграци ороогүй бол хоосон)
        targetUserId
            ? safeManagerRows(() =>
                  db
                      .from('user_tasks')
                      .select('id, title, note, completed_at')
                      .eq('shop_id', shopId)
                      .eq('user_id', targetUserId)
                      .eq('status', 'done')
                      .is('deleted_at', null)
                      .gte('completed_at', startIso)
                      .lt('completed_at', endIso)
                      .order('completed_at', { ascending: true })
                      .limit(300),
              )
            : Promise.resolve([] as Record<string, unknown>[]),
        safeCount(({ excludeDeleted }) => {
            let q = db
                .from('leads')
                .select('id', { count: 'exact', head: true })
                .eq('shop_id', shopId)
                .eq('sales_manager_name', targetName)
                .gte('created_at', prevStart.toISOString())
                .lt('created_at', prevEnd.toISOString());
            if (excludeDeleted) q = q.is('deleted_at', null);
            return q;
        }),
        safeCount(({ excludeDeleted }) => {
            let q = db
                .from('property_viewings')
                .select('id', { count: 'exact', head: true })
                .eq('shop_id', shopId)
                .eq('sales_manager_name', targetName)
                .neq('status', 'cancelled')
                .gte('scheduled_at', prevStart.toISOString())
                .lt('scheduled_at', prevEnd.toISOString());
            if (excludeDeleted) q = q.is('deleted_at', null);
            return q;
        }),
        getTeamTargets(db, shopId, year),
        getMonthlyActualsByManager(db, shopId, year),
        // Он дамнасан харьцуулалт (1-р сар → өмнөх оны 12-р сар)
        prev.year !== year
            ? getMonthlyActualsByManager(db, shopId, prev.year)
            : Promise.resolve(null),
    ]);

    const leads = leadRows as unknown as KpiLeadRow[];
    const viewings: KpiViewingRow[] = viewingRows.map((v) => {
        const row = v as Record<string, unknown>;
        const property = row.properties as { name?: string } | null;
        const lead = row.leads as { customer_name?: string } | null;
        return {
            id: String(row.id),
            scheduled_at: (row.scheduled_at as string) || null,
            status: (row.status as string) || null,
            property_name: property?.name || null,
            customer_name: lead?.customer_name || null,
        };
    });
    const contracts = contractRows as unknown as KpiContractRow[];
    const tasksDone = taskRows as unknown as KpiTaskRow[];

    // Борлуулалт (канон: manager_monthly_sales view — самбартай ижил эх сурвалж)
    const mine = byManager.get(targetName);
    const revenue = mine?.actuals[month - 1] || 0;
    const contractCount = mine?.counts[month - 1] || contracts.length;
    const prevSource = prev.year !== year ? prevYearByManager : byManager;
    const prevMine = prevSource?.get(targetName);
    const prevRevenue = prevMine?.actuals[prev.month - 1] || 0;
    const prevContracts = prevMine?.counts[prev.month - 1] || 0;

    const summary = buildKpiSummary({
        leads,
        viewings,
        contractCount,
        revenue,
        tasksDone,
        prev: { leads: prevLeads, viewings: prevViewings, contracts: prevContracts, revenue: prevRevenue },
    });

    // Багийн сарын зорилт + гүйцэтгэл (идэвхтэй менежерүүд)
    const teamTarget = targets[month - 1] || 0;
    let target = null;
    if (teamTarget > 0) {
        const activeNames = identity.rosterEmpty
            ? new Set(byManager.keys())
            : new Set(identity.roster.filter((r) => r.is_active).map((r) => r.name));
        let teamActual = 0;
        for (const [name, m] of byManager) {
            if (!activeNames.has(name)) continue;
            teamActual += m.actuals[month - 1] || 0;
        }
        target = {
            teamTarget,
            teamActual,
            myShare: teamActual > 0 ? Math.round((revenue / teamActual) * 100) : null,
        };
    }


    return {
        manager: { name: targetName, isSelf },
        shopName,
        year,
        month,
        onboarding: false,
        summary,
        leadsByStatus: countBy(leads, (l) => l.status),
        leadsBySource: countBy(leads, (l) => l.source),
        viewingsByStatus: countBy(viewings, (v) => v.status),
        contracts,
        viewings: viewings.slice(0, 50),
        tasksDone,
        target,
    };
}

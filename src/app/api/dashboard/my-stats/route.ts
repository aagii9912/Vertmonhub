import { NextRequest, NextResponse } from 'next/server';
import { getUserShop, getUserId } from '@/lib/auth/supabase-auth';
import { resolvePermissions } from '@/lib/auth/require-permission';
import { supabaseAdmin } from '@/lib/supabase';
import { getStartOfPeriod } from '@/lib/utils/date';
import { checkRateLimit, createRateLimitResponse, getClientIdentifier } from '@/lib/utils/rate-limiter';
import { safeErrorResponse } from '@/lib/utils/safe-error';
import { resolveManagerIdentity } from '@/lib/sales/manager-identity';
import {
    getTeamTargets,
    getMonthlyActualsByManager,
    quarterOfMonth,
    sumQuarter,
    sumYear,
} from '@/lib/sales/targets';
import {
    groupLeadsByStatus,
    countActiveLeads,
    countLeadsCreatedSince,
    countViewingsBetween,
    buildTaskList,
    type LeadLite,
    type ViewingLite,
} from '@/lib/dashboard/my-stats';

/**
 * GET /api/dashboard/my-stats?period=today|week|month&manager=<нэр>
 *
 * «Миний самбар» — менежерийн хувийн дашбоардын бүх өгөгдөл НЭГ дуудалтаар:
 * KPI (лид/уулзалт/гэрээ/борлуулалт), зорилтын гүйцэтгэл, хийх ажлууд,
 * сүүлийн лидүүд, ойрын уулзалтууд, 12 сарын орлогын тренд.
 *
 * • Attribution: leads/property_viewings.sales_manager_name,
 *   property_contracts.sales_manager (нэрээр), manager_monthly_sales view.
 * • ?manager= зөвхөн админ/reports-эрхтэй (өөрөө personal биш) хэрэглэгчид
 *   ажиллана — эс бөгөөс чимээгүйхэн өөрийнх рүү буцна (мэдээлэл алдагдахгүй).
 * • Миграци ороогүй орчинд (sales_manager_name / deleted_at багана байхгүй)
 *   тухайн хэсэг хоосон буцна — 500 өгөхгүй (runExcludingDeleted-ийн жишиг).
 */

type Period = 'today' | 'week' | 'month';

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

function emptyPayload(period: Period, name: string | null, onboarding: boolean) {
    return {
        manager: { name, isSelf: true, inRoster: false, hasAccount: false },
        onboarding,
        period,
        kpis: {
            activeLeads: 0,
            newLeads: 0,
            leadsByStatus: {} as Record<string, number>,
            viewingsToday: 0,
            viewingsThisWeek: 0,
            activeContracts: 0,
            overdueContracts: 0,
            salesThisMonth: 0,
            salesThisYear: 0,
            contractCountThisYear: 0,
        },
        target: null,
        tasks: [],
        recentLeads: [],
        upcomingViewings: [],
        revenueTrend: Array(12).fill(0),
    };
}

export async function GET(request: NextRequest) {
    try {
        const authShop = await getUserShop();

        const identifier = authShop?.id || getClientIdentifier(request) || 'anonymous';
        const rateLimitResult = await checkRateLimit(`my-stats:${identifier}`, {
            windowMs: 60000,
            maxRequests: 30,
        });
        if (!rateLimitResult.allowed) {
            return createRateLimitResponse(rateLimitResult.resetAt);
        }

        const { searchParams } = new URL(request.url);
        const period = (searchParams.get('period') || 'today') as Period;
        const managerParam = searchParams.get('manager');

        const uid = await getUserId();
        if (!authShop || !uid) {
            return NextResponse.json(emptyPayload(period, null, true));
        }

        const db = supabaseAdmin();
        const [perms, identity] = await Promise.all([
            resolvePermissions(),
            resolveManagerIdentity(db, authShop.id, uid),
        ]);

        const role = perms?.role || 'viewer';
        const modules = perms?.permissions.modules || [];
        const isAdmin = role === 'admin' || role === 'super_admin';
        const isPersonalUser = !isAdmin && (role === 'sales_manager' || identity.isManager);
        const canViewOthers = !isPersonalUser && (isAdmin || modules.includes('reports'));

        const targetName =
            managerParam && canViewOthers ? managerParam : identity.managerName;
        if (!targetName) {
            return NextResponse.json(emptyPayload(period, null, true));
        }
        const isSelf = targetName === identity.managerName;

        const now = new Date();
        const dayStart = getStartOfPeriod('today');
        const dayEnd = new Date(dayStart);
        dayEnd.setDate(dayEnd.getDate() + 1);
        const weekEnd = new Date(dayStart);
        weekEnd.setDate(weekEnd.getDate() + 7);
        const periodStart = getStartOfPeriod(period);
        const year = now.getFullYear();
        const monthIdx = now.getMonth();
        const quarter = quarterOfMonth(monthIdx + 1);

        const [leadRowsRaw, viewingRowsRaw, contractRows, targets, byManager] = await Promise.all([
            // Миний лидүүд (сүүлийн 500 — KPI/таск/жагсаалт бүгд эндээс)
            safeManagerRows(({ excludeDeleted }) => {
                let q = db
                    .from('leads')
                    .select('id, customer_name, customer_phone, status, source, created_at, next_followup_at, budget_max')
                    .eq('shop_id', authShop.id)
                    .eq('sales_manager_name', targetName)
                    .order('created_at', { ascending: false })
                    .limit(500);
                if (excludeDeleted) q = q.is('deleted_at', null);
                return q;
            }),
            // Миний уулзалтууд (өнөөдрөөс эхлэн — өнөөдрийн таск + 7 хоногийн KPI + ойрын жагсаалт)
            safeManagerRows(({ excludeDeleted }) => {
                let q = db
                    .from('property_viewings')
                    .select('id, scheduled_at, status, agent_notes, properties(name), leads(customer_name)')
                    .eq('shop_id', authShop.id)
                    .eq('sales_manager_name', targetName)
                    .gte('scheduled_at', dayStart.toISOString())
                    .order('scheduled_at', { ascending: true })
                    .limit(100);
                if (excludeDeleted) q = q.is('deleted_at', null);
                return q;
            }),
            // Миний гэрээнүүд (идэвхтэй/хугацаа хэтэрсэн KPI)
            safeManagerRows(({ excludeDeleted }) => {
                let q = db
                    .from('property_contracts')
                    .select('id, contract_status, overdue_days')
                    .eq('shop_id', authShop.id)
                    .eq('sales_manager', targetName)
                    .limit(1000);
                if (excludeDeleted) q = q.is('deleted_at', null);
                return q;
            }),
            getTeamTargets(db, authShop.id, year),
            getMonthlyActualsByManager(db, authShop.id, year),
        ]);

        const leads = leadRowsRaw as unknown as LeadLite[];
        const viewings: ViewingLite[] = viewingRowsRaw.map((v) => {
            const row = v as Record<string, unknown>;
            const property = row.properties as { name?: string } | null;
            const lead = row.leads as { customer_name?: string } | null;
            return {
                id: String(row.id),
                scheduled_at: String(row.scheduled_at),
                status: (row.status as string) || null,
                property_name: property?.name || null,
                customer_name: lead?.customer_name || null,
            };
        });

        // Борлуулалт (manager_monthly_sales view — гэрээний нэрээр)
        const mine = byManager.get(targetName);
        const salesThisMonth = mine?.actuals[monthIdx] || 0;
        const salesThisYear = mine ? sumYear(mine.actuals) : 0;
        const contractCountThisYear = mine ? mine.counts.reduce((a, b) => a + b, 0) : 0;
        const revenueTrend = mine ? mine.actuals : Array(12).fill(0);

        // Зорилт: багийн төлөвлөгөө vs идэвхтэй менежерүүдийн гүйцэтгэл + миний хувь нэмэр
        const hasTeamTarget = sumYear(targets) > 0;
        let target = null;
        if (hasTeamTarget) {
            const activeNames = identity.rosterEmpty
                ? new Set(byManager.keys())
                : new Set(identity.roster.filter((r) => r.is_active).map((r) => r.name));
            const teamActuals = Array(12).fill(0);
            for (const [name, m] of byManager) {
                if (!activeNames.has(name)) continue;
                for (let i = 0; i < 12; i++) teamActuals[i] += m.actuals[i];
            }
            target = {
                year,
                month: monthIdx + 1,
                quarter,
                periods: {
                    month: { target: targets[monthIdx] || 0, actual: teamActuals[monthIdx] || 0 },
                    quarter: { target: sumQuarter(targets, quarter), actual: sumQuarter(teamActuals, quarter) },
                    year: { target: sumYear(targets), actual: sumYear(teamActuals) },
                },
                mine: {
                    month: salesThisMonth,
                    quarter: mine ? sumQuarter(mine.actuals, quarter) : 0,
                    year: salesThisYear,
                },
            };
        }

        const contracts = contractRows as { contract_status?: string; overdue_days?: number }[];
        const activeContracts = contracts.filter((c) => c.contract_status === 'active').length;
        const overdueContracts = contracts.filter(
            (c) => c.contract_status === 'active' && Number(c.overdue_days) > 0,
        ).length;

        const targetRoster =
            identity.roster.find((r) => r.name === targetName) || (isSelf ? identity.rosterEntry : null);

        return NextResponse.json({
            manager: {
                name: targetName,
                isSelf,
                inRoster: !!targetRoster,
                hasAccount: !!targetRoster?.user_id,
            },
            onboarding: false,
            period,
            kpis: {
                activeLeads: countActiveLeads(leads),
                newLeads: countLeadsCreatedSince(leads, periodStart),
                leadsByStatus: groupLeadsByStatus(leads),
                viewingsToday: countViewingsBetween(viewings, dayStart, dayEnd),
                viewingsThisWeek: countViewingsBetween(viewings, dayStart, weekEnd),
                activeContracts,
                overdueContracts,
                salesThisMonth,
                salesThisYear,
                contractCountThisYear,
            },
            target,
            tasks: buildTaskList(leads, viewings, now).slice(0, 10),
            recentLeads: leads.slice(0, 5),
            upcomingViewings: viewings
                .filter((v) => (!v.status || v.status === 'scheduled') && new Date(v.scheduled_at) >= now)
                .slice(0, 5),
            revenueTrend,
        });
    } catch (error) {
        return safeErrorResponse(error, 'Хувийн дашбоардын мэдээлэл унших алдаа');
    }
}

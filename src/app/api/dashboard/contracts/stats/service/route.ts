import { NextResponse } from 'next/server';
import { getUserShop } from '@/lib/auth/supabase-auth';
import { requireModule } from '@/lib/auth/require-permission';
import { supabaseAdmin } from '@/lib/supabase';
import { logger } from '@/lib/utils/logger';

// ============================================
// GET /api/dashboard/contracts/stats/service
// Customer Service KPI — нэг дор бүх тоо
// ============================================
export async function GET() {
    try {
        const denied = await requireModule('contracts');
        if (denied) return denied;
        const authShop = await getUserShop();
        if (!authShop) {
            return NextResponse.json({ stats: emptyKPI() });
        }

        const supabase = supabaseAdmin();
        const shopId = authShop.id;

        // 1. Гэрээний ерөнхий тоо
        const { data: contracts } = await supabase
            .from('property_contracts')
            .select('id, contract_status, balance, overdue_days, total_price, paid_amount')
            .eq('shop_id', shopId);

        const c = contracts || [];
        const activeContracts = c.filter(x => x.contract_status === 'active').length;
        const closedContracts = c.filter(x => x.contract_status === 'closed').length;
        const overdueContracts = c.filter(x => (x.overdue_days || 0) > 0);
        const totalOverdueAmount = overdueContracts.reduce((s, x) => s + (Number(x.balance) || 0), 0);
        const totalSales = c.reduce((s, x) => s + (Number(x.total_price) || 0), 0);
        const totalCollected = c.reduce((s, x) => s + (Number(x.paid_amount) || 0), 0);

        // 2. Үйлчилгээний хүсэлтүүд
        const { data: serviceLogs } = await supabase
            .from('service_logs')
            .select('id, status, type, satisfaction_rating, created_at, resolved_at')
            .eq('shop_id', shopId);

        const sl = serviceLogs || [];
        const openRequests = sl.filter(x => x.status === 'open' || x.status === 'in_progress').length;
        const resolvedRequests = sl.filter(x => x.status === 'resolved' || x.status === 'closed').length;
        const openComplaints = sl.filter(x => x.type === 'complaint' && (x.status === 'open' || x.status === 'in_progress')).length;
        const suggestionsCount = sl.filter(x => x.type === 'suggestion').length;

        // Дундаж шийдвэрлэх хугацаа (цаг)
        const resolvedWithTime = sl.filter(x => x.resolved_at && x.created_at);
        let avgResolutionHours: number | null = null;
        if (resolvedWithTime.length > 0) {
            const totalHours = resolvedWithTime.reduce((sum, x) => {
                const diff = new Date(x.resolved_at!).getTime() - new Date(x.created_at).getTime();
                return sum + diff / (1000 * 60 * 60);
            }, 0);
            avgResolutionHours = Math.round(totalHours / resolvedWithTime.length);
        }

        // Дундаж сэтгэл ханамж
        const rated = sl.filter(x => x.satisfaction_rating);
        const avgServiceRating = rated.length > 0
            ? Math.round((rated.reduce((s, x) => s + (x.satisfaction_rating || 0), 0) / rated.length) * 10) / 10
            : null;

        // 3. NPS / CSAT — бодит судалгааны хариултаас (surveys + survey_responses, 1-5 rating).
        //    (Хуучин satisfaction_surveys хүснэгт хоосон тул үргэлж '—' гардаг байсан.)
        const [{ data: surveyDefs }, { data: surveyResp }] = await Promise.all([
            supabase.from('surveys').select('id, questions').eq('shop_id', shopId),
            supabase.from('survey_responses').select('answers').eq('shop_id', shopId),
        ]);

        // rating төрлийн асуултын id-уудыг цуглуулна
        const ratingQIds = new Set<string>();
        for (const s of surveyDefs || []) {
            const qs = (s.questions as Array<{ id?: string; type?: string }> | null) || [];
            for (const q of qs) {
                if (q?.type === 'rating' && q?.id) ratingQIds.add(String(q.id));
            }
        }
        // бүх rating хариулт (1-5)
        const ratings: number[] = [];
        for (const r of surveyResp || []) {
            const ans = (r.answers || {}) as Record<string, unknown>;
            for (const qid of ratingQIds) {
                const n = Number(ans[qid]);
                if (Number.isFinite(n) && n >= 1 && n <= 5) ratings.push(n);
            }
        }
        let nps: number | null = null;
        let avgCsat: number | null = null;
        if (ratings.length > 0) {
            // 1-5 шатлалаас: 5 = сурталчлагч, 4 = идэвхгүй, ≤3 = шүүмжлэгч
            const promoters = ratings.filter(n => n >= 5).length;
            const detractors = ratings.filter(n => n <= 3).length;
            nps = Math.round(((promoters - detractors) / ratings.length) * 100);
            avgCsat = Math.round((ratings.reduce((a, b) => a + b, 0) / ratings.length) * 10) / 10;
        }
        const totalSurveys = (surveyResp || []).length;

        // 4. Төлбөрийн хуваарь
        const { data: payments } = await supabase
            .from('payment_schedules')
            .select('id, status, due_date, amount')
            .eq('shop_id', shopId);

        const pm = payments || [];
        const overduePayments = pm.filter(x => x.status === 'overdue').length;
        const upcomingPayments = pm.filter(x => {
            if (x.status !== 'pending' && x.status !== 'partial') return false;
            const due = new Date(x.due_date);
            const now = new Date();
            const diffDays = (due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
            return diffDays >= 0 && diffDays <= 7;
        }).length;

        return NextResponse.json({
            stats: {
                // Гэрээ
                total_contracts: c.length,
                active_contracts: activeContracts,
                closed_contracts: closedContracts,
                total_sales: totalSales,
                total_collected: totalCollected,
                collection_rate: totalSales > 0 ? Math.round((totalCollected / totalSales) * 100) : 0,

                // Хоцрогдол
                overdue_contract_count: overdueContracts.length,
                total_overdue_amount: totalOverdueAmount,

                // Санал гомдол
                open_requests: openRequests,
                resolved_requests: resolvedRequests,
                total_requests: sl.length,
                open_complaints: openComplaints,
                suggestions_count: suggestionsCount,
                avg_resolution_hours: avgResolutionHours,
                avg_service_rating: avgServiceRating,

                // Сэтгэл ханамж
                nps,
                avg_csat: avgCsat,
                total_surveys: totalSurveys,

                // Төлбөрийн хуваарь
                overdue_payments: overduePayments,
                upcoming_payments_7d: upcomingPayments,
            },
        });
    } catch (error) {
        logger.error('[Service Stats API] GET error:', { error });
        return NextResponse.json(
            { error: 'KPI татахад алдаа гарлаа', stats: emptyKPI() },
            { status: 500 }
        );
    }
}

function emptyKPI() {
    return {
        total_contracts: 0, active_contracts: 0, closed_contracts: 0,
        total_sales: 0, total_collected: 0, collection_rate: 0,
        overdue_contract_count: 0, total_overdue_amount: 0,
        open_requests: 0, resolved_requests: 0, total_requests: 0,
        open_complaints: 0, suggestions_count: 0,
        avg_resolution_hours: null, avg_service_rating: null,
        nps: null, avg_csat: null, total_surveys: 0,
        overdue_payments: 0, upcoming_payments_7d: 0,
    };
}

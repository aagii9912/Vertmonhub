import { NextResponse } from 'next/server';
import { getUserShop } from '@/lib/auth/supabase-auth';
import { requireModule } from '@/lib/auth/require-permission';
import { supabaseAdmin } from '@/lib/supabase';
import { logger } from '@/lib/utils/logger';

function monthKey(d: string | null): string | null {
    if (!d) return null;
    return d.slice(0, 7); // YYYY-MM
}

function lastMonths(n: number): string[] {
    const out: string[] = [];
    const now = new Date();
    for (let i = n - 1; i >= 0; i--) {
        const dt = new Date(now.getFullYear(), now.getMonth() - i, 1);
        out.push(`${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`);
    }
    return out;
}

function agingBuckets(items: Array<{ outstanding: number; due_date: string | null }>) {
    const b = { current: 0, d1_30: 0, d31_60: 0, d61_90: 0, d90_plus: 0, total: 0 };
    const now = Date.now();
    for (const it of items) {
        if (it.outstanding <= 0) continue;
        b.total += it.outstanding;
        if (!it.due_date) { b.current += it.outstanding; continue; }
        const days = Math.floor((now - new Date(it.due_date).getTime()) / 86400000);
        if (days <= 0) b.current += it.outstanding;
        else if (days <= 30) b.d1_30 += it.outstanding;
        else if (days <= 60) b.d31_60 += it.outstanding;
        else if (days <= 90) b.d61_90 += it.outstanding;
        else b.d90_plus += it.outstanding;
    }
    return b;
}

/**
 * GET /api/dashboard/finance/reports — P&L, мөнгөн урсгал, НӨАТ, AR/AP aging нэг дор.
 */
export async function GET() {
    try {
        const denied = await requireModule('finance');
        if (denied) return denied;
        const authShop = await getUserShop();
        if (!authShop) return NextResponse.json({ reports: null });

        const supabase = supabaseAdmin();
        const shopId = authShop.id;
        const months = lastMonths(6);
        const horizonIso = new Date(Date.now() - 200 * 86400000).toISOString().slice(0, 10);

        const [{ data: contracts }, { data: bills }, { data: schedules }, { data: txns }] = await Promise.all([
            supabase.from('property_contracts')
                .select('total_price, vat_amount, sales_channel, contract_date, contract_status')
                .eq('shop_id', shopId),
            supabase.from('vendor_bills')
                .select('total_amount, paid_amount, vat_amount, bill_date, due_date, status')
                .eq('shop_id', shopId),
            supabase.from('payment_schedules')
                .select('amount, paid_amount, due_date, status')
                .eq('shop_id', shopId)
                .in('status', ['pending', 'partial', 'overdue']),
            supabase.from('finance_transactions')
                .select('type, amount, txn_date')
                .eq('shop_id', shopId)
                .gte('txn_date', horizonIso),
        ]);

        const activeContracts = (contracts || []).filter(c => c.contract_status !== 'cancelled');
        const activeBills = (bills || []).filter(b => b.status !== 'cancelled');

        // ---- P&L ----
        const totalIncome = activeContracts.reduce((s, c) => s + (Number(c.total_price) || 0), 0);
        const totalExpense = activeBills.reduce((s, b) => s + (Number(b.total_amount) || 0), 0);
        const netProfit = totalIncome - totalExpense;
        const marginPct = totalIncome > 0 ? Math.round((netProfit / totalIncome) * 100) : 0;

        const byChannelMap = new Map<string, number>();
        for (const c of activeContracts) {
            const ch = c.sales_channel || 'Бусад';
            byChannelMap.set(ch, (byChannelMap.get(ch) || 0) + (Number(c.total_price) || 0));
        }
        const byChannel = Array.from(byChannelMap.entries())
            .map(([channel, revenue]) => ({ channel, revenue }))
            .sort((a, b) => b.revenue - a.revenue);

        // ---- Cash flow (сүүлийн 6 сар) ----
        const cfMap = new Map<string, { receipts: number; disbursements: number }>();
        months.forEach(m => cfMap.set(m, { receipts: 0, disbursements: 0 }));
        for (const t of txns || []) {
            const m = monthKey(t.txn_date);
            if (!m || !cfMap.has(m)) continue;
            const row = cfMap.get(m)!;
            if (t.type === 'receipt') row.receipts += Number(t.amount) || 0;
            else row.disbursements += Number(t.amount) || 0;
        }
        const cashflow = months.map(m => ({
            month: m,
            receipts: cfMap.get(m)!.receipts,
            disbursements: cfMap.get(m)!.disbursements,
            net: cfMap.get(m)!.receipts - cfMap.get(m)!.disbursements,
        }));
        const forecastAR = (schedules || []).reduce((s, p) => s + Math.max(0, (Number(p.amount) || 0) - (Number(p.paid_amount) || 0)), 0);
        const forecastAP = activeBills.reduce((s, b) => s + Math.max(0, (Number(b.total_amount) || 0) - (Number(b.paid_amount) || 0)), 0);

        // ---- VAT (НӨАТ) ----
        const outputVat = activeContracts.reduce((s, c) => s + (Number(c.vat_amount) || 0), 0);
        const inputVat = activeBills.reduce((s, b) => s + (Number(b.vat_amount) || 0), 0);
        const vat = { outputVat, inputVat, netVat: outputVat - inputVat };

        // ---- Aging (AR + AP) ----
        const arItems = (schedules || []).map(p => ({
            outstanding: (Number(p.amount) || 0) - (Number(p.paid_amount) || 0),
            due_date: p.due_date,
        }));
        const apItems = activeBills
            .filter(b => b.status !== 'paid')
            .map(b => ({
                outstanding: (Number(b.total_amount) || 0) - (Number(b.paid_amount) || 0),
                due_date: b.due_date,
            }));

        return NextResponse.json({
            reports: {
                pnl: { totalIncome, totalExpense, netProfit, marginPct, byChannel },
                cashflow: { months: cashflow, forecastAR, forecastAP },
                vat,
                aging: { ar: agingBuckets(arItems), ap: agingBuckets(apItems) },
            },
        });
    } catch (error) {
        logger.error('[Finance Reports] error', { error });
        return NextResponse.json({ error: 'Тайлан татахад алдаа гарлаа' }, { status: 500 });
    }
}

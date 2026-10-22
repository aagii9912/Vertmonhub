import Link from 'next/link';
import { ArrowUpRight } from 'lucide-react';
import { Money } from '@/components/ui/Money';
import { isMonthlySalesCount, MONTHLY_SALES_LABELS, MONTHLY_SALES_METRICS, monthlySalesAttainment, type MonthlySalesField } from '@/lib/sales/monthly';
import type { MonthlyPerformance } from '@/lib/dashboard/operations-report';

export function MonthlySalesPerformance({ data }: { data: MonthlyPerformance }) {
    const metrics = MONTHLY_SALES_METRICS.filter(metric => data.cashflowVisible || metric.key !== 'cashflow');
    const pct = (actual: number | null, plan: number | null) => {
        const value = monthlySalesAttainment(actual, plan);
        return value === null ? '—' : `${value}%`;
    };
    const value = (field: MonthlySalesField, amount: number | null) => amount === null ? <span className="text-muted-foreground">Оруулаагүй</span>
        : isMonthlySalesCount(field) ? amount.toLocaleString('en-US') : <Money value={amount} />;
    return <section className="overflow-hidden rounded-md border border-border bg-surface">
        <div className="border-b border-border p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-sm font-semibold">Сарын төлөвлөгөө ба гүйцэтгэл</h2>
                <Link href="/dashboard/reports/plan" className="inline-flex items-center gap-1 text-xs text-brand-strong hover:underline print:hidden">Блокоор дэлгэрэнгүй<ArrowUpRight className="size-3.5" /></Link>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">Гүйцэтгэл нь удирдлагын гараар оруулсан тоо, дүн. Доорх системийн бүртгэлийн дүнтэй нэмж нийлүүлэхгүй. Хоосон нүд — оруулаагүй; 0 — тэг.</p>
        </div>
        {!data.completeMonths ? <p className="p-3 text-sm text-muted-foreground">Сарын мэдээллийг харьцуулахдаа бүтэн сар сонгоно уу.</p> :
            <div className="overflow-x-auto"><table className="w-full text-sm">
                <thead><tr className="border-b border-border bg-surface-2 text-xs text-muted-foreground">
                    <th className="p-3 text-left font-medium">Сар</th>
                    {metrics.map(metric => [
                        <th key={metric.plan} className="p-3 text-right font-medium">{MONTHLY_SALES_LABELS[metric.plan]}</th>,
                        <th key={metric.actual} className="p-3 text-right font-medium">{MONTHLY_SALES_LABELS[metric.actual]}</th>,
                        <th key={`${metric.key}-pct`} className="p-3 text-right font-medium">Хувь</th>,
                    ])}
                </tr></thead>
                <tbody>{data.months.map(row => <tr key={`${row.year}-${row.month}`} className="border-b border-border last:border-0">
                    <th className="whitespace-nowrap p-3 text-left font-medium num">{row.year} · {row.month}-р сар</th>
                    {metrics.map(metric => [
                        <td key={metric.plan} className="p-3 text-right num">{value(metric.plan, row[metric.plan])}</td>,
                        <td key={metric.actual} className="p-3 text-right num">{value(metric.actual, row[metric.actual])}</td>,
                        <td key={`${metric.key}-pct`} className="p-3 text-right num">{pct(row[metric.actual], row[metric.plan])}</td>,
                    ])}
                </tr>)}</tbody>
            </table></div>}
        {!data.cashflowVisible && <p className="p-3 text-xs text-muted-foreground">Орсон мөнгөний дүн харахад санхүүгийн эрх шаардлагатай.</p>}
    </section>;
}

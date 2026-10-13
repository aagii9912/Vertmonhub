import { Money } from '@/components/ui/Money';
import { formatMonthlySalesValue, isMonthlySalesCount, monthlySalesAttainment, type MonthlySalesField } from '@/lib/sales/monthly';
import type { MonthlyPerformance } from '@/lib/dashboard/operations-report';

const GROUPS: { label: string; plan: MonthlySalesField; actual: MonthlySalesField; cash?: true }[] = [
    { label: 'Гэрээний тоо', plan: 'target_count', actual: 'manual_contract_actual_count' },
    { label: 'Гэрээний дүн', plan: 'target_amount', actual: 'manual_contract_actual_amount' },
    { label: 'Орсон мөнгө', plan: 'cashflow_target_amount', actual: 'manual_cashflow_actual_amount', cash: true },
];

export function MonthlySalesPerformance({ data }: { data: MonthlyPerformance }) {
    const groups = GROUPS.filter(group => data.cashflowVisible || !group.cash);
    const pct = (actual: number | null, plan: number | null) => {
        const value = monthlySalesAttainment(actual, plan);
        return value === null ? '—' : `${value}%`;
    };
    const value = (field: MonthlySalesField, amount: number | null) => amount === null
        ? <span className="text-muted-foreground">Оруулаагүй</span>
        : isMonthlySalesCount(field) ? formatMonthlySalesValue(field, amount) : <Money value={amount} />;
    return <section className="overflow-hidden rounded-md border border-border bg-surface">
        <div className="border-b border-border p-3">
            <h2 className="text-sm font-semibold">Сарын төлөвлөгөө ба гүйцэтгэл</h2>
            <p className="mt-1 text-xs text-muted-foreground">Гүйцэтгэл нь удирдлагын гараар оруулсан тоо, дүн. Доорх системийн бүртгэлтэй нэмж нийлүүлэхгүй. Хоосон нүд — оруулаагүй; 0 — тэг.</p>
        </div>
        {!data.completeMonths ? <p className="p-3 text-sm text-muted-foreground">Сарын мэдээллийг харьцуулахдаа бүтэн сар сонгоно уу.</p> :
            <div className="overflow-x-auto"><table className="w-full text-sm">
                <thead className="bg-surface-2 text-xs text-muted-foreground">
                    <tr className="border-b border-border">
                        <th rowSpan={2} scope="col" className="p-3 text-left font-medium">Сар</th>
                        {groups.map(group => <th key={group.label} colSpan={3} scope="colgroup" className="border-l border-border px-3 pt-3 pb-1 text-center font-semibold text-foreground">{group.label}</th>)}
                    </tr>
                    <tr className="border-b border-border">
                        {groups.flatMap(group => ['Төлөвлөгөө', 'Гүйцэтгэл', 'Биелэлт'].map((label, index) =>
                            <th key={`${group.label}-${label}`} scope="col" className={`px-3 pt-1 pb-3 text-right font-medium ${index === 0 ? 'border-l border-border' : ''}`}>{label}</th>))}
                    </tr>
                </thead>
                <tbody>{data.months.map(row => <tr key={`${row.year}-${row.month}`} className="border-b border-border last:border-0">
                    <th scope="row" className="whitespace-nowrap p-3 text-left font-medium num">{row.year} · {row.month}-р сар</th>
                    {groups.map(group => [
                        <td key={group.plan} className="border-l border-border p-3 text-right num">{value(group.plan, row[group.plan])}</td>,
                        <td key={group.actual} className="p-3 text-right num">{value(group.actual, row[group.actual])}</td>,
                        <td key={`${group.label}-pct`} className="p-3 text-right num">{pct(row[group.actual], row[group.plan])}</td>,
                    ])}
                </tr>)}</tbody>
            </table></div>}
        {!data.cashflowVisible && <p className="p-3 text-xs text-muted-foreground">Орсон мөнгөний дүн харахад санхүүгийн эрх шаардлагатай.</p>}
    </section>;
}

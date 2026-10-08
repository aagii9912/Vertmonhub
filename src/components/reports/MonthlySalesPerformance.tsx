import { Money } from '@/components/ui/Money';
import { MONTHLY_SALES_FIELDS, MONTHLY_SALES_LABELS, monthlySalesAttainment } from '@/lib/sales/monthly';
import type { MonthlyPerformance } from '@/lib/dashboard/operations-report';

export function MonthlySalesPerformance({ data }: { data: MonthlyPerformance }) {
    const fields = MONTHLY_SALES_FIELDS.filter(field => data.cashflowVisible || !field.includes('cashflow'));
    const pct = (actual: number | null, plan: number | null) => {
        const value = monthlySalesAttainment(actual, plan);
        return value === null ? '—' : `${value}%`;
    };
    return <section className="overflow-hidden rounded-md border border-border bg-surface">
        <div className="border-b border-border p-3">
            <h2 className="text-sm font-semibold">Сарын төлөвлөгөө ба гүйцэтгэл</h2>
            <p className="mt-1 text-xs text-muted-foreground">Гүйцэтгэл нь удирдлагын гараар оруулсан дүн. Доорх системийн бүртгэлийн дүнтэй нэмж нийлүүлэхгүй. Хоосон нүд — оруулаагүй; 0 — тэг дүн.</p>
        </div>
        {!data.completeMonths ? <p className="p-3 text-sm text-muted-foreground">Сарын мэдээллийг харьцуулахдаа бүтэн сар сонгоно уу.</p> :
            <div className="overflow-x-auto"><table className="w-full text-sm">
                <thead><tr className="border-b border-border bg-surface-2 text-xs text-muted-foreground">
                    <th className="p-3 text-left font-medium">Сар</th>
                    {fields.map(field => <th key={field} className="p-3 text-right font-medium">{MONTHLY_SALES_LABELS[field]}</th>)}
                    <th className="p-3 text-right font-medium">Гэрээний биелэлт</th>
                    {data.cashflowVisible && <th className="p-3 text-right font-medium">Орсон мөнгөний биелэлт</th>}
                </tr></thead>
                <tbody>{data.months.map(row => <tr key={`${row.year}-${row.month}`} className="border-b border-border last:border-0">
                    <th className="whitespace-nowrap p-3 text-left font-medium num">{row.year} · {row.month}-р сар</th>
                    {fields.map(field => <td key={field} className="p-3 text-right num">{row[field] === null ? <span className="text-muted-foreground">Оруулаагүй</span> : <Money value={row[field]} />}</td>)}
                    <td className="p-3 text-right num">{pct(row.manual_contract_actual_amount, row.target_amount)}</td>
                    {data.cashflowVisible && <td className="p-3 text-right num">{pct(row.manual_cashflow_actual_amount, row.cashflow_target_amount)}</td>}
                </tr>)}</tbody>
            </table></div>}
        {!data.cashflowVisible && <p className="p-3 text-xs text-muted-foreground">Орсон мөнгөний дүн харахад санхүүгийн эрх шаардлагатай.</p>}
    </section>;
}

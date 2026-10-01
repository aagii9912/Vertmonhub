import { buildDepartmentKpis, formatDepartmentKpiEvidence } from '@/lib/marketing/department-kpi';
import type { MarketingPerformance } from '@/lib/marketing/performance';

export function DepartmentKpis({ report }: { report: MarketingPerformance }) {
    const department = buildDepartmentKpis(report);
    return <section aria-label="Маркетингийн албаны KPI" className="space-y-4">
        <div className="rounded-xl border border-border bg-surface-2 p-4">
            <h2 className="text-base font-semibold">Албаны KPI · 6 шалгуур</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{department.basis}</p>
            <p className="mt-2 text-xs text-muted-foreground">Эх сурвалж: {department.source.name} · {department.source.version}</p>
        </div>
        <div className="grid items-start gap-4 md:grid-cols-2 xl:grid-cols-3">
            {department.categories.map(category => <article key={category.id} className="min-w-0 rounded-xl border border-border p-4">
                <div className="flex items-start justify-between gap-3">
                    <h3 className="text-sm font-semibold">{category.title}</h3>
                    <span className="shrink-0 rounded-md bg-surface-2 px-2 py-1 text-xs font-medium tabular-nums">Жин {category.weight}%</span>
                </div>
                <dl className="mt-4 divide-y divide-border">
                    {category.evidence.map(evidence => <div key={evidence.key} className="py-2.5 first:pt-0">
                        <div className="flex items-start justify-between gap-3">
                            <dt className="min-w-0 text-sm">{evidence.label}</dt>
                            <dd className="shrink-0 text-right text-sm font-semibold tabular-nums">{formatDepartmentKpiEvidence(evidence)}</dd>
                        </div>
                        <dd className="mt-1 text-xs leading-relaxed text-muted-foreground">{evidence.note}</dd>
                    </div>)}
                </dl>
                <details className="mt-3 border-t border-border pt-3 text-xs text-muted-foreground print:[&>div]:block">
                    <summary className="cursor-pointer font-medium focus-ring">Тохируулах шалгуур · {category.gaps.length}</summary>
                    <div className="mt-2 space-y-2 leading-relaxed">{category.gaps.map(gap => <p key={gap}>{gap}</p>)}</div>
                </details>
            </article>)}
        </div>
        <p className="text-xs text-muted-foreground">— = үнэлгээний шалгуур, зорилт эсвэл тооцох бүртгэл дутуу. Жинг бодит гүйцэтгэлийн хувь гэж тайлбарлахгүй.</p>
    </section>;
}

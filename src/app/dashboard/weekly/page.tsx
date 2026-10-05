'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowUpRight, Check, ChevronLeft, ChevronRight, ClipboardCopy, FileText, Maximize2, Plus, Printer, RefreshCw, Sparkles, X } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { useMyTasks, type UserTask } from '@/hooks/useMyTasks';
import { dashboardJson, dashboardMutate } from '@/lib/api/dashboardFetch';
import { openAiPanel } from '@/lib/ai/context';
import { openQuickCreate } from '@/lib/navigation/commandPalette';
import { formatMNTShort } from '@/lib/utils/currency';
import { formatTime, ubDateStr } from '@/lib/utils/date';
import { cn } from '@/lib/utils';
import { type OperationsReport } from '@/lib/dashboard/operations-report';
import { type MarketingPerformance } from '@/lib/marketing/performance';
import { formatReviewChange, formatWeeklyReview, meetingDateSchema, nextMeetingDate, shiftReviewDate, weeklyDiscussionItems, weeklyReviewRange, type WeeklyUpdate, type WeeklyUpdatesData } from '@/lib/dashboard/weekly-review';
import { PerformanceKpis, PerformanceChannelTable } from '@/components/marketing/PerformanceKpis';
import { Button } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Alert';
import { Avatar, Skeleton } from '@/components/dashboard/v2/primitives';
import { useWeeklySales, WeeklySalesDetails } from '@/components/weekly/WeeklySalesDetails';
import { WeeklyMarketingBudget } from '@/components/weekly/WeeklyMarketingBudget';
import { WeeklyMarketingChannels } from '@/components/weekly/WeeklyMarketingChannels';

export default function WeeklyReviewPage() {
    const { shop, user } = useAuth();
    // Байгууллага/хэрэглэгч солиход өмнөх бичвэр, тайланг авч үлдэхгүй.
    return <WeeklyReview key={`${shop?.id}:${user?.id}`} />;
}

function WeeklyReview() {
    const { shop, user } = useAuth();
    const [meetingDate, setMeetingDate] = useState(() => nextMeetingDate());
    const [dirty, setDirty] = useState(false);
    const reportRef = useRef<HTMLElement>(null);
    const range = weeklyReviewRange(meetingDate);
    const previousRange = weeklyReviewRange(shiftReviewDate(meetingDate, -7));
    const can = (module: string) => !!user && (user.role === 'super_admin' || user.permissions.modules.includes(module));
    const canWrite = user?.role === 'super_admin' || !!user?.permissions.canWrite;
    const params = new URLSearchParams(range);
    const salesQuery = useQuery<OperationsReport>({
        queryKey: ['operations-report', shop?.id, range.from, range.to, user?.id, can('finance')],
        queryFn: ({ signal }) => dashboardJson(`/api/dashboard/reports/operations?${params}`, { signal, shopId: shop?.id }),
        enabled: !!shop?.id && can('reports'), staleTime: 60_000, retry: 1,
    });
    const previousSalesQuery = useQuery<OperationsReport>({
        queryKey: ['operations-report', shop?.id, previousRange.from, previousRange.to, user?.id, can('finance')],
        queryFn: ({ signal }) => dashboardJson(`/api/dashboard/reports/operations?${new URLSearchParams(previousRange)}`, { signal, shopId: shop?.id }),
        enabled: !!shop?.id && can('reports'), staleTime: 60_000, retry: 1,
    });
    const marketingQuery = useQuery<MarketingPerformance>({
        queryKey: ['marketing-performance', 'weekly', shop?.id, user?.id, range.from, range.to],
        queryFn: async ({ signal }) => (await dashboardJson<{ report: MarketingPerformance }>(`/api/marketing/performance?${params}`, { signal, shopId: shop?.id })).report,
        enabled: !!shop?.id && can('marketing-roi'), staleTime: 60_000, retry: 1,
    });
    const updatesQuery = useQuery<WeeklyUpdatesData>({
        queryKey: ['weekly-updates', shop?.id, user?.id, meetingDate, can('reports')],
        queryFn: ({ signal }) => dashboardJson(`/api/dashboard/weekly-updates?meetingDate=${meetingDate}`, { signal, shopId: shop?.id }),
        enabled: !!shop?.id, staleTime: 30_000, retry: 1,
    });
    const weeklySalesQuery = useWeeklySales(meetingDate, can('reports'));
    const tasksQuery = useMyTasks();
    const sales = can('reports') && !salesQuery.isError ? salesQuery.data : undefined;
    const previousSales = can('reports') && !previousSalesQuery.isError ? previousSalesQuery.data : undefined;
    const marketing = can('marketing-roi') && !marketingQuery.isError ? marketingQuery.data : undefined;
    const updates = updatesQuery.isError ? undefined : updatesQuery.data;
    const completedTasks = (tasksQuery.data?.tasks || []).filter(task => task.status === 'done' && task.completed_at && ubDateStr(new Date(task.completed_at)) >= range.from && ubDateStr(new Date(task.completed_at)) <= range.to);
    const weeklySales = can('reports') && !weeklySalesQuery.isError ? weeklySalesQuery.data : undefined;
    const loading = salesQuery.isFetching || previousSalesQuery.isFetching || marketingQuery.isFetching || updatesQuery.isFetching || weeklySalesQuery.isFetching;
    const notices = [
        ...(range.to >= ubDateStr() ? ['Тайлант хугацаа дуусаагүй. Одоогоор бүртгэсэн мэдээллийг харуулж байна.'] : []),
        ...(!can('reports') ? ['Борлуулалтын нэгдсэн тоонд тайлангийн эрх шаардлагатай.'] : salesQuery.error ? [`Борлуулалт: ${salesQuery.error.message}`] : []),
        ...(can('reports') && previousSalesQuery.error ? [`Өмнөх борлуулалтын харьцуулалт боломжгүй: ${previousSalesQuery.error.message}`] : []),
        ...(can('reports') && weeklySalesQuery.error ? [`Гэрээ, үлдэгдлийн дэлгэрэнгүй: ${weeklySalesQuery.error.message}`] : []),
        ...(!can('marketing-roi') ? ['Маркетингийн үзүүлэлтэд маркетингийн эрх шаардлагатай.'] : marketingQuery.error ? [`Маркетинг: ${marketingQuery.error.message}`] : []),
        ...(updatesQuery.error ? [`Ажлын шинэчлэл: ${updatesQuery.error.message}`] : []),
        ...(!updatesQuery.data?.canViewTeam ? ['Ажлын шинэчлэл: зөвхөн миний оруулсан мэдээлэл.'] : []),
    ];
    const discussionItems = weeklyDiscussionItems({ sales, marketing, updates: updates?.updates });
    const text = formatWeeklyReview({ shopName: shop?.name || 'Vertmon Hub', meetingDate, sales, previousSales, weeklySales, marketing, updates: updates?.updates, notices });
    const exportable = !loading && !dirty && !!(sales || marketing || updates);
    const refresh = () => {
        if (can('reports')) { void salesQuery.refetch(); void previousSalesQuery.refetch(); void weeklySalesQuery.refetch(); }
        if (can('marketing-roi')) void marketingQuery.refetch();
        void updatesQuery.refetch();
    };

    async function copy() {
        try { await navigator.clipboard.writeText(text); toast.success('Хурлын тайлан хууллаа'); }
        catch { toast.error('Хуулж чадсангүй. PDF / хэвлэх үйлдлийг ашиглана уу.'); }
    }

    return (
        <div className="mx-auto max-w-[1240px] space-y-7">
            <header className="flex flex-wrap items-start justify-between gap-4 print:hidden">
                <div>
                    <p className="mb-2 text-xs text-muted-foreground">Долоо хоногийн ажлын хэмнэл</p>
                    <h1 className="text-[28px] font-semibold tracking-tight sm:text-[32px]">Лхагва гарагийн хурал</h1>
                    <p className="mt-2 text-sm text-muted-foreground">Тоон үзүүлэлт, багийн явц, дараагийн алхам. Нэг дор.</p>
                </div>
                <Button variant="secondary" onClick={refresh} disabled={loading || dirty}><RefreshCw className={cn('size-4', loading && 'animate-spin')} />Шинэчлэх</Button>
            </header>

            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border pb-5 print:hidden">
                <div className="flex items-center gap-2">
                    <Button variant="ghost" size="icon" aria-label="Өмнөх хурал" disabled={dirty} onClick={() => setMeetingDate(shiftReviewDate(meetingDate, -7))}><ChevronLeft /></Button>
                    <label className="text-xs text-muted-foreground">Хурлын өдөр
                        <input type="date" value={meetingDate} disabled={dirty} aria-label="Хурлын өдөр" onChange={event => {
                            const parsed = meetingDateSchema.safeParse(event.target.value);
                            if (parsed.success) setMeetingDate(parsed.data);
                            else toast.error('Лхагва гарагийн огноо сонгоно уу.');
                        }} className="mt-1 block rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground focus-ring" />
                    </label>
                    <Button variant="ghost" size="icon" aria-label="Дараагийн хурал" disabled={dirty} onClick={() => setMeetingDate(shiftReviewDate(meetingDate, 7))}><ChevronRight /></Button>
                </div>
                <div className="flex flex-wrap gap-2">
                    <Button variant="ghost" disabled={!exportable} onClick={copy}><ClipboardCopy />Хуулах</Button>
                    <Button variant="secondary" disabled={!exportable} onClick={() => void reportRef.current?.requestFullscreen?.().catch(() => toast.error('Бүтэн дэлгэц нээгдсэнгүй. PDF / хэвлэх үйлдлийг ашиглана уу.'))}><Maximize2 />Танилцуулах</Button>
                    <Button disabled={!exportable} className="bg-foreground text-background hover:bg-fg-2" onClick={() => window.print()}><Printer />PDF / хэвлэх</Button>
                </div>
            </div>
            <a href="#weekly-update" className="flex min-h-11 items-center justify-center gap-2 rounded-xl bg-surface-2 text-sm font-medium focus-ring xl:hidden print:hidden"><FileText className="size-4" />Миний шинэчлэл оруулах<ArrowUpRight className="size-4" /></a>

            <div className="grid items-start gap-8 xl:grid-cols-[minmax(0,1fr)_340px] print:block">
                <article ref={reportRef} className="weekly-report min-w-0 space-y-8 bg-background">
                    <header className="flex items-start justify-between gap-3">
                        <div>
                            <p className="text-xs font-medium text-muted-foreground">{shop?.name} · Хурлын тайлан</p>
                            <h2 className="mt-1 text-xl font-semibold tracking-tight">{range.from} — {range.to}</h2>
                            <p className="mt-1 text-xs text-muted-foreground">Улаанбаатарын цагаар · Хурал: {meetingDate}</p>
                            <p className="mt-1 text-xs text-muted-foreground">Харьцуулалт: {previousRange.from} — {previousRange.to}</p>
                        </div>
                        <Button variant="ghost" size="icon" className="fullscreen-exit" aria-label="Танилцуулгыг хаах" onClick={() => void document.exitFullscreen()}><X /></Button>
                    </header>
                    {notices.length > 0 && <div role="status" className="space-y-1 rounded-xl bg-surface-2 px-4 py-3 text-xs leading-relaxed text-fg-2">{notices.map(notice => <p key={notice}>{notice}</p>)}</div>}

                    <section className="break-inside-avoid space-y-3 rounded-2xl bg-surface-2 p-5">
                        <h2 className="text-base font-semibold">Энэ хурлаар шийдэх</h2>
                        {loading ? <p className="text-sm text-muted-foreground">Хэлэлцэх асуудлыг нэгтгэж байна…</p> : discussionItems.length ? <ul className="space-y-3">{discussionItems.map((item, index) => <li key={index} className="text-sm">
                            {item.href && can('leads') ? <Link href={item.href} className="font-medium hover:underline focus-ring">{item.title}<ArrowUpRight className="ml-1 inline size-3.5 print:hidden" /></Link> : <p className="font-medium">{item.title}</p>}
                            <p className="mt-1 whitespace-pre-wrap break-words text-fg-2">{item.detail}</p>
                        </li>)}</ul> : <p className="text-sm text-muted-foreground">Хадгалсан мэдээллээс хэлэлцэх асуудал илрээгүй.</p>}
                        <p className="text-xs text-muted-foreground">Лидийн ажлын дараалал нь одоогийн төлөв. Ангиллууд давхцаж болно.</p>
                    </section>

                    <section className="break-inside-avoid space-y-4">
                        <ReportHeading number="01" title="Борлуулалтын тойм" href={can('reports') ? `/dashboard/reports/operations?${params}` : undefined} />
                        {salesQuery.isPending && can('reports') ? <Skeleton className="h-32" /> : sales ? <>
                            <div className="grid grid-cols-2 gap-5 rounded-2xl border border-border p-5">
                                <Metric label="Шинэ лид" value={sales.leads.newCount} helper={formatReviewChange(sales.leads.newCount, previousSales?.leads.newCount)} />
                                <Metric label="Байгуулсан гэрээ" value={sales.contracts.count} helper={formatReviewChange(sales.contracts.count, previousSales?.contracts.count)} />
                                <Metric label="Гэрээний бүртгэлтэй дүн" value={formatMNTShort(sales.contracts.value)} helper={previousSales ? `Өмнөх ${formatMNTShort(previousSales.contracts.value)}${previousSales.contracts.missingAmounts ? ' · дүн дутуу' : ''}` : 'Өмнөх хугацааны мэдээлэл байхгүй'} />
                                <Metric label="Болсон уулзалт" value={sales.meetings?.completed ?? '—'} helper={sales.meetings ? formatReviewChange(sales.meetings.completed, previousSales?.meetings?.completed) : 'Уулзалтын мэдээлэл байхгүй'} />
                            </div>
                            {sales.meetings && <div className="space-y-3 rounded-2xl border border-border p-5">
                                <h3 className="text-sm font-medium">Болсон уулзалтын төрөл</h3>
                                <div className="grid grid-cols-3 gap-4 text-sm">
                                    <Metric label="Шинэ харилцагч" value={sales.meetings.classificationAvailable ? sales.meetings.newCustomer : '—'} />
                                    <Metric label="Давтан уулзалт" value={sales.meetings.classificationAvailable ? sales.meetings.repeatCustomer : '—'} />
                                    <Metric label="Гэрээтэй захиалагч" value={sales.meetings.classificationAvailable ? sales.meetings.existingBuyer : '—'} />
                                </div>
                                <p className="text-xs leading-relaxed text-muted-foreground">{sales.meetings.basis}</p>
                                {!sales.meetings.classificationAvailable && <p className="text-xs text-muted-foreground">Уулзалтын төрлийн ангилал системд хараахан нэвтрээгүй.</p>}
                                {sales.meetings.unclassified > 0 && <p className="text-xs text-muted-foreground">Төрөл тодорхойгүй: {sales.meetings.unclassified}.</p>}
                                <p className="text-xs text-muted-foreground">Товлосон хэвээр {sales.meetings.scheduled} · Цуцалсан {sales.meetings.cancelled} · Ирээгүй {sales.meetings.noShow}</p>
                                {sales.meetings.unknownStatus > 0 && <p className="text-xs text-muted-foreground">Төлөв тодорхойгүй: {sales.meetings.unknownStatus}.</p>}
                            </div>}
                            {!!sales.contracts.byProduct?.length && <div className="max-w-full overflow-x-auto focus-ring print:overflow-visible" tabIndex={0} role="region" aria-label="Гэрээний бүтээгдэхүүний задаргаа">
                                <table className="w-full text-left text-sm">
                                    <caption className="mb-2 text-left text-sm font-medium">Гэрээний бүтээгдэхүүний задаргаа</caption>
                                    <thead className="border-b border-border text-xs text-muted-foreground"><tr><th scope="col" className="py-2 font-medium">Бүтээгдэхүүн</th><th scope="col" className="py-2 text-right font-medium">Гэрээ</th><th scope="col" className="py-2 text-right font-medium">Бүртгэлтэй дүн</th></tr></thead>
                                    <tbody>{sales.contracts.byProduct.map(product => <tr key={product.productType} className="border-b border-border last:border-0"><th scope="row" className="break-words py-3 font-medium [overflow-wrap:anywhere]">{product.label}</th><td className="text-right tabular-nums">{product.count}</td><td className="text-right tabular-nums">{formatMNTShort(product.value)}{product.missingAmounts > 0 && <span className="block text-xs text-muted-foreground">Дүн дутуу {product.missingAmounts}</span>}</td></tr>)}</tbody>
                                </table>
                            </div>}
                            <p className="text-xs leading-relaxed text-muted-foreground">Гэрээний дүн нь мөнгөөр орсон орлогоос тусдаа.{sales.cash ? ` Мөнгөөр орсон бүртгэл: ${formatMNTShort(sales.cash.receipts)} (${sales.cash.receiptCount} гүйлгээ). Банкны хуулгатай тулгаагүй.` : ' Мөнгөн орлогыг санхүүгийн эрхтэй хүн харна.'}</p>
                            {(sales.contracts.missingAmounts > 0 || sales.contracts.undatedCount > 0) && <Alert variant="warning">Дүн дутуу {sales.contracts.missingAmounts}, огноогүй {sales.contracts.undatedCount} гэрээ байна.</Alert>}
                            <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
                                <span className="text-muted-foreground">Одоо анхаарах:</span>
                                {[['Эзэнгүй', sales.leads.health.ownerless, 'unassigned'], ['Дараагийн алхамгүй', sales.leads.health.noNextStep, 'no_followup'], ['Хугацаа хэтэрсэн', sales.leads.health.overdue, 'overdue']].map(([label, count, queue]) => can('leads') ? <Link key={queue} href={`/dashboard/leads?queue=${queue}`} className="focus-ring hover:underline">{label} <strong className="ml-1 tabular-nums">{count}</strong></Link> : <span key={queue}>{label} {count}</span>)}
                            </div>
                            <p className="text-xs text-muted-foreground">Одоогийн ажлын дараалал; дээрх ангиллууд давхцаж болно.</p>
                        </> : <Unavailable>{can('reports') ? 'Борлуулалтын мэдээлэл түр боломжгүй. Шинэчлэх товчоор дахин оролдоно уу.' : 'Нэгдсэн борлуулалтын тайлан харах эрх шаардлагатай.'}</Unavailable>}
                    </section>

                    {can('reports') && <section className="space-y-4">
                        <ReportHeading number="01·2" title="Гэрээ, үлдэгдэл, давхрын зураглал" href={can('erp-imports') ? '/dashboard/reports/erp' : undefined} />
                        <WeeklySalesDetails query={weeklySalesQuery} canOpenErp={can('erp-imports')} />
                    </section>}

                    <section className="break-inside-avoid space-y-4">
                        <ReportHeading number="02" title="Маркетингийн үр дүн" href={can('marketing-roi') ? `/marketing?${params}` : undefined} />
                        {can('marketing-roi') && <WeeklyMarketingBudget to={range.to} />}
                        {can('marketing-roi') && <WeeklyMarketingChannels from={range.from} to={range.to} />}
                        {marketingQuery.isPending && can('marketing-roi') ? <Skeleton className="h-36" /> : marketing ? <>
                            <div className="grid grid-cols-2 gap-5 rounded-2xl border border-border p-5 sm:grid-cols-3">
                                <Metric label="Шинэ лид" value={marketing.totals.leads} helper={formatReviewChange(marketing.totals.leads, marketing.previous.leads)} />
                                <Metric label="Менежерт шилжсэн лид" value={marketing.totals.sales} helper={formatReviewChange(marketing.totals.sales, marketing.previous.sales)} />
                                <Metric label="Гэрээтэй лид" value={marketing.totals.deals} helper={formatReviewChange(marketing.totals.deals, marketing.previous.deals)} />
                                <Metric label="Дууссан кампанит ажил" value={marketing.totals.campaigns} helper={formatReviewChange(marketing.totals.campaigns, marketing.previous.campaigns)} />
                                <Metric label="Дууссан контент" value={marketing.totals.content} helper={formatReviewChange(marketing.totals.content, marketing.previous.content)} />
                            </div>
                            <PerformanceKpis report={marketing} />
                            <PerformanceChannelTable report={marketing} />
                            <Link href={`/marketing?${params}&tab=department`} className="inline-flex min-h-11 items-center gap-2 text-sm font-medium focus-ring hover:underline">Маркетингийн албаны KPI<ArrowUpRight className="size-4" /></Link>
                            <p className="text-xs leading-relaxed text-muted-foreground">Тухайн хугацаанд үүссэн лидээс хугацааны эцэс хүртэл шилжсэн, гэрээтэй болсон тоо. Борлуулалтын гэрээний тоотой ижил хэмжүүр биш.</p>
                            {(marketing.spendQuality.current.missingFx > 0 || marketing.quality.unknownHandoff > 0) && <Alert variant="warning">Ханшгүй {marketing.spendQuality.current.missingFx} зардал, шилжүүлсэн огноогүй {marketing.quality.unknownHandoff} лид тооцоонд ороогүй.</Alert>}
                        </> : <Unavailable>{can('marketing-roi') ? 'Маркетингийн мэдээлэл түр боломжгүй. Шинэчлэх товчоор дахин оролдоно уу.' : 'Маркетингийн үзүүлэлт харах эрх шаардлагатай.'}</Unavailable>}
                    </section>

                    <section className="space-y-4">
                        <ReportHeading number="03" title={updates?.canViewTeam ? 'Багийн явц, хэлэлцэх зүйл' : 'Миний явц, хэлэлцэх зүйл'} />
                        {updatesQuery.isPending ? <Skeleton className="h-32" /> : !updates ? <Unavailable>Ажлын шинэчлэлийг ачаалж чадсангүй.</Unavailable> : updates.updates.length ? <div className="divide-y divide-border">{updates.updates.map(update => <section key={update.id} className="break-inside-avoid py-5 first:pt-0">
                            <header className="mb-4 flex items-center gap-3"><Avatar name={update.author_name} className="size-9 text-xs" /><div><h3 className="text-sm font-semibold">{update.author_name}</h3><p className="mt-0.5 text-xs text-muted-foreground">Шинэчилсэн {ubDateStr(new Date(update.updated_at))} · {formatTime(update.updated_at)}</p></div></header>
                            <dl className="space-y-3 text-sm">{[['Хийсэн ажил', update.achievements], ['Саад, шийдэх зүйл', update.blockers], ['Дараагийн алхам', update.next_steps]].map(([label, value]) => <div key={label} className="grid gap-1 sm:grid-cols-[145px_1fr]"><dt className="text-muted-foreground">{label}</dt><dd className="whitespace-pre-wrap break-words leading-relaxed">{value || 'Тэмдэглээгүй'}</dd></div>)}</dl>
                        </section>)}</div> : <Unavailable>Хурлын шинэчлэл хараахан ороогүй. Хийсэн ажил, шийдэх зүйлээ нэмээрэй.</Unavailable>}
                    </section>
                </article>

                <aside id="weekly-update" className="scroll-mt-20 space-y-5 print:hidden">
                    <div className="rounded-2xl border border-border bg-surface p-5">
                        <div className="mb-5 flex items-center gap-2"><FileText className="size-4 text-muted-foreground" /><h2 className="font-semibold">Миний хурлын бэлтгэл</h2></div>
                        <p className="mb-5 text-sm leading-relaxed text-muted-foreground">Таны оруулсан шинэчлэлийг тайлангийн эрхтэй багийн гишүүд харна.</p>
                        {updatesQuery.error && <Alert variant="warning">{updatesQuery.error.message}</Alert>}
                        {updatesQuery.isPending ? <Skeleton className="h-64" /> : updatesQuery.data ? <UpdateForm key={meetingDate} meetingDate={meetingDate} initial={updatesQuery.data.updates.find(update => update.user_id === user?.id)} completedTasks={completedTasks} canWrite={canWrite} onDirty={setDirty} tasksUnavailable={tasksQuery.isError || tasksQuery.data?.available === false} /> : null}
                    </div>
                    {can('ai-assistant') && <button type="button" disabled={!exportable} onClick={() => openAiPanel(`Доорх хурлын тайлангаас 3 гол дүгнэлт, хэлэлцэх асуудал, дараагийн 7 хоногийн алхмыг бэлд. Байхгүй тоог бүү таамагла. Хадгалах эсвэл илгээх үйлдэл бүү хий.\n\n${text}`)} className="flex w-full items-start gap-3 rounded-2xl bg-surface-2 p-5 text-left transition-colors hover:bg-surface-3 disabled:opacity-50 focus-ring"><Sparkles className="mt-0.5 size-5 shrink-0" /><span><span className="block text-sm font-medium">AI-аар дүгнэлт бэлдэх</span><span className="mt-1 block text-xs leading-relaxed text-muted-foreground">Энэ тайлан дээр үндэслэн хурлын ярих зүйлээ цэгцлээрэй.</span></span><ArrowUpRight className="ml-auto size-4 shrink-0" /></button>}
                    <button type="button" disabled={!canWrite} onClick={() => openQuickCreate('task')} className="flex min-h-11 w-full items-center gap-2 px-2 text-sm text-fg-2 hover:text-foreground disabled:opacity-50 focus-ring"><Plus className="size-4" />Хурлаас гарсан ажил нэмэх</button>
                </aside>
            </div>
        </div>
    );
}

function UpdateForm({ meetingDate, initial, completedTasks, canWrite, onDirty, tasksUnavailable }: { meetingDate: string; initial?: WeeklyUpdate; completedTasks: UserTask[]; canWrite: boolean; onDirty: (dirty: boolean) => void; tasksUnavailable: boolean }) {
    const { shop } = useAuth();
    const queryClient = useQueryClient();
    const [saved, setSaved] = useState({ achievements: initial?.achievements || '', blockers: initial?.blockers || '', nextSteps: initial?.next_steps || '' });
    const [form, setForm] = useState(saved);
    const dirty = Object.keys(form).some(key => form[key as keyof typeof form] !== saved[key as keyof typeof saved]);
    useEffect(() => { onDirty(dirty); }, [dirty, onDirty]);
    useEffect(() => {
        if (!dirty) return;
        const handler = (event: BeforeUnloadEvent) => { event.preventDefault(); };
        window.addEventListener('beforeunload', handler);
        return () => window.removeEventListener('beforeunload', handler);
    }, [dirty]);
    const save = useMutation({
        mutationFn: () => dashboardMutate<{ update: WeeklyUpdate }>('/api/dashboard/weekly-updates', 'PUT', { meetingDate, ...form }, { shopId: shop?.id }),
        onSuccess: () => { setSaved(form); void queryClient.invalidateQueries({ queryKey: ['weekly-updates', shop?.id] }); toast.success('Хурлын шинэчлэл хадгалагдлаа'); },
    });
    function importCompletedTasks() {
        const achievements = [form.achievements, ...completedTasks.map(task => `• ${task.title}`).filter(title => !form.achievements.includes(title))].filter(Boolean).join('\n');
        if (achievements.length > 4000) {
            toast.error('Дууссан ажлуудыг нэмэхэд 4000 тэмдэгтээс хэтэрч байна. Хийсэн ажлын бичвэрээ товчлоод дахин оролдоно уу.');
            return;
        }
        setForm({ ...form, achievements });
    }
    const fields = [['achievements', 'Хийсэн ажил', 'Энэ долоо хоногт ямар үр дүн гарсан бэ?'], ['blockers', 'Саад, шийдэх зүйл', 'Багаас ямар шийдвэр, дэмжлэг хэрэгтэй вэ?'], ['nextSteps', 'Дараагийн алхам', 'Дараагийн хурал хүртэл юу хийх вэ?']] as const;
    return <form className="space-y-5" onSubmit={event => { event.preventDefault(); save.mutate(); }}>
        <fieldset disabled={!canWrite || save.isPending} className="space-y-5 disabled:opacity-70">
            {fields.map(([key, label, placeholder]) => <div key={key}><label htmlFor={`weekly-${key}`} className="block text-sm font-medium">{label}</label><textarea id={`weekly-${key}`} value={form[key]} maxLength={4000} rows={3} placeholder={placeholder} onChange={event => setForm({ ...form, [key]: event.target.value })} className="mt-2 block w-full resize-y rounded-xl border border-border bg-background p-3 text-sm font-normal leading-relaxed placeholder:text-muted-foreground focus-ring" />{key === 'achievements' && completedTasks.length > 0 && <button type="button" onClick={importCompletedTasks} className="mt-2 min-h-9 text-xs text-brand-strong hover:underline">Дууссан ажлаас оруулах ({completedTasks.length})</button>}</div>)}
        </fieldset>
        {tasksUnavailable && <p className="text-xs text-muted-foreground">Дууссан ажлыг татаж чадсангүй. Хийсэн ажлаа бичиж болно.</p>}
        {save.error && <Alert variant="danger">{save.error.message}</Alert>}
        {!canWrite ? <p className="text-xs text-muted-foreground">Шинэчлэл оруулахад бичих эрх шаардлагатай.</p> : <>
            <div className="flex items-center gap-2"><Button type="submit" isLoading={save.isPending} disabled={!dirty || !Object.values(form).some(value => value.trim())} className="flex-1 bg-foreground text-background hover:bg-fg-2"><Check />Тайланд оруулах</Button>{dirty && <Button type="button" variant="ghost" disabled={save.isPending} onClick={() => setForm(saved)}>Болих</Button>}</div>
            <p role="status" className="text-xs text-muted-foreground">{dirty ? 'Хадгалаагүй өөрчлөлт тайланд орохгүй. Үргэлжлүүлэхийн өмнө хадгална уу.' : initial || Object.values(saved).some(Boolean) ? 'Таны шинэчлэл хадгалагдсан.' : 'Бөглөөд тайланд оруулаарай.'}</p>
        </>}
    </form>;
}

function Metric({ label, value, helper }: { label: string; value: string | number; helper?: string }) {
    return <div><p className="text-xs text-muted-foreground">{label}</p><p className="mt-2 text-[26px] font-semibold tracking-tight tabular-nums">{value}</p>{helper && <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{helper}</p>}</div>;
}
function ReportHeading({ number, title, href }: { number: string; title: string; href?: string }) {
    return <header className="flex items-center gap-3"><span className="text-xs tabular-nums text-muted-foreground">{number}</span><h2 className="text-base font-semibold tracking-tight">{title}</h2>{href && <Link href={href} aria-label={`${title} дэлгэрэнгүй`} className="ml-auto rounded-md p-2 text-muted-foreground hover:bg-surface-2 focus-ring print:hidden"><ArrowUpRight className="size-4" /></Link>}</header>;
}
function Unavailable({ children }: { children: React.ReactNode }) {
    return <p className="rounded-xl bg-surface-2 p-5 text-sm leading-relaxed text-muted-foreground">{children}</p>;
}

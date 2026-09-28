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
import { formatWeeklyReview, meetingDateSchema, nextMeetingDate, shiftReviewDate, weeklyReviewRange, type WeeklyUpdate, type WeeklyUpdatesData } from '@/lib/dashboard/weekly-review';
import { Button } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Alert';
import { Avatar, Skeleton } from '@/components/dashboard/v2/primitives';

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
    const can = (module: string) => !!user && (user.role === 'super_admin' || user.permissions.modules.includes(module));
    const canWrite = user?.role === 'super_admin' || !!user?.permissions.canWrite;
    const params = new URLSearchParams(range);
    const salesQuery = useQuery<OperationsReport>({
        queryKey: ['operations-report', shop?.id, range.from, range.to, user?.id, can('finance')],
        queryFn: ({ signal }) => dashboardJson(`/api/dashboard/reports/operations?${params}`, { signal }),
        enabled: !!shop?.id && can('reports'), staleTime: 60_000, retry: 1,
    });
    const marketingQuery = useQuery<MarketingPerformance>({
        queryKey: ['marketing-performance', shop?.id, range.from, range.to, user?.id],
        queryFn: async ({ signal }) => (await dashboardJson<{ report: MarketingPerformance }>(`/api/marketing/performance?${params}`, { signal })).report,
        enabled: !!shop?.id && can('marketing-roi'), staleTime: 60_000, retry: 1,
    });
    const updatesQuery = useQuery<WeeklyUpdatesData>({
        queryKey: ['weekly-updates', shop?.id, user?.id, meetingDate, can('reports')],
        queryFn: ({ signal }) => dashboardJson(`/api/dashboard/weekly-updates?meetingDate=${meetingDate}`, { signal }),
        enabled: !!shop?.id, staleTime: 30_000, retry: 1,
    });
    const tasksQuery = useMyTasks();
    const sales = can('reports') && !salesQuery.isError ? salesQuery.data : undefined;
    const marketing = can('marketing-roi') && !marketingQuery.isError ? marketingQuery.data : undefined;
    const updates = updatesQuery.isError ? undefined : updatesQuery.data;
    const completedTasks = (tasksQuery.data?.tasks || []).filter(task => task.status === 'done' && task.completed_at && ubDateStr(new Date(task.completed_at)) >= range.from && ubDateStr(new Date(task.completed_at)) <= range.to);
    const loading = salesQuery.isFetching || marketingQuery.isFetching || updatesQuery.isFetching;
    const notices = [
        ...(range.to >= ubDateStr() ? ['Тайлант хугацаа дуусаагүй. Одоогоор бүртгэсэн мэдээллийг харуулж байна.'] : []),
        ...(!can('reports') ? ['Борлуулалтын нэгдсэн тоонд тайлангийн эрх шаардлагатай.'] : salesQuery.error ? [`Борлуулалт: ${salesQuery.error.message}`] : []),
        ...(!can('marketing-roi') ? ['Маркетингийн үзүүлэлтэд маркетингийн эрх шаардлагатай.'] : marketingQuery.error ? [`Маркетинг: ${marketingQuery.error.message}`] : []),
        ...(updatesQuery.error ? [`Ажлын шинэчлэл: ${updatesQuery.error.message}`] : []),
        ...(!updatesQuery.data?.canViewTeam ? ['Ажлын шинэчлэл: зөвхөн миний оруулсан мэдээлэл.'] : []),
    ];
    const text = formatWeeklyReview({ shopName: shop?.name || 'Vertmon Hub', meetingDate, sales, marketing, updates: updates?.updates, notices });
    const exportable = !loading && !dirty && !!(sales || marketing || updates);
    const refresh = () => {
        if (can('reports')) void salesQuery.refetch();
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
                        </div>
                        <Button variant="ghost" size="icon" className="fullscreen-exit" aria-label="Танилцуулгыг хаах" onClick={() => void document.exitFullscreen()}><X /></Button>
                    </header>
                    {notices.length > 0 && <div role="status" className="space-y-1 rounded-xl bg-surface-2 px-4 py-3 text-xs leading-relaxed text-fg-2">{notices.map(notice => <p key={notice}>{notice}</p>)}</div>}

                    <section className="break-inside-avoid space-y-4">
                        <ReportHeading number="01" title="Борлуулалтын тойм" href={can('reports') ? `/dashboard/reports/operations?${params}` : undefined} />
                        {salesQuery.isPending && can('reports') ? <Skeleton className="h-32" /> : sales ? <>
                            <div className="grid grid-cols-2 gap-y-5 rounded-2xl border border-border p-5 sm:grid-cols-3">
                                <Metric label="Шинэ лид" value={sales.leads.newCount} />
                                <Metric label="Байгуулсан гэрээ" value={sales.contracts.count} />
                                <Metric label="Гэрээний бүртгэлтэй дүн" value={formatMNTShort(sales.contracts.value)} />
                            </div>
                            <p className="text-xs leading-relaxed text-muted-foreground">Гэрээний дүн нь мөнгөөр орсон орлогоос тусдаа.{sales.cash ? ` Мөнгөөр орсон бүртгэл: ${formatMNTShort(sales.cash.receipts)} (${sales.cash.receiptCount} гүйлгээ). Банкны хуулгатай тулгаагүй.` : ' Мөнгөн орлогыг санхүүгийн эрхтэй хүн харна.'}</p>
                            {(sales.contracts.missingAmounts > 0 || sales.contracts.undatedCount > 0) && <Alert variant="warning">Дүн дутуу {sales.contracts.missingAmounts}, огноогүй {sales.contracts.undatedCount} гэрээ байна.</Alert>}
                            <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
                                <span className="text-muted-foreground">Одоо анхаарах:</span>
                                {[['Эзэнгүй', sales.leads.health.ownerless, 'unassigned'], ['Дараагийн алхамгүй', sales.leads.health.noNextStep, 'no_followup'], ['Хугацаа хэтэрсэн', sales.leads.health.overdue, 'overdue']].map(([label, count, queue]) => can('leads') ? <Link key={queue} href={`/dashboard/leads?queue=${queue}`} className="focus-ring hover:underline">{label} <strong className="ml-1 tabular-nums">{count}</strong></Link> : <span key={queue}>{label} {count}</span>)}
                            </div>
                            <p className="text-xs text-muted-foreground">Одоогийн ажлын дараалал; дээрх ангиллууд давхцаж болно.</p>
                        </> : <Unavailable>{can('reports') ? 'Борлуулалтын мэдээлэл түр боломжгүй. Шинэчлэх товчоор дахин оролдоно уу.' : 'Нэгдсэн борлуулалтын тайлан харах эрх шаардлагатай.'}</Unavailable>}
                    </section>

                    <section className="break-inside-avoid space-y-4">
                        <ReportHeading number="02" title="Маркетингийн үр дүн" href={can('marketing-roi') ? '/marketing' : undefined} />
                        {marketingQuery.isPending && can('marketing-roi') ? <Skeleton className="h-36" /> : marketing ? <>
                            <div className="grid grid-cols-2 gap-y-5 rounded-2xl border border-border p-5 sm:grid-cols-3">
                                <Metric label="Менежерт шилжсэн лид" value={marketing.totals.sales} />
                                <Metric label="Дууссан ажил" value={marketing.totals.activities} />
                                <Metric label="Бүртгэсэн зардал" value={formatMNTShort(marketing.totals.spend)} />
                            </div>
                            <div className="overflow-x-auto">
                                <table className="w-full text-left text-sm">
                                    <caption className="sr-only">Маркетингийн сувгийн үр дүн</caption>
                                    <thead className="border-b border-border text-xs text-muted-foreground"><tr><th className="py-3 font-medium">Суваг</th><th className="text-right font-medium">Лид</th><th className="text-right font-medium">Шилжсэн</th><th className="text-right font-medium">Гэрээтэй</th></tr></thead>
                                    <tbody>{marketing.channels.filter(channel => channel.leads > 0).map(channel => <tr key={channel.id} className="border-b border-border last:border-0"><th scope="row" className="py-3 font-medium">{channel.name}</th><td className="text-right tabular-nums">{channel.leads}</td><td className="text-right tabular-nums">{channel.sales}</td><td className="text-right tabular-nums">{channel.deals}</td></tr>)}</tbody>
                                </table>
                                {!marketing.totals.leads && <p className="py-5 text-sm text-muted-foreground">Энэ хугацаанд шинэ лид бүртгэгдээгүй.</p>}
                            </div>
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
            {fields.map(([key, label, placeholder]) => <div key={key}><label htmlFor={`weekly-${key}`} className="block text-sm font-medium">{label}</label><textarea id={`weekly-${key}`} value={form[key]} maxLength={4000} rows={3} placeholder={placeholder} onChange={event => setForm({ ...form, [key]: event.target.value })} className="mt-2 block w-full resize-y rounded-xl border border-border bg-background p-3 text-sm font-normal leading-relaxed placeholder:text-muted-foreground focus-ring" />{key === 'achievements' && completedTasks.length > 0 && <button type="button" onClick={importCompletedTasks} className="mt-2 min-h-9 text-xs text-brand hover:underline">Дууссан ажлаас оруулах ({completedTasks.length})</button>}</div>)}
        </fieldset>
        {tasksUnavailable && <p className="text-xs text-muted-foreground">Дууссан ажлыг татаж чадсангүй. Хийсэн ажлаа бичиж болно.</p>}
        {save.error && <Alert variant="danger">{save.error.message}</Alert>}
        {!canWrite ? <p className="text-xs text-muted-foreground">Шинэчлэл оруулахад бичих эрх шаардлагатай.</p> : <>
            <div className="flex items-center gap-2"><Button type="submit" isLoading={save.isPending} disabled={!dirty || !Object.values(form).some(value => value.trim())} className="flex-1 bg-foreground text-background hover:bg-fg-2"><Check />Тайланд оруулах</Button>{dirty && <Button type="button" variant="ghost" disabled={save.isPending} onClick={() => setForm(saved)}>Болих</Button>}</div>
            <p role="status" className="text-xs text-muted-foreground">{dirty ? 'Хадгалаагүй өөрчлөлт тайланд орохгүй. Үргэлжлүүлэхийн өмнө хадгална уу.' : initial || Object.values(saved).some(Boolean) ? 'Таны шинэчлэл хадгалагдсан.' : 'Бөглөөд тайланд оруулаарай.'}</p>
        </>}
    </form>;
}

function Metric({ label, value }: { label: string; value: string | number }) {
    return <div><p className="text-xs text-muted-foreground">{label}</p><p className="mt-2 text-[26px] font-semibold tracking-tight tabular-nums">{value}</p></div>;
}
function ReportHeading({ number, title, href }: { number: string; title: string; href?: string }) {
    return <header className="flex items-center gap-3"><span className="text-xs tabular-nums text-muted-foreground">{number}</span><h2 className="text-base font-semibold tracking-tight">{title}</h2>{href && <Link href={href} aria-label={`${title} дэлгэрэнгүй`} className="ml-auto rounded-md p-2 text-muted-foreground hover:bg-surface-2 focus-ring print:hidden"><ArrowUpRight className="size-4" /></Link>}</header>;
}
function Unavailable({ children }: { children: React.ReactNode }) {
    return <p className="rounded-xl bg-surface-2 p-5 text-sm leading-relaxed text-muted-foreground">{children}</p>;
}

'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowRight, Check, ChevronRight, ImageIcon, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Panel, Progress, Pill, GhostButton, EmptyRow, Skeleton } from '@/components/dashboard/v2/primitives';
import { ContentItemDialog } from '@/components/marketing/ContentItemDialog';
import { useAuth } from '@/contexts/AuthContext';
import { useModuleAccess } from '@/hooks/useModuleAccess';
import { useDashboardQuery } from '@/hooks/useDashboardQuery';
import { dashboardJson, dashboardMutate } from '@/lib/api/dashboardFetch';
import { useRegisterAiContext } from '@/lib/ai/context';
import { shiftReviewDate } from '@/lib/dashboard/weekly-review';
import { CONTENT_STATUS_LABEL, CONTENT_TYPE_LABEL, contentPlatformLabel, type ContentItem, type ContentStatus } from '@/lib/marketing/content-plan';
import { buildMarketingHome, marketingDayLabel, marketingHomeWindow, OVERDUE_LOOKBACK_DAYS } from '@/lib/marketing/marketing-home';
import type { BudgetOverview } from '@/lib/marketing/budget';
import type { SocialWeek, SocialWeekMetric } from '@/lib/marketing/social-week';
import { formatMNTShort } from '@/lib/utils/currency';
import { formatWorkdayDate, ubDateStr } from '@/lib/utils/date';
import { cn } from '@/lib/utils';

/**
 * Маркетингийн самбар — маркетингийн менежерийн эхний дэлгэц (борлуулалтын менежерийн «Өнөөдөр»-тэй
 * ижил үүрэгтэй). Контент төлөвлөгөө (өнөөдөр, хоцорсон, ирэх 7 хоног, сарын гүйцэтгэл), Facebook
 * хуудасны долоо хоног, сарын төсөв. Лид, гэрээ, борлуулалтын хөрвөлтийг ЭНД харуулахгүй — маркетинг
 * өөрийн контент төлөвлөгөөгөөр хэмжигдэнэ (тусдаа тайлан).
 */

const STATUS_TONE: Record<ContentStatus, 'info' | 'pending' | 'success' | 'danger' | 'neutral'> = {
    planned: 'neutral', in_progress: 'pending', ready: 'info', published: 'success', cancelled: 'neutral',
};
const count = (value: number | null) => value === null ? '—' : value.toLocaleString('en-US');
type BudgetResponse = { year: number; available: boolean; error?: string; overview?: BudgetOverview; spendQuality?: { missingFx: number } };
type Editing = { item: ContentItem } | { date: string } | null;

/** Таб шөнөжин нээлттэй байсан ч «өнөөдөр» шинэчлэгдэнэ. */
function useToday() {
    const [now, setNow] = useState(() => new Date());
    useEffect(() => {
        const tick = () => setNow(new Date());
        const timer = setInterval(tick, 60_000);
        const refresh = () => { if (!document.hidden) tick(); };
        window.addEventListener('focus', refresh);
        document.addEventListener('visibilitychange', refresh);
        return () => {
            clearInterval(timer);
            window.removeEventListener('focus', refresh);
            document.removeEventListener('visibilitychange', refresh);
        };
    }, []);
    return now;
}

export function MarketingDashboard() {
    useRegisterAiContext({ type: 'marketing' });
    const { user } = useAuth();
    const { canWrite } = useModuleAccess();
    const queryClient = useQueryClient();
    const now = useToday();
    const today = ubDateStr(now);
    const range = marketingHomeWindow(today).fetch;
    const writable = canWrite('marketing-roi');
    const deletable = user?.role === 'super_admin' || (!!user?.permissions?.canDelete && writable);
    const [editing, setEditing] = useState<Editing>(null);
    const [busy, setBusy] = useState<string | null>(null);

    const content = useDashboardQuery<{ items: ContentItem[] }>(['marketing-calendar', 'home'],
        `/api/marketing/content-plan?from=${range.from}&to=${range.to}`, { keepPreviousData: true });
    const home = useMemo(() => content.data ? buildMarketingHome(content.data.items, today) : null, [content.data, today]);

    const refresh = () => Promise.all([
        queryClient.invalidateQueries({ queryKey: ['marketing-calendar'] }),
        queryClient.invalidateQueries({ queryKey: ['content-plan'] }),
    ]);
    async function patch(item: ContentItem, body: Record<string, unknown>, done: string) {
        setBusy(item.id);
        try {
            await dashboardMutate(`/api/marketing/content-plan/${item.id}`, 'PATCH', body);
            toast.success(done);
            await refresh();
        } catch (error) {
            toast.error(error instanceof Error ? error.message : 'Алдаа гарлаа');
        } finally {
            setBusy(null);
        }
    }
    const rowActions = writable ? {
        busy,
        onPublish: (item: ContentItem) => void patch(item, { status: 'published' }, 'Нийтэлсэн гэж тэмдэглэв'),
        onTomorrow: (item: ContentItem) => void patch(item, { scheduledDate: shiftReviewDate(today, 1) }, 'Маргааш руу шилжүүлэв'),
    } : null;

    if (content.isError && !content.data) {
        return <Alert variant="danger">
            {content.error instanceof Error ? content.error.message : 'Контент төлөвлөгөөг ачаалж чадсангүй.'}
            <Button size="sm" variant="secondary" disabled={content.isFetching} onClick={() => void content.refetch()}>Дахин оролдох</Button>
        </Alert>;
    }

    const openCount = home ? home.overdue.length + home.today.filter(item => item.status !== 'published').length : 0;
    return (
        <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(320px,1fr)]">
            <div className="flex min-w-0 flex-col gap-4">
                <Panel
                    title="Өнөөдрийн контент"
                    sub={!home ? undefined : home.overdue.length > 0
                        ? <span className="text-status-danger">{home.overdue.length} хоцорсон</span>
                        : formatWorkdayDate(now)}
                    right={writable && <GhostButton onClick={() => setEditing({ date: today })}><Plus className="h-3.5 w-3.5" />Контент нэмэх</GhostButton>}
                >
                    {!home ? (
                        <div className="flex flex-col gap-2 p-3.5">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-12" />)}</div>
                    ) : !home.overdue.length && !home.today.length ? (
                        <div className="flex flex-col items-center gap-3 px-4 py-10 text-center">
                            <div className="text-[13.5px] font-medium text-foreground">Өнөөдөр нийтлэх контент төлөвлөөгүй</div>
                            <p className="max-w-xs text-[12.5px] text-muted-foreground">Пост, reel, story-гоо Контент календарьт огноотой нь бүртгэвэл энд өдөр бүр гарна.</p>
                            {writable && <Button size="sm" onClick={() => setEditing({ date: today })}><Plus className="h-4 w-4" />Контент нэмэх</Button>}
                        </div>
                    ) : (
                        <div className="flex flex-col">
                            {home.overdue.length > 0 && <Group label={`Хоцорсон · сүүлийн ${OVERDUE_LOOKBACK_DAYS} хоног`} count={home.overdue.length} danger>
                                {home.overdue.map(item => <ContentRow key={item.id} item={item} today={today} actions={rowActions} onOpen={() => setEditing({ item })} />)}
                            </Group>}
                            {home.today.length > 0 && <Group label="Өнөөдөр" count={home.today.length}>
                                {home.today.map(item => <ContentRow key={item.id} item={item} today={today} actions={rowActions} onOpen={() => setEditing({ item })} />)}
                            </Group>}
                        </div>
                    )}
                    {home && openCount === 0 && home.today.length > 0 && <p className="border-t border-border px-4 py-2.5 text-[12px] text-status-success">Өнөөдрийн контент бүгд нийтлэгдсэн.</p>}
                </Panel>

                <Panel
                    title="Ирэх 7 хоног"
                    sub={home ? home.emptyDays ? <span className="text-status-pending">{home.emptyDays} өдөр контентгүй</span> : 'Өдөр бүр контенттой' : undefined}
                    right={<Link href="/marketing/calendar" className="inline-flex items-center gap-1 text-[12px] font-medium text-brand-strong hover:underline focus-ring">Контент календарь <ChevronRight className="h-3.5 w-3.5" /></Link>}
                >
                    {!home ? (
                        <div className="flex flex-col gap-2 p-3.5">{Array.from({ length: 7 }).map((_, i) => <Skeleton key={i} className="h-9" />)}</div>
                    ) : (
                        <ul className="flex flex-col">
                            {home.upcoming.map(day => (
                                <li key={day.day} className="flex min-h-12 items-center gap-3 border-b border-border px-4 py-2 last:border-b-0">
                                    <span className="num w-24 shrink-0 text-[12.5px] text-fg-2">{marketingDayLabel(day.day)}</span>
                                    {day.items.length ? (
                                        <div className="flex min-w-0 flex-1 flex-wrap gap-1.5">
                                            {day.items.map(item => (
                                                <button key={item.id} type="button" onClick={() => setEditing({ item })}
                                                    className="inline-flex min-h-8 max-w-full items-center gap-1.5 rounded-md border border-border px-2 text-[12px] text-foreground transition-colors hover:bg-surface-2 focus-ring">
                                                    <span className="text-muted-foreground">{CONTENT_TYPE_LABEL[item.type]}</span>
                                                    <span className="truncate">{item.title}</span>
                                                    {item.status === 'ready' && <Check className="h-3.5 w-3.5 shrink-0 text-status-info" aria-label="Бэлэн" />}
                                                </button>
                                            ))}
                                        </div>
                                    ) : (
                                        <span className="flex-1 text-[12.5px] text-muted-foreground">Контентгүй</span>
                                    )}
                                    {writable && <GhostButton onClick={() => setEditing({ date: day.day })} aria-label={`${marketingDayLabel(day.day)}-нд контент нэмэх`}><Plus className="h-3.5 w-3.5" /></GhostButton>}
                                </li>
                            ))}
                        </ul>
                    )}
                </Panel>
            </div>

            <div className="flex min-w-0 flex-col gap-4">
                <MonthPlan home={home} month={Number(today.slice(5, 7))} />
                <FacebookWeek />
                <MonthBudget today={today} />
            </div>

            {editing && <ContentItemDialog
                key={'item' in editing ? editing.item.id : editing.date}
                item={'item' in editing ? editing.item : undefined}
                defaultDate={'date' in editing ? editing.date : today}
                canWrite={writable} canDelete={deletable}
                onClose={() => setEditing(null)}
                onSaved={() => { setEditing(null); void refresh(); }} />}
        </div>
    );
}

function Group({ label, count, danger, children }: { label: string; count: number; danger?: boolean; children: React.ReactNode }) {
    return <div>
        <div className="flex items-center gap-2 border-b border-border bg-surface-2/60 px-4 py-1.5">
            <span className={cn('text-[12px] font-semibold', danger ? 'text-status-danger' : 'text-muted-foreground')}>{label}</span>
            <span className="mono-label ml-auto text-[12px] text-muted-foreground">{count}</span>
        </div>
        {children}
    </div>;
}

function ContentRow({ item, today, actions, onOpen }: {
    item: ContentItem; today: string; onOpen: () => void;
    actions: { busy: string | null; onPublish: (item: ContentItem) => void; onTomorrow: (item: ContentItem) => void } | null;
}) {
    const overdue = item.scheduled_date < today && item.status !== 'published';
    const days = Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${item.scheduled_date}T00:00:00Z`)) / 86_400_000);
    const meta = [contentPlatformLabel(item.platform), item.assigned_to, overdue ? marketingDayLabel(item.scheduled_date) : item.scheduled_time?.slice(0, 5)].filter(Boolean).join(' · ');
    const open = item.status !== 'published' && item.status !== 'cancelled';
    return (
        <div className={cn('group flex min-h-16 items-center gap-3 border-b border-border px-4 py-2 transition-colors hover:bg-surface-2/70', overdue && 'bg-status-danger-soft/40')}>
            <Pill tone={item.type === 'reel' || item.type === 'story' ? 'info' : 'neutral'} className="w-14 justify-center text-[12px]">{CONTENT_TYPE_LABEL[item.type]}</Pill>
            <button type="button" onClick={onOpen} className="min-w-0 flex-1 text-left focus-ring">
                <div className={cn('truncate text-[13px] font-medium', item.status === 'published' ? 'text-muted-foreground line-through decoration-border-strong' : 'text-foreground')}>{item.title}</div>
                <div className="flex items-center gap-1.5 truncate text-[12px] text-muted-foreground">
                    {meta || '—'}
                    {item.image_paths.length > 0 && <span className="inline-flex items-center gap-0.5"><ImageIcon className="h-3.5 w-3.5" aria-hidden />{item.image_paths.length}</span>}
                </div>
            </button>
            <div className="flex shrink-0 items-center gap-1">
                {overdue ? <Pill tone="danger">{days} хоног</Pill> : <Pill tone={STATUS_TONE[item.status]}>{CONTENT_STATUS_LABEL[item.status]}</Pill>}
                {actions && open && (
                    <div className="flex items-center gap-0.5">
                        <GhostButton onClick={() => actions.onPublish(item)} disabled={actions.busy === item.id}><Check className="h-3.5 w-3.5" />Нийтэлсэн</GhostButton>
                        <GhostButton onClick={() => actions.onTomorrow(item)} disabled={actions.busy === item.id}><ArrowRight className="h-3.5 w-3.5" />Маргааш</GhostButton>
                    </div>
                )}
            </div>
        </div>
    );
}

function MonthPlan({ home, month }: { home: ReturnType<typeof buildMarketingHome> | null; month: number }) {
    const plan = home?.month;
    return (
        <Panel title={`${month}-р сарын контент төлөвлөгөө`}
            right={<Link href="/marketing/calendar" className="inline-flex items-center gap-1 text-[12px] font-medium text-brand-strong hover:underline focus-ring">Календарь <ChevronRight className="h-3.5 w-3.5" /></Link>}
            bodyClassName="flex flex-col gap-4 p-4">
            {!plan ? <Skeleton className="h-28" /> : !plan.planned ? (
                <p className="text-[12.5px] text-muted-foreground">Энэ сард контент төлөвлөөгүй байна. Сарын пост, reel, story-гоо календарьт оруулбал гүйцэтгэл энд бодогдоно.</p>
            ) : <>
                <div>
                    <div className="flex items-baseline gap-2">
                        <span className="num text-[22px] font-semibold tracking-[-0.02em]">{plan.published}/{plan.planned}</span>
                        <span className="text-[12px] text-muted-foreground">нийтэлсэн · <span className={cn('font-medium', plan.pct === 100 ? 'text-status-success' : 'text-foreground')}>{plan.pct}%</span></span>
                    </div>
                    <Progress value={plan.published} max={plan.planned} className="mt-2" />
                </div>
                <div className="grid grid-cols-3 gap-2">
                    <Stat label="нийтлэх үлдсэн" value={plan.planned - plan.published - plan.overdue} />
                    <Stat label="хоцорсон" value={plan.overdue} danger={plan.overdue > 0} />
                    <Stat label="цуцалсан" value={plan.cancelled} />
                </div>
                {plan.byType.length > 0 && <ul className="flex flex-col gap-2 border-t border-border pt-3">
                    {plan.byType.map(row => (
                        <li key={row.type} className="grid grid-cols-[64px_minmax(0,1fr)_48px] items-center gap-2 text-[12.5px]">
                            <span className="text-fg-2">{row.label}</span>
                            <Progress value={row.published} max={row.planned} />
                            <span className="num text-right text-muted-foreground">{row.published}/{row.planned}</span>
                        </li>
                    ))}
                </ul>}
            </>}
        </Panel>
    );
}

function Stat({ label, value, danger }: { label: string; value: number; danger?: boolean }) {
    return <div className="rounded-lg bg-surface-2 px-2.5 py-2">
        <div className={cn('num text-[16px] font-semibold', danger ? 'text-status-danger' : 'text-foreground')}>{value}</div>
        <div className="text-[12px] text-muted-foreground">{label}</div>
    </div>;
}

const FB_METRICS = ['page_media_view', 'page_post_engagements', 'page_daily_follows_unique', 'page_follows'] as const;

const shortDay = (day: string) => `${day.slice(5, 7)}.${day.slice(8)}`;

/** Сүүлд синк хийсэн Meta-гийн өдрөөр дуусах 7 хоног — явж буй долоо хоногийн өгөгдөл хараахан ирээгүй байдаг. */
function useLatestSocialWeek() {
    const { shop, user } = useAuth();
    return useQuery<SocialWeek>({
        queryKey: ['social-week', shop?.id, user?.id, 'latest'],
        queryFn: async ({ signal }) => (await dashboardJson<{ week: SocialWeek }>('/api/dashboard/marketing/social-week?latest=1', { signal, shopId: shop?.id })).week,
        enabled: !!shop?.id, staleTime: 60_000, retry: 1,
    });
}

function FacebookWeek() {
    const week = useLatestSocialWeek();
    const link = <Link href="/marketing/social" className="inline-flex items-center gap-1 text-[12px] font-medium text-brand-strong hover:underline focus-ring">Сошиал <ChevronRight className="h-3.5 w-3.5" /></Link>;
    const sub = week.data?.page && week.data.syncedTo ? `Сүүлийн 7 хоног · ${shortDay(week.data.range.from)}–${shortDay(week.data.range.to)}` : undefined;
    return (
        <Panel title="Facebook хуудас" sub={sub} right={link} bodyClassName="p-4">
            {week.isPending ? <Skeleton className="h-28" />
                : week.isError ? <p className="text-[12.5px] text-status-danger">{week.error.message}</p>
                : !week.data.page ? <p className="text-[12.5px] text-muted-foreground">Facebook хуудас холбогдоогүй. Маркетинг → Сошиал хэсэгт холбовол хуудасны долоо хоногийн үзүүлэлт энд гарна.</p>
                : !week.data.syncedTo ? <p className="text-[12.5px] text-muted-foreground">Хуудасны үзүүлэлт хараахан синк хийгдээгүй. Өдөр бүрийн синкийн дараа энд гарна.</p>
                : <>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                        {FB_METRICS.map(key => {
                            const metric = week.data.metrics.find(row => row.metric === key);
                            return metric ? <SocialMetric key={key} metric={metric} /> : null;
                        })}
                    </div>
                    <p className="mt-3 text-[12px] text-muted-foreground">{comparisonNote(week.data.metrics)}</p>
                    <p className="mt-3 border-t border-border pt-3 text-[12px] text-muted-foreground">
                        Нийтэлсэн пост {week.data.posts.length}{typeof week.data.posts[0]?.views === 'number' ? ` · хамгийн их үзэлттэй ${count(week.data.posts[0].views)}` : ''}
                        {' · '}{week.data.syncedTo ? `синк ${week.data.syncedTo} хүртэл` : 'синк хийгдээгүй'}
                    </p>
                </>}
        </Panel>
    );
}

/** Өөрчлөлтийг юутай харьцуулснаа нэг мөрөөр (дутуу долоо хоногт өмнөх долоо хоногийн мөн өдрүүдтэй). */
function comparisonNote(metrics: SocialWeekMetric[]) {
    const partial = metrics.some(metric => metric.comparison === 'same-days');
    return `Өөрчлөлт: ${partial ? 'өмнөх 7 хоногийн мөн өдрүүдээс' : 'өмнөх 7 хоногоос'}, дагагч 7 хоногийн өмнөхөөс.`;
}

function SocialMetric({ metric }: { metric: SocialWeekMetric }) {
    const sign = metric.delta !== null && metric.delta > 0 ? '+' : '';
    return <div className="min-w-0">
        <div className="truncate text-[12px] text-muted-foreground">{metric.label}</div>
        <div className="num text-[16px] font-semibold">{count(metric.value)}</div>
        <div className="truncate text-[12px] text-muted-foreground">
            {metric.value === null ? 'Meta өгөөгүй' : metric.delta === null ? 'харьцуулах өгөгдөлгүй' : <>
                <span className={metric.delta > 0 ? 'text-status-success' : metric.delta < 0 ? 'text-status-danger' : ''}>
                    {metric.kind === 'latest' || metric.deltaPct === null ? `${sign}${count(metric.delta)}` : `${sign}${metric.deltaPct}%`}
                </span>
                {metric.kind === 'latest' ? '' : metric.days < 7 ? ` · ${metric.days}/7 өдөр` : ''}
            </>}
        </div>
    </div>;
}

function MonthBudget({ today }: { today: string }) {
    const { shop, user } = useAuth();
    const year = Number(today.slice(0, 4));
    const month = Number(today.slice(5, 7));
    const query = useQuery<BudgetResponse>({
        queryKey: ['marketing-budget', 'home', shop?.id, user?.id, year],
        queryFn: ({ signal }) => dashboardJson(`/api/marketing/budget?year=${year}`, { signal, shopId: shop?.id }),
        enabled: !!shop?.id, staleTime: 60_000, retry: 1,
    });
    const row = query.data?.overview?.months[month - 1];
    return (
        <Panel title={`${month}-р сарын төсөв`}
            right={<Link href="/marketing/budget" className="inline-flex items-center gap-1 text-[12px] font-medium text-brand-strong hover:underline focus-ring">Төсөв <ChevronRight className="h-3.5 w-3.5" /></Link>}
            bodyClassName="flex flex-col gap-2 p-4">
            {query.isPending ? <Skeleton className="h-16" />
                : query.isError ? <p className="text-[12.5px] text-status-danger">{query.error.message}</p>
                : !query.data.available || !row ? <p className="text-[12.5px] text-muted-foreground">{query.data.error || 'Төсвийн мэдээлэл алга.'}</p>
                : <>
                    <div className="flex items-baseline justify-between gap-2">
                        <span className="num text-[18px] font-semibold">{formatMNTShort(row.spend)}</span>
                        <span className="text-[12px] text-muted-foreground">{row.budget ? <>төсөв {formatMNTShort(row.budget)} · <span className={cn('font-medium', row.status === 'over' ? 'text-status-danger' : row.status === 'warn' ? 'text-status-pending' : 'text-foreground')}>{row.pct}%</span></> : 'сарын төсөв оруулаагүй'}</span>
                    </div>
                    {row.budget > 0 && <Progress value={row.spend} max={row.budget} overColor={false} />}
                    <p className="text-[12px] text-muted-foreground">Зарцуулалт = гар бүртгэл + Meta-гийн өдрийн зардал (ханштай нь төгрөгөөр).{query.data.spendQuality?.missingFx ? ` Ханшгүй ${query.data.spendQuality.missingFx} мөр нийтэд ороогүй.` : ''}</p>
                </>}
        </Panel>
    );
}

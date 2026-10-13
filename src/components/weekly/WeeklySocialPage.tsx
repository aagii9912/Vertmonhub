'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { ArrowUpRight } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { dashboardJson } from '@/lib/api/dashboardFetch';
import { ubDateStr } from '@/lib/utils/date';
import { cn } from '@/lib/utils';
import type { SocialWeek, SocialWeekMetric } from '@/lib/marketing/social-week';
import { Skeleton } from '@/components/dashboard/v2/primitives';

const count = (value: number | null) => value === null ? '—' : value.toLocaleString('en-US');

export function useSocialWeek(meetingDate: string, enabled: boolean) {
    const { shop, user } = useAuth();
    return useQuery<SocialWeek>({
        queryKey: ['social-week', shop?.id, user?.id, meetingDate],
        queryFn: async ({ signal }) => (await dashboardJson<{ week: SocialWeek }>(`/api/dashboard/marketing/social-week?meetingDate=${meetingDate}`, { signal, shopId: shop?.id })).week,
        enabled: !!shop?.id && enabled, staleTime: 60_000, retry: 1,
    });
}

/** Хурлын долоо хоногийн Facebook хуудасны органик үзүүлэлт (хадгалсан insights) ба нийтэлсэн постууд. */
export function WeeklySocialPage({ meetingDate }: { meetingDate: string }) {
    const query = useSocialWeek(meetingDate, true);
    if (query.isPending) return <Skeleton className="h-32 rounded-2xl" />;
    if (query.isError) return <p className="text-xs text-status-danger">Facebook хуудас: {query.error.message}</p>;
    const week = query.data;
    if (!week.page) {
        return <p className="text-xs text-muted-foreground">Facebook хуудас холбогдоогүй. <Link href="/marketing/social" className="text-brand-strong hover:underline focus-ring">Маркетинг → Сошиал</Link> хэсэгт холбоно.</p>;
    }
    const days = Math.max(0, ...week.metrics.map(metric => metric.days));
    const top = week.posts.slice(0, 3);
    return (
        <div className="rounded-2xl border border-border p-5">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="text-sm font-semibold">{week.page.name || 'Facebook хуудас'}</p>
                <p className="text-xs text-muted-foreground">
                    Meta-гийн өдөр (Номхон далайн цаг){days && days < week.rangeDays ? ` · ${days}/${week.rangeDays} өдрийн өгөгдөл` : ''}
                    {week.syncedTo ? ` · синк ${week.syncedTo} хүртэл` : ' · синк хийгдээгүй'}
                </p>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
                {week.metrics.map(metric => <Metric key={metric.metric} metric={metric} rangeDays={week.rangeDays} />)}
            </div>
            <div className="mt-5 border-t border-border pt-4">
                <p className="text-xs font-medium text-muted-foreground">Энэ долоо хоногт нийтэлсэн пост: {week.posts.length}</p>
                {top.length > 0 && (
                    <ul className="mt-2 space-y-1.5">
                        {top.map(post => (
                            <li key={post.id} className="flex items-baseline gap-3 text-sm">
                                <span className="num shrink-0 text-xs text-muted-foreground">{post.publishedAt ? ubDateStr(new Date(post.publishedAt)).slice(5) : '—'}</span>
                                <span className="min-w-0 flex-1 truncate">{post.content?.replace(/\s+/g, ' ').trim() || '(текстгүй пост)'}</span>
                                <span className="num shrink-0 text-xs text-muted-foreground">үзэлт {count(post.views)} · like {count(post.likes)} · сэтгэгдэл {count(post.comments)}</span>
                            </li>
                        ))}
                    </ul>
                )}
            </div>
            <Link href="/marketing/social" className="mt-4 inline-flex items-center gap-1 text-xs text-brand-strong hover:underline focus-ring print:hidden">Сошиал хуудас<ArrowUpRight className="size-3" /></Link>
        </div>
    );
}

function Metric({ metric, rangeDays }: { metric: SocialWeekMetric; rangeDays: number }) {
    const sign = metric.delta !== null && metric.delta > 0 ? '+' : '';
    return (
        <div>
            <p className="text-xs text-muted-foreground">{metric.label}</p>
            <p className="num mt-1.5 text-lg font-semibold">{count(metric.value)}</p>
            {metric.value === null ? <p className="mt-0.5 text-xs text-muted-foreground">Meta өгөөгүй</p> : <p className="mt-0.5 text-xs text-muted-foreground">
                {metric.kind === 'latest' && metric.day ? `${metric.day}-ны байдлаар · ` : metric.days && metric.days < rangeDays ? `${metric.days}/${rangeDays} өдөр · ` : ''}
                {metric.comparison === 'week-ago' ? '7 хоногийн өмнө' : metric.comparison === 'same-days' ? 'өмнөх 7 хоногийн мөн өдрүүд' : 'өмнөх 7 хоног'} {count(metric.previous)}
                {metric.delta !== null && (
                    <span className={cn('ml-1', metric.delta > 0 ? 'text-status-success' : metric.delta < 0 ? 'text-status-danger' : '')}>
                        {sign}{count(metric.delta)}{metric.deltaPct !== null ? ` (${sign}${metric.deltaPct}%)` : ''}
                    </span>
                )}
            </p>}
        </div>
    );
}

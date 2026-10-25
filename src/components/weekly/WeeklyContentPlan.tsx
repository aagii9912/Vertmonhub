'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowUpRight, ImageIcon, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { dashboardJson, dashboardMutate } from '@/lib/api/dashboardFetch';
import {
    CONTENT_STATUS_LABEL, CONTENT_STATUSES, CONTENT_TYPE_LABEL, contentPlatformLabel, summarizeContentPlan,
    type ContentItem, type ContentPlanSummary, type ContentStatus,
} from '@/lib/marketing/content-plan';
import { previousContentText, shiftReviewDate } from '@/lib/dashboard/weekly-review';
import { ubDateStr } from '@/lib/utils/date';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/dashboard/v2/primitives';
import { ContentItemDialog } from '@/components/marketing/ContentItemDialog';

/** Өмнөх хурлын долоо хоног (харьцуулалт), хурлын долоо хоног ба дараагийн 7 хоногийн контент (нэг хүсэлтээр). */
export function contentPlanWindow(meetingDate: string, range: { from: string; to: string }) {
    const previous = { from: shiftReviewDate(range.from, -7), to: shiftReviewDate(range.from, -1) };
    return { from: previous.from, to: shiftReviewDate(meetingDate, 6), previous, next: { from: meetingDate, to: shiftReviewDate(meetingDate, 6) } };
}

export function useContentPlan(meetingDate: string, range: { from: string; to: string }, enabled: boolean) {
    const { shop, user } = useAuth();
    const window = contentPlanWindow(meetingDate, range);
    return useQuery<{ items: ContentItem[] }>({
        queryKey: ['content-plan', shop?.id, user?.id, window.from, window.to],
        queryFn: ({ signal }) => dashboardJson(`/api/marketing/content-plan?from=${window.from}&to=${window.to}`, { signal, shopId: shop?.id }),
        enabled: !!shop?.id && enabled, staleTime: 30_000, retry: 1,
    });
}

const STATUS_TONE: Record<ContentStatus, string> = {
    planned: 'bg-surface-2 text-fg-2',
    in_progress: 'bg-status-pending-soft text-status-pending',
    ready: 'bg-status-info-soft text-status-info',
    published: 'bg-status-success-soft text-status-success',
    cancelled: 'bg-surface-2 text-muted-foreground line-through',
};

/**
 * Маркетингийн албаны өөрийн төлөвлөгөө: тайлант долоо хоногт төлөвлөсөн контент, гүйцэтгэл
 * (нийтэлсэн / хоцорсон), дараагийн 7 хоногийн төлөвлөгөө. Борлуулалтын лид, гэрээгээр хэмжихгүй.
 */
export function WeeklyContentPlan({ meetingDate, range, query, canWrite, canDelete }: {
    meetingDate: string; range: { from: string; to: string }; query: ReturnType<typeof useContentPlan>; canWrite: boolean; canDelete: boolean;
}) {
    const { shop } = useAuth();
    const queryClient = useQueryClient();
    const [editing, setEditing] = useState<ContentItem | { date: string } | null>(null);
    const refresh = () => Promise.all([
        queryClient.invalidateQueries({ queryKey: ['content-plan', shop?.id] }),
        queryClient.invalidateQueries({ queryKey: ['marketing-calendar'] }),
    ]);
    const setStatus = useMutation({
        mutationFn: ({ item, status }: { item: ContentItem; status: ContentStatus }) => dashboardMutate(`/api/marketing/content-plan/${item.id}`, 'PATCH', { status }, { shopId: shop?.id }),
        onSuccess: () => { void refresh(); toast.success('Төлөв шинэчлэгдлээ'); },
        onError: error => { toast.error(error.message); void refresh(); },
    });
    if (query.isPending) return <Skeleton className="h-40" />;
    if (!query.data) return <p className="rounded-xl bg-surface-2 p-4 text-sm text-muted-foreground">Контент төлөвлөгөөг ачаалж чадсангүй. {query.error?.message}</p>;
    const window = contentPlanWindow(meetingDate, range);
    const week = summarizeContentPlan(query.data.items, range, ubDateStr());
    const next = summarizeContentPlan(query.data.items, window.next, ubDateStr());
    const previous = summarizeContentPlan(query.data.items, window.previous, ubDateStr());

    return (
        <div className="space-y-5">
            <div className="grid grid-cols-2 gap-5 rounded-2xl border border-border p-5 sm:grid-cols-4">
                <Figure label="Төлөвлөсөн контент" value={week.planned} />
                <Figure label="Нийтэлсэн" value={week.published} helper={week.pct === null ? 'Төлөвлөгөө алга' : `Төлөвлөгөөний ${week.pct}%`} />
                <Figure label="Хийгдэж буй / бэлэн" value={week.inProgress} />
                <Figure label="Хоцорсон" value={week.overdue} helper="Огноо өнгөрсөн, нийтлээгүй" tone={week.overdue ? 'danger' : undefined} />
            </div>
            <p className="text-xs text-muted-foreground">{previousContentText(previous)} ({window.previous.from.slice(5)} – {window.previous.to.slice(5)})</p>
            {week.byType.length > 0 && <p className="text-xs text-muted-foreground">{week.byType.map(row => `${row.label} ${row.published}/${row.planned}`).join(' · ')}{week.cancelled ? ` · цуцалсан ${week.cancelled}` : ''}</p>}

            <ContentTable title={`Тайлант долоо хоног (${range.from.slice(5)} – ${range.to.slice(5)})`} summary={week} canWrite={canWrite} pending={setStatus.isPending}
                onOpen={setEditing} onStatus={(item, status) => setStatus.mutate({ item, status })} empty="Энэ долоо хоногт контент төлөвлөөгүй." />
            <ContentTable title={`Дараагийн 7 хоногийн төлөвлөгөө (${window.next.from.slice(5)} – ${window.next.to.slice(5)})`} summary={next} canWrite={canWrite} pending={setStatus.isPending}
                onOpen={setEditing} onStatus={(item, status) => setStatus.mutate({ item, status })} empty="Дараагийн 7 хоногт контент төлөвлөөгүй." />

            <div className="flex flex-wrap items-center gap-3 print:hidden">
                {canWrite && <Button size="sm" variant="secondary" onClick={() => setEditing({ date: meetingDate })}><Plus />Контент нэмэх</Button>}
                <Link href="/marketing/calendar" className="inline-flex items-center gap-1 text-xs text-brand-strong hover:underline focus-ring">Контент календарь<ArrowUpRight className="size-3" /></Link>
            </div>
            {editing && <ContentItemDialog key={'id' in editing ? editing.id : 'new'} item={'id' in editing ? editing : undefined} defaultDate={'date' in editing ? editing.date : meetingDate}
                canWrite={canWrite} canDelete={canDelete} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); void refresh(); }} />}
        </div>
    );
}

function ContentTable({ title, summary, canWrite, pending, onOpen, onStatus, empty }: {
    title: string; summary: ContentPlanSummary; canWrite: boolean; pending: boolean; empty: string;
    onOpen: (item: ContentItem) => void; onStatus: (item: ContentItem, status: ContentStatus) => void;
}) {
    return <section className="break-inside-avoid space-y-2">
        <h3 className="text-sm font-medium">{title}</h3>
        {summary.items.length ? <div className="max-w-full overflow-x-auto rounded-xl border border-border focus-ring print:overflow-visible" tabIndex={0} role="region" aria-label={title}>
            <table className="w-full text-left text-[12.5px]">
                <thead className="bg-surface-2 text-[11px] text-muted-foreground"><tr>
                    {['Огноо', 'Төрөл', 'Платформ', 'Контент', 'Хариуцагч', 'Төлөв'].map(cell => <th key={cell} scope="col" className="whitespace-nowrap px-2 py-2 font-medium">{cell}</th>)}
                </tr></thead>
                <tbody>{summary.items.map(item => {
                    const overdue = summary.overdueItems.includes(item);
                    return <tr key={item.id} className="border-t border-border">
                        <td className={cn('num whitespace-nowrap px-2 py-2', overdue && 'text-status-danger')}>{item.scheduled_date.slice(5)}</td>
                        <td className="px-2">{CONTENT_TYPE_LABEL[item.type] ?? item.type}</td>
                        <td className="px-2">{contentPlatformLabel(item.platform)}</td>
                        <td className="max-w-[280px] px-2">
                            <button type="button" onClick={() => onOpen(item)} className="flex min-h-9 items-center gap-1.5 text-left font-medium hover:underline focus-ring">
                                <span className="break-words">{item.title}</span>
                                {item.image_paths.length > 0 && <ImageIcon className="size-3.5 shrink-0 text-muted-foreground" aria-label={`${item.image_paths.length} зураг`} />}
                            </button>
                        </td>
                        <td className="whitespace-nowrap px-2">{item.assigned_to || '—'}</td>
                        <td className="px-2">
                            {canWrite
                                ? <select aria-label={`${item.title} — төлөв`} value={item.status} disabled={pending} onChange={event => onStatus(item, event.target.value as ContentStatus)}
                                    className={cn('min-h-9 rounded-md border border-control px-2 text-xs focus-ring print:border-0', STATUS_TONE[item.status])}>
                                    {CONTENT_STATUSES.map(status => <option key={status} value={status}>{CONTENT_STATUS_LABEL[status]}</option>)}
                                </select>
                                : <span className={cn('rounded-md px-2 py-1 text-xs', STATUS_TONE[item.status])}>{CONTENT_STATUS_LABEL[item.status]}</span>}
                        </td>
                    </tr>;
                })}</tbody>
            </table>
        </div> : <p className="rounded-xl bg-surface-2 p-4 text-sm text-muted-foreground">{empty}</p>}
    </section>;
}

function Figure({ label, value, helper, tone }: { label: string; value: number; helper?: string; tone?: 'danger' }) {
    return <div><p className="text-xs text-muted-foreground">{label}</p><p className={cn('num mt-2 text-[24px] font-semibold tracking-tight', tone === 'danger' && 'text-status-danger')}>{value}</p>{helper && <p className="mt-1 text-xs text-muted-foreground">{helper}</p>}</div>;
}

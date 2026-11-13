'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2, Users } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { dashboardJson, dashboardMutate } from '@/lib/api/dashboardFetch';
import {
    WORK_PLAN_TITLE_MAX, assigneeInitials, workPlanMonthLabel, workPlanProgress, type WorkPlanAssignee, type WorkPlanData, type WorkPlanItem,
} from '@/lib/sales/work-plan';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Alert';
import { Input } from '@/components/ui/Input';
import { Checkbox } from '@/components/ui/Checkbox';
import { Skeleton } from '@/components/dashboard/v2/primitives';

export function useWorkPlan(month: string, enabled: boolean) {
    const { shop, user } = useAuth();
    return useQuery<WorkPlanData>({
        queryKey: ['work-plan', shop?.id, user?.id, month],
        queryFn: ({ signal }) => dashboardJson(`/api/dashboard/work-plan?month=${month}`, { signal, shopId: shop?.id }),
        enabled: !!shop?.id && enabled, staleTime: 30_000, retry: 1,
    });
}

const chipCls = 'inline-flex h-7 items-center rounded-md border px-2 text-xs font-medium focus-ring disabled:cursor-not-allowed disabled:opacity-50';

/** Хариуцагч сонгогч: жагсаалтын менежер бүр нэг товч (aria-pressed) + «Бүх баг». */
function AssigneePicker({ roster, value, onChange, disabled, label }: {
    roster: WorkPlanAssignee[]; value: string[]; onChange: (ids: string[]) => void; disabled?: boolean; label: string;
}) {
    if (!roster.length) return <p className="text-xs text-muted-foreground">Энэ төсөлд бүртгэлтэй идэвхтэй менежер алга тул хариуцагч оноох боломжгүй.</p>;
    const all = roster.every(manager => value.includes(manager.id));
    const toggle = (id: string) => onChange(value.includes(id) ? value.filter(item => item !== id) : [...value, id]);
    return <div role="group" aria-label={label} className="flex flex-wrap items-center gap-1.5">
        {roster.map(manager => {
            const on = value.includes(manager.id);
            return <button key={manager.id} type="button" aria-pressed={on} disabled={disabled} onClick={() => toggle(manager.id)}
                className={cn(chipCls, on ? 'border-brand bg-[var(--brand-soft)] text-brand-strong' : 'border-border-strong bg-surface text-foreground hover:bg-surface-2')}>
                {manager.name.split('.')[0]}
            </button>;
        })}
        <button type="button" disabled={disabled} onClick={() => onChange(all ? [] : roster.map(manager => manager.id))}
            className={cn(chipCls, 'border-dashed border-border-strong bg-surface text-muted-foreground hover:bg-surface-2')}>
            <Users className="mr-1 size-3.5" />{all ? 'Бүгдийг авах' : 'Бүх баг'}
        </button>
    </div>;
}

/**
 * Сарын «бусад ажлын төлөвлөгөө» (борлуулалтын багийн хүсэлт 2026-11-12): баг бүхэлдээ харна; бичих эрхтэй нь ажил нэмж,
 * хариуцагч оноож, хийгдсэнийг чеклэнэ. Лхагвын илтгэлийн «N-р сарын бусад ажлын төлөвлөгөө» слайд эндээс гарна.
 */
export function WeeklyWorkPlan({ month, canWrite, canDeleteOthers }: { month: string; canWrite: boolean; canDeleteOthers: boolean }) {
    const { shop, user } = useAuth();
    const queryClient = useQueryClient();
    const query = useWorkPlan(month, true);
    const [title, setTitle] = useState('');
    const [assignees, setAssignees] = useState<string[]>([]);
    const [editing, setEditing] = useState<{ id: string; ids: string[] } | null>(null);
    const refresh = () => queryClient.invalidateQueries({ queryKey: ['work-plan', shop?.id] });
    const onError = (error: unknown) => { toast.error(error instanceof Error ? error.message : 'Хадгалж чадсангүй'); };
    const create = useMutation({
        mutationFn: () => dashboardMutate<{ item: WorkPlanItem }>('/api/dashboard/work-plan', 'POST', { month, title, assigneeIds: assignees }, { shopId: shop?.id }),
        onSuccess: () => { setTitle(''); setAssignees([]); void refresh(); toast.success('Ажил нэмэгдлээ'); },
        onError,
    });
    const patch = useMutation({
        mutationFn: ({ id, body }: { id: string; body: { done?: boolean; assigneeIds?: string[] } }) =>
            dashboardMutate<{ item: WorkPlanItem }>(`/api/dashboard/work-plan/${id}`, 'PATCH', body, { shopId: shop?.id }),
        onSuccess: () => { setEditing(null); void refresh(); },
        onError,
    });
    const remove = useMutation({
        mutationFn: (id: string) => dashboardMutate<{ ok: boolean }>(`/api/dashboard/work-plan/${id}`, 'DELETE', undefined, { shopId: shop?.id }),
        onSuccess: () => { void refresh(); toast.success('Ажил устгагдлаа'); },
        onError,
    });

    if (query.isPending) return <Skeleton className="h-40" />;
    if (query.isError || !query.data) {
        return <Alert variant="warning">Ажлын төлөвлөгөөг уншиж чадсангүй. <button type="button" className="underline" onClick={() => void query.refetch()}>Дахин оролдох</button></Alert>;
    }
    const { items, roster, available } = query.data;
    if (!available) return <Alert variant="warning">Сарын ажлын төлөвлөгөө хараахан идэвхжээгүй байна. Админд хандаж шинэчлэлийг (migration) суулгана уу.</Alert>;
    const progress = workPlanProgress(items);
    const rosterNames = roster.map(manager => manager.name);
    const busy = create.isPending || patch.isPending || remove.isPending;

    return <div className="space-y-4">
        <p className="text-sm text-muted-foreground">
            {workPlanMonthLabel(month)} · хийгдсэн <span className="num font-medium text-foreground">{progress.done}/{progress.total}</span>
        </p>
        {items.length === 0 && <p className="rounded-xl bg-surface-2 px-4 py-3 text-sm text-muted-foreground">Энэ сарын ажил хараахан нэмэгдээгүй.</p>}
        {items.length > 0 && <ul className="divide-y divide-border rounded-xl border border-border">
            {items.map(item => {
                const initials = assigneeInitials(item.assignees.map(assignee => assignee.name), rosterNames);
                const own = item.created_by === user?.id;
                const editingThis = editing?.id === item.id;
                return <li key={item.id} className="space-y-2 px-4 py-3">
                    <div className="flex items-start gap-3">
                        <Checkbox id={`work-plan-${item.id}`} className="mt-0.5" checked={item.done} disabled={!canWrite || busy}
                            aria-label={`${item.title}: хийгдсэн`} onCheckedChange={checked => patch.mutate({ id: item.id, body: { done: checked === true } })} />
                        <div className="min-w-0 flex-1">
                            <p className={cn('text-sm', item.done ? 'text-muted-foreground line-through' : 'text-foreground')}>{item.title}</p>
                            <p className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                                {item.assignees.length
                                    ? item.assignees.map((assignee, index) => <span key={assignee.id} title={assignee.name} className="inline-flex items-center gap-1 rounded-md bg-surface-2 px-1.5 py-0.5">
                                        <span className="font-semibold text-foreground">{initials[index]}</span><span>{assignee.name.split('.')[0]}</span>
                                    </span>)
                                    : <span>Хариуцагчгүй</span>}
                                {item.done && item.done_by_name && <span>· ✓ {item.done_by_name}</span>}
                            </p>
                        </div>
                        {canWrite && <div className="flex shrink-0 items-center gap-1 print:hidden">
                            <Button variant="ghost" size="sm" disabled={busy} onClick={() => setEditing(editingThis ? null : { id: item.id, ids: item.assignees.map(assignee => assignee.id) })}>
                                {editingThis ? 'Болих' : 'Хариуцагч'}
                            </Button>
                            {(own || canDeleteOthers) && <Button variant="ghost" size="icon" aria-label={`${item.title}: устгах`} disabled={busy}
                                onClick={() => { if (window.confirm(`«${item.title}» ажлыг устгах уу?`)) remove.mutate(item.id); }}><Trash2 /></Button>}
                        </div>}
                    </div>
                    {editingThis && editing && <div className="flex flex-wrap items-center gap-2 pl-7 print:hidden">
                        {/* Одоогийн (идэвхгүй болсон ч) хариуцагч сонголтод үлдэнэ. */}
                        <AssigneePicker label={`${item.title}: хариуцагч`} disabled={busy} value={editing.ids} onChange={ids => setEditing({ id: item.id, ids })}
                            roster={[...roster, ...item.assignees.filter(assignee => !roster.some(manager => manager.id === assignee.id))]} />
                        <Button size="sm" disabled={busy} onClick={() => patch.mutate({ id: item.id, body: { assigneeIds: editing.ids } })}>Хадгалах</Button>
                    </div>}
                </li>;
            })}
        </ul>}
        {canWrite && <form className="space-y-2 rounded-xl border border-dashed border-border-strong p-4 print:hidden"
            onSubmit={event => { event.preventDefault(); if (title.trim()) create.mutate(); }}>
            <div className="flex flex-wrap items-center gap-2">
                <Input aria-label="Шинэ ажлын нэр" value={title} maxLength={WORK_PLAN_TITLE_MAX} placeholder="Жишээ: Showroom тохижуулах" className="min-w-[220px] flex-1"
                    onChange={event => setTitle(event.target.value)} />
                <Button type="submit" disabled={busy || !title.trim()}><Plus />Ажил нэмэх</Button>
            </div>
            <AssigneePicker label="Шинэ ажлын хариуцагч" roster={roster} value={assignees} onChange={setAssignees} disabled={busy} />
        </form>}
    </div>;
}

'use client';

import React, { useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { Phone, CalendarPlus, FileText, StickyNote, X, ExternalLink, PhoneCall, Check } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { formatMNT } from '@/lib/utils/currency';
import { formatShortDate, formatTime, formatRelativeDays } from '@/lib/utils/date';
import { useLeadDetail, useUpdateLead, useAddLeadActivity, type ManagerOption } from '@/hooks/useLeads';
import { INTEREST_CHIPS, ACTIVITY_LABEL, sourceLabel, interestLabel } from '@/lib/leads/labels';
import { Pill, Skeleton, GhostButton } from '@/components/dashboard/v2/primitives';
import { StatusPicker, ManagerPicker } from './pickers';
import { useRegisterAiContext } from '@/lib/ai/context';

/**
 * Лидийн хажуугийн панел — жагсаалтаас гаралгүй бүх ажлыг хийнэ:
 * статус/менежер/сонирхол/төсөв inline, уулзалт товлох, гэрээ үүсгэх,
 * тэмдэглэл + дуудлага бүртгэх, түүх, сонирхсон байр.
 */
export function LeadPanel({
    leadId,
    managers,
    canWrite,
    onClose,
    className,
}: {
    leadId: string;
    managers: ManagerOption[];
    canWrite: boolean;
    onClose?: () => void;
    className?: string;
}) {
    const { data, isLoading } = useLeadDetail(leadId);
    const update = useUpdateLead();
    const addActivity = useAddLeadActivity(leadId);
    const noteRef = useRef<HTMLTextAreaElement>(null);
    const [note, setNote] = useState('');
    const [isCall, setIsCall] = useState(false);
    const [followup, setFollowup] = useState<number | null>(null); // хоног
    const [budgetDraft, setBudgetDraft] = useState<string | null>(null);

    const lead = data?.lead;
    useRegisterAiContext(lead ? { type: 'lead', id: lead.id, label: lead.customer_name || 'Нэргүй лид' } : null);

    const timeline = useMemo(() => {
        if (!data) return [];
        const items: { at: string; kind: string; title: string; sub?: string; by?: string | null }[] = [];
        for (const a of data.activities) {
            items.push({ at: a.created_at, kind: a.type, title: a.type === 'note' || a.type === 'call' ? a.content || '' : `${ACTIVITY_LABEL[a.type] ?? a.type}: ${a.content ?? ''}`, by: a.created_by_name });
        }
        for (const v of data.viewings) {
            items.push({ at: v.scheduled_at, kind: 'meeting', title: `Уулзалт ${v.status === 'completed' ? 'болов' : v.status === 'cancelled' ? 'цуцлагдав' : v.status === 'no_show' ? '— ирээгүй' : 'товлов'}`, sub: [formatTime(v.scheduled_at), v.property_name].filter(Boolean).join(' · '), by: v.sales_manager_name });
        }
        for (const c of data.contracts) {
            if (c.contract_date) items.push({ at: c.contract_date, kind: 'contract', title: `Гэрээ ${c.contract_number || ''}`.trim(), sub: c.total_price ? formatMNT(c.total_price) : undefined });
        }
        items.push({ at: data.lead.created_at, kind: 'system', title: 'Лид үүсгэв', sub: sourceLabel(data.lead.source) });
        return items.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
    }, [data]);

    const saveNote = async () => {
        const content = note.trim();
        if (!content && !isCall) return;
        try {
            const next = followup ? new Date(Date.now() + followup * 86_400_000) : undefined;
            if (next) next.setHours(10, 0, 0, 0);
            await addActivity.mutateAsync({ type: isCall ? 'call' : 'note', content: content || 'Залгав', next_followup_at: next ? next.toISOString() : undefined });
            setNote(''); setIsCall(false); setFollowup(null);
            toast.success(isCall ? 'Дуудлага бүртгэгдлээ' : 'Тэмдэглэл хадгалагдлаа');
        } catch (e) {
            toast.error(e instanceof Error ? e.message : 'Хадгалж чадсангүй');
        }
    };

    const patch = (p: Parameters<typeof update.mutate>[0]['patch']) => update.mutate({ id: leadId, patch: p }, { onError: (e) => toast.error(e instanceof Error ? e.message : 'Алдаа') });

    if (isLoading || !lead) {
        return (
            <div className={cn('flex flex-col gap-3 p-4', className)}>
                <Skeleton className="h-6 w-48" /><Skeleton className="h-32" /><Skeleton className="h-9" /><Skeleton className="h-40" />
            </div>
        );
    }

    const phoneDigits = lead.customer_phone?.replace(/\D/g, '') || '';
    const interestValue = INTEREST_CHIPS.find((c) => (c.rooms && c.rooms === lead.preferred_rooms) || (c.type && c.type === lead.preferred_type))?.label ?? '';

    return (
        <div className={cn('flex h-full min-h-0 flex-col', className)}>
            {/* Толгой */}
            <header className="flex h-[52px] shrink-0 items-center gap-2.5 border-b border-border px-4">
                <h2 className="truncate text-[16px] font-semibold text-foreground">{lead.customer_name || 'Нэргүй лид'}</h2>
                <StatusPicker value={lead.status} disabled={!canWrite} size="md" onChange={(s, reason) => patch({ status: s, ...(reason !== undefined ? { lost_reason: reason } : {}) })} />
                {onClose && (
                    <button type="button" onClick={onClose} className="ml-auto flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-surface-2 hover:text-foreground focus-ring" aria-label="Хаах">
                        <X className="h-4 w-4" />
                    </button>
                )}
            </header>

            <div className="min-h-0 flex-1 overflow-y-auto">
                {/* Баримт */}
                <div className="grid grid-cols-[110px_1fr] gap-x-3 gap-y-2 border-b border-border px-4 py-3 text-[12.5px]">
                    <Label>Утас</Label>
                    <div className="flex items-center gap-2">
                        <span className="mono-label text-foreground">{lead.customer_phone || '—'}</span>
                        {phoneDigits && <a href={`tel:${phoneDigits}`} className="flex h-6 w-6 items-center justify-center rounded-md text-brand hover:bg-brand-soft" aria-label="Залгах"><Phone className="h-3.5 w-3.5" /></a>}
                    </div>
                    <Label>Эх үүсвэр</Label>
                    <div className="text-foreground">{sourceLabel(lead.source)}</div>
                    <Label>Сонирхол</Label>
                    <div>
                        {canWrite ? (
                            <select
                                value={interestValue}
                                onChange={(e) => {
                                    const c = INTEREST_CHIPS.find((x) => x.label === e.target.value);
                                    patch({ preferred_rooms: c?.rooms ?? null, preferred_type: c?.type ?? (c ? null : lead.preferred_type) });
                                }}
                                className="-ml-1 h-6 rounded-md bg-transparent px-1 text-[12.5px] text-foreground outline-none hover:bg-surface-2 focus:bg-surface-2"
                            >
                                <option value="">{interestValue ? '—' : interestLabel(lead) === '—' ? '—' : interestLabel(lead)}</option>
                                {INTEREST_CHIPS.map((c) => <option key={c.label} value={c.label}>{c.label}</option>)}
                            </select>
                        ) : (
                            <span className="text-foreground">{interestLabel(lead)}</span>
                        )}
                        {lead.property_id && data?.property && <span className="mono-label ml-1 text-muted-foreground">· {data.property.name}</span>}
                    </div>
                    <Label>Төсөв</Label>
                    <div>
                        {canWrite ? (
                            <input
                                value={budgetDraft ?? (lead.budget_max ? String(lead.budget_max) : '')}
                                onFocus={() => setBudgetDraft(lead.budget_max ? String(lead.budget_max) : '')}
                                onChange={(e) => setBudgetDraft(e.target.value)}
                                onBlur={() => {
                                    if (budgetDraft === null) return;
                                    const n = Number(budgetDraft.replace(/\D/g, ''));
                                    const val = n > 0 ? n : null;
                                    if (val !== (lead.budget_max ?? null)) patch({ budget_max: val });
                                    setBudgetDraft(null);
                                }}
                                placeholder="—"
                                inputMode="numeric"
                                className="mono-label -ml-1 h-6 w-40 rounded-md bg-transparent px-1 text-[12.5px] text-foreground outline-none placeholder:text-muted-foreground hover:bg-surface-2 focus:bg-surface-2"
                            />
                        ) : (
                            <span className="mono-label text-foreground">{lead.budget_max ? formatMNT(lead.budget_max) : '—'}</span>
                        )}
                    </div>
                    <Label>Менежер</Label>
                    <div><ManagerPicker value={lead.sales_manager_name ?? null} options={managers} disabled={!canWrite} onChange={(n) => patch({ sales_manager_name: n })} /></div>
                    <Label>Дараагийн алхам</Label>
                    <div className="text-foreground">{nextStep(lead)}</div>
                    <Label>Сүүлд холбогдсон</Label>
                    <div className="mono-label text-fg-2">{formatRelativeDays(lead.last_contact_at || lead.created_at)}</div>
                </div>

                {/* Үйлдэл */}
                <div className="flex flex-wrap gap-2 border-b border-border px-4 py-3">
                    <Link href={`/dashboard/viewings?lead=${lead.id}&new=1`} className="inline-flex h-[30px] items-center gap-1.5 rounded-md bg-brand px-2.5 text-[12.5px] font-medium text-brand-fg hover:bg-brand-strong focus-ring">
                        <CalendarPlus className="h-4 w-4" /> Уулзалт товлох
                    </Link>
                    <button type="button" onClick={() => noteRef.current?.focus()} className="inline-flex h-[30px] items-center gap-1.5 rounded-md border border-border-strong bg-surface px-2.5 text-[12.5px] font-medium text-foreground hover:bg-surface-2 focus-ring">
                        <StickyNote className="h-4 w-4" /> Тэмдэглэл
                    </button>
                    <Link href={`/dashboard/contracts/generate?lead=${lead.id}`} className="inline-flex h-[30px] items-center gap-1.5 rounded-md border border-border-strong bg-surface px-2.5 text-[12.5px] font-medium text-foreground hover:bg-surface-2 focus-ring">
                        <FileText className="h-4 w-4" /> Гэрээ үүсгэх
                    </Link>
                </div>

                {/* Тэмдэглэл бичих */}
                {canWrite && (
                    <div className="border-b border-border px-4 py-3">
                        <div className={cn('rounded-md border bg-surface transition-shadow', note || isCall ? 'border-brand shadow-[0_0_0_3px_var(--brand-soft)]' : 'border-border-strong')}>
                            <textarea
                                ref={noteRef}
                                value={note}
                                onChange={(e) => setNote(e.target.value)}
                                onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) void saveNote(); }}
                                rows={2}
                                placeholder="Тэмдэглэл бичих… (⌘↵ хадгална)"
                                className="w-full resize-none bg-transparent px-2.5 pt-2 text-[13px] outline-none placeholder:text-muted-foreground"
                            />
                            <div className="flex flex-wrap items-center gap-1.5 px-2 pb-2">
                                <button type="button" onClick={() => setIsCall((v) => !v)} className={cn('inline-flex h-6 items-center gap-1 rounded-md border px-2 text-[11.5px] focus-ring', isCall ? 'border-brand bg-brand-soft text-brand' : 'border-border text-fg-2 hover:border-border-strong')}>
                                    <PhoneCall className="h-3 w-3" /> Залгав
                                </button>
                                <span className="mx-1 text-[11px] text-muted-foreground">Дараа:</span>
                                {[1, 3, 7].map((d) => (
                                    <button key={d} type="button" onClick={() => setFollowup(followup === d ? null : d)} className={cn('h-6 rounded-md border px-2 text-[11.5px] focus-ring', followup === d ? 'border-brand bg-brand-soft text-brand' : 'border-border text-fg-2 hover:border-border-strong')}>
                                        {d === 1 ? 'Маргааш' : `${d} хоног`}
                                    </button>
                                ))}
                                <button type="button" disabled={addActivity.isPending || (!note.trim() && !isCall)} onClick={() => void saveNote()} className="ml-auto inline-flex h-7 items-center gap-1 rounded-md bg-brand px-2.5 text-[12px] font-medium text-brand-fg hover:bg-brand-strong disabled:opacity-50 focus-ring">
                                    <Check className="h-3.5 w-3.5" /> Хадгалах
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* Түүх */}
                <div className="px-4 py-3">
                    <div className="mb-2 flex items-center gap-2 text-[12.5px] font-semibold text-foreground">Түүх <span className="mono-label text-[11px] font-normal text-muted-foreground">{timeline.length}</span></div>
                    <ol className="relative flex flex-col gap-3 border-l border-border pl-4">
                        {timeline.map((t, i) => (
                            <li key={`${t.kind}-${t.at}-${i}`} className="relative">
                                <span className={cn('absolute -left-[21px] top-1.5 h-2 w-2 rounded-full', i === 0 ? 'bg-brand' : 'bg-border-strong')} />
                                <div className="mono-label text-[11px] text-muted-foreground">{formatShortDate(t.at)} {t.kind === 'meeting' ? '' : formatTime(t.at)}{t.by ? ` · ${t.by}` : ''}</div>
                                <div className="text-[13px] text-foreground">{t.title}</div>
                                {t.sub && <div className="text-[12px] text-muted-foreground">{t.sub}</div>}
                            </li>
                        ))}
                    </ol>
                </div>

                {/* Сонирхсон байр */}
                {(data?.property || (data?.viewings.some((v) => v.property_id && v.property_id !== data.property?.id) ?? false)) && (
                    <div className="border-t border-border px-4 py-3">
                        <div className="mb-2 text-[12.5px] font-semibold text-foreground">Сонирхсон байр</div>
                        <div className="flex flex-col gap-1">
                            {data?.property && (
                                <Link href={`/dashboard/properties/${data.property.id}`} className="flex items-center gap-3 rounded-md border border-border px-3 py-2 hover:bg-surface-2">
                                    <span className="mono-label text-[12.5px] text-foreground">{data.property.name}</span>
                                    {data.property.rooms && <span className="text-[12px] text-fg-2">{data.property.rooms} өрөө</span>}
                                    {data.property.size_sqm && <span className="mono-label text-[12px] text-fg-2">{data.property.size_sqm} м²</span>}
                                    <span className="num ml-auto text-[12.5px] text-foreground">{data.property.price ? formatMNT(data.property.price) : ''}</span>
                                    <Pill tone={data.property.status === 'available' ? 'success' : data.property.status === 'reserved' ? 'pending' : 'neutral'}>
                                        {data.property.status === 'available' ? 'Боломжтой' : data.property.status === 'reserved' ? 'Захиалагдсан' : data.property.status === 'sold' ? 'Зарагдсан' : data.property.status || '—'}
                                    </Pill>
                                </Link>
                            )}
                            {data?.viewings.filter((v) => v.property_id && v.property_id !== data.property?.id).slice(0, 4).map((v) => (
                                <Link key={v.id} href={`/dashboard/properties/${v.property_id}`} className="flex items-center gap-3 rounded-md border border-border px-3 py-2 hover:bg-surface-2">
                                    <span className="mono-label text-[12.5px] text-foreground">{v.property_name || 'Байр'}</span>
                                    <span className="ml-auto text-[12px] text-muted-foreground">уулзалт · {formatShortDate(v.scheduled_at)}</span>
                                    <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
                                </Link>
                            ))}
                        </div>
                    </div>
                )}
            </div>

            {lead.notes && (
                <div className="shrink-0 border-t border-border px-4 py-2 text-[12px] text-muted-foreground">
                    <span className="font-medium text-fg-2">Анхны тэмдэглэл: </span>{lead.notes}
                </div>
            )}
            <GhostButton className="hidden" aria-hidden />
        </div>
    );
}

function Label({ children }: { children: React.ReactNode }) {
    return <span className="pt-0.5 text-[12px] text-muted-foreground">{children}</span>;
}

export function nextStep(lead: { next_followup_at?: string | null; viewing_scheduled_at?: string | null; status: string }): string {
    const now = Date.now();
    if (lead.next_followup_at) {
        const d = new Date(lead.next_followup_at);
        const overdue = d.getTime() < now - 86_400_000;
        return `${overdue ? 'Залгах · хоцорсон' : 'Залгах'} ${isToday(d) ? formatTime(d) : formatShortDate(d)}`;
    }
    if (lead.viewing_scheduled_at && new Date(lead.viewing_scheduled_at).getTime() > now - 86_400_000) {
        const d = new Date(lead.viewing_scheduled_at);
        return `Уулзалт ${isToday(d) ? formatTime(d) : formatShortDate(d)}`;
    }
    if (lead.status === 'offered') return 'Хариу авах';
    if (lead.status === 'negotiating') return 'Хэлэлцээ үргэлжлүүлэх';
    if (lead.status === 'new') return 'Залгах';
    if (lead.status === 'closed_won') return 'Гэрээтэй';
    return '—';
}

function isToday(d: Date) {
    const n = new Date();
    return d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth() && d.getDate() === n.getDate();
}

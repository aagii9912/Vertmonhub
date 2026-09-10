'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { CalendarPlus, Check, ChevronDown, MapPin, Phone, Star, UserX, X, ArrowRight, Search, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { useMobile } from '@/hooks/use-mobile';
import { canAccessModuleDynamic } from '@/lib/rbac';
import { formatTime, formatShortDate } from '@/lib/utils/date';
import { formatMNT } from '@/lib/utils/currency';
import { useViewings, useCreateViewing, useUpdateViewing, usePropertySearch, type ViewingRow, type ViewingRange, type PropertyOption } from '@/hooks/useViewings';
import { useLeadDetail, useManagers } from '@/hooks/useLeads';
import { MEETING_TYPES, MEETING_TYPE_META, VIEWING_STATUS_META, viewingStatusLabel, viewingStatusTone, dayHeading, type MeetingType } from '@/lib/viewings/labels';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/Sheet';
import { Avatar, Pill, Skeleton, GhostButton } from '@/components/dashboard/v2/primitives';

/**
 * «Уулзалт» v2 — өдрөөр бүлэглэсэн нягт жагсаалт; товлох ба үр дүн бүртгэх
 * хоёулаа хажуугийн sheet (хуудас солихгүй). ?lead=&new=1 → лидээс шууд.
 */

const TABS: { key: ViewingRange; label: string }[] = [
    { key: 'today', label: 'Өнөөдөр' },
    { key: 'upcoming', label: 'Удахгүй' },
    { key: 'past', label: 'Өнгөрсөн' },
    { key: 'all', label: 'Бүгд' },
];

export function ViewingsPage() {
    const router = useRouter();
    const search = useSearchParams();
    const isMobile = useMobile().isMobile;
    const { user } = useAuth();
    const canWrite = !!user?.permissions && canAccessModuleDynamic(user.permissions, 'viewings') && !!user.permissions.canWrite;

    const [range, setRange] = useState<ViewingRange>('upcoming');
    const [status, setStatus] = useState('all');
    const [manager, setManager] = useState('all');
    const [createOpen, setCreateOpen] = useState(false);
    const [prefillLead, setPrefillLead] = useState<string | null>(null);
    const [outcomeFor, setOutcomeFor] = useState<ViewingRow | null>(null);

    useEffect(() => {
        const lead = search.get('lead');
        if (search.get('new') === '1') {
            setPrefillLead(lead);
            setCreateOpen(true);
            router.replace('/dashboard/viewings');
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const { data, isLoading } = useViewings({ range, status, manager });
    const { data: managers = [] } = useManagers();
    const update = useUpdateViewing();
    const now = useMemo(() => Date.now(), [data]); // eslint-disable-line react-hooks/exhaustive-deps -- өгөгдөл шинэчлэгдэх бүрт «одоо» шинэчлэгдэнэ

    const groups = useMemo(() => {
        const map = new Map<string, ViewingRow[]>();
        for (const v of data?.viewings ?? []) {
            const d = new Date(v.scheduled_at);
            const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
            const list = map.get(key) ?? [];
            list.push(v);
            map.set(key, list);
        }
        return [...map.entries()].map(([key, items]) => ({ key, date: new Date(items[0].scheduled_at), items }));
    }, [data]);

    const patch = (id: string, p: Parameters<typeof update.mutate>[0]['patch'], msg?: string) =>
        update.mutate({ id, patch: p }, { onSuccess: () => msg && toast.success(msg), onError: (e) => toast.error(e instanceof Error ? e.message : 'Алдаа гарлаа') });

    const postpone = (v: ViewingRow) => {
        const d = new Date(v.scheduled_at);
        d.setDate(d.getDate() + 1);
        patch(v.id, { scheduled_at: d.toISOString() }, 'Маргааш руу хойшлуулав');
    };

    return (
        <div className="flex flex-col gap-3">
            <div className="flex items-center gap-1 overflow-x-auto no-scrollbar border-b border-border">
                {TABS.map((t) => {
                    const n = t.key === 'all' ? undefined : data?.counts[t.key];
                    const active = range === t.key;
                    return (
                        <button key={t.key} type="button" onClick={() => setRange(t.key)} className={cn('-mb-px flex h-9 shrink-0 items-center gap-1.5 border-b-2 px-2 text-[13px] font-medium transition-colors focus-ring', active ? 'border-brand text-foreground' : 'border-transparent text-fg-2 hover:text-foreground')}>
                            {t.label}
                            {typeof n === 'number' && <span className={cn('mono-label text-[11px]', active ? 'text-brand' : 'text-muted-foreground')}>{n}</span>}
                        </button>
                    );
                })}
                {canWrite && (
                    <button type="button" onClick={() => { setPrefillLead(null); setCreateOpen(true); }} className="ml-auto mb-1 inline-flex h-[30px] shrink-0 items-center gap-1.5 rounded-md bg-brand px-2.5 text-[12.5px] font-medium text-brand-fg hover:bg-brand-strong focus-ring">
                        <CalendarPlus className="h-4 w-4" /> Уулзалт товлох
                    </button>
                )}
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
                <Chip value={status} onChange={setStatus} label="Төлөв" options={Object.entries(VIEWING_STATUS_META).map(([k, m]) => [k, m.label])} />
                {managers.length > 0 && <Chip value={manager} onChange={setManager} label="Менежер" options={managers.map((m) => [m.name, m.name])} />}
            </div>

            <div className="rounded-md border border-border bg-surface">
                {isLoading ? (
                    <div className="flex flex-col gap-2 p-3">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-11" />)}</div>
                ) : groups.length === 0 ? (
                    <div className="flex flex-col items-center gap-3 px-4 py-12 text-center">
                        <div className="text-[13.5px] font-medium text-foreground">{range === 'today' ? 'Өнөөдөр уулзалт алга' : 'Уулзалт олдсонгүй'}</div>
                        <p className="max-w-xs text-[12.5px] text-muted-foreground">Лидийн панелаас эсвэл дээрх товчоор уулзалт товлоно.</p>
                        {canWrite && <button type="button" onClick={() => setCreateOpen(true)} className="inline-flex h-[30px] items-center gap-1.5 rounded-md bg-brand px-3 text-[12.5px] font-medium text-brand-fg hover:bg-brand-strong focus-ring"><CalendarPlus className="h-4 w-4" /> Уулзалт товлох</button>}
                    </div>
                ) : (
                    groups.map((g) => (
                        <div key={g.key}>
                            <div className="flex items-center gap-2 border-b border-border bg-surface-2/60 px-3.5 py-1.5">
                                <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">{dayHeading(g.date)}</span>
                                <span className="mono-label ml-auto text-[11px] text-muted-foreground">{g.items.length}</span>
                            </div>
                            {g.items.map((v) => (
                                <Row key={v.id} v={v} now={now} mobile={isMobile} canWrite={canWrite} busy={update.isPending} onArrived={() => setOutcomeFor(v)} onNoShow={() => patch(v.id, { status: 'no_show' }, 'Ирээгүй гэж тэмдэглэв')} onCancel={() => patch(v.id, { status: 'cancelled' }, 'Цуцлагдлаа')} onPostpone={() => postpone(v)} />
                            ))}
                        </div>
                    ))
                )}
            </div>

            {/* Товлох */}
            <Sheet open={createOpen} onOpenChange={(o) => { if (!o) { setCreateOpen(false); setPrefillLead(null); } }}>
                <SheetContent side="right" className="w-full p-0 sm:max-w-[440px]">
                    <SheetTitle className="sr-only">Уулзалт товлох</SheetTitle>
                    {createOpen && <CreateSheet leadId={prefillLead} onClose={() => { setCreateOpen(false); setPrefillLead(null); }} />}
                </SheetContent>
            </Sheet>

            {/* Үр дүн */}
            <Sheet open={!!outcomeFor} onOpenChange={(o) => !o && setOutcomeFor(null)}>
                <SheetContent side="right" className="w-full p-0 sm:max-w-[420px]">
                    <SheetTitle className="sr-only">Уулзалтын үр дүн</SheetTitle>
                    {outcomeFor && <OutcomeSheet v={outcomeFor} onClose={() => setOutcomeFor(null)} />}
                </SheetContent>
            </Sheet>
        </div>
    );
}

/* ------------------------------------------------------------------ */

function Row({ v, now, mobile, canWrite, busy, onArrived, onNoShow, onCancel, onPostpone }: { v: ViewingRow; now: number; mobile: boolean; canWrite: boolean; busy: boolean; onArrived: () => void; onNoShow: () => void; onCancel: () => void; onPostpone: () => void }) {
    const phone = v.lead?.customer_phone?.replace(/\D/g, '') || '';
    const past = new Date(v.scheduled_at).getTime() < now;
    const name = v.lead?.customer_name || 'Нэргүй';
    const mt = v.meeting_type ? MEETING_TYPE_META[v.meeting_type] : null;

    return (
        <div className={cn('group flex min-h-[48px] items-center gap-3 border-b border-border px-3.5 py-1.5 last:border-b-0 hover:bg-surface-2/70', v.status === 'scheduled' && past && 'bg-status-danger-soft/30')}>
            <span className={cn('mono-label w-11 shrink-0 text-[12.5px]', v.status === 'scheduled' && past ? 'text-status-danger' : 'text-fg-2')}>{formatTime(v.scheduled_at)}</span>
            <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                    {v.lead ? <Link href={`/dashboard/leads?lead=${v.lead.id}`} className="truncate text-[13px] font-medium text-foreground hover:text-brand">{name}</Link> : <span className="truncate text-[13px] font-medium text-foreground">{name}</span>}
                    {!mobile && v.lead?.customer_phone && <span className="mono-label text-[12px] text-muted-foreground">{v.lead.customer_phone}</span>}
                </div>
                <div className="flex items-center gap-1.5 truncate text-[12px] text-muted-foreground">
                    {v.property ? (<><MapPin className="h-3 w-3 shrink-0" /><span className="truncate">{v.property.name}{v.property.district ? ` · ${v.property.district}` : ''}</span></>) : <span>Байр сонгоогүй</span>}
                    {v.agent_notes && <span className="truncate">· {v.agent_notes}</span>}
                </div>
            </div>
            {!mobile && mt && <Pill tone={mt.tone}>{mt.label}</Pill>}
            {v.status === 'completed' && v.interest_level ? (
                <span className="hidden items-center gap-0.5 sm:flex" title={`Сонирхол ${v.interest_level}/5`}>
                    {[1, 2, 3, 4, 5].map((s) => <Star key={s} className={cn('h-3 w-3', s <= (v.interest_level || 0) ? 'fill-current text-status-pending' : 'text-border-strong')} />)}
                </span>
            ) : (
                <Pill tone={viewingStatusTone(v.status)} className="hidden sm:inline-flex">{viewingStatusLabel(v.status)}</Pill>
            )}
            {!mobile && v.sales_manager_name && <span className="hidden items-center gap-1.5 md:inline-flex"><Avatar name={v.sales_manager_name} /><span className="text-[12px] text-fg-2">{v.sales_manager_name}</span></span>}
            {canWrite && v.status === 'scheduled' && !mobile && (
                <div className="hidden shrink-0 items-center gap-0.5 group-hover:flex group-focus-within:flex">
                    <GhostButton onClick={onArrived} disabled={busy} className="text-brand hover:bg-brand-soft"><Check className="h-3.5 w-3.5" /> Ирсэн</GhostButton>
                    <GhostButton onClick={onNoShow} disabled={busy}><UserX className="h-3.5 w-3.5" /> Ирээгүй</GhostButton>
                    <GhostButton onClick={onPostpone} disabled={busy}><ArrowRight className="h-3.5 w-3.5" /> Хойшлуулах</GhostButton>
                    <GhostButton onClick={onCancel} disabled={busy}><X className="h-3.5 w-3.5" /></GhostButton>
                </div>
            )}
            {mobile ? (
                phone ? <a href={`tel:${phone}`} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-brand active:bg-brand-soft" aria-label="Залгах"><Phone className="h-5 w-5" /></a>
                : canWrite && v.status === 'scheduled' ? <button type="button" onClick={onArrived} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-brand active:bg-brand-soft" aria-label="Ирсэн"><Check className="h-5 w-5" /></button> : null
            ) : null}
            {mobile && canWrite && v.status === 'scheduled' && phone && (
                <button type="button" onClick={onArrived} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-muted-foreground active:bg-surface-2" aria-label="Ирсэн"><Check className="h-5 w-5" /></button>
            )}
        </div>
    );
}

function Chip({ value, onChange, label, options }: { value: string; onChange: (v: string) => void; label: string; options: [string, string][] }) {
    const on = value !== 'all';
    return (
        <label className={cn('relative inline-flex h-[26px] items-center gap-1 rounded-md border pl-2.5 pr-6 text-[12px]', on ? 'border-brand bg-brand-soft text-brand' : 'border-border bg-surface text-fg-2 hover:border-border-strong')}>
            <span className="pointer-events-none whitespace-nowrap">{on ? `${label}: ${options.find((o) => o[0] === value)?.[1] ?? value}` : label}</span>
            <select value={value} onChange={(e) => onChange(e.target.value)} className="absolute inset-0 cursor-pointer opacity-0" aria-label={label}>
                <option value="all">Бүгд</option>
                {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
            <ChevronDown className="pointer-events-none absolute right-1.5 h-3 w-3 opacity-70" />
        </label>
    );
}

/* ------------------------------------------------------------------ */

function CreateSheet({ leadId, onClose }: { leadId: string | null; onClose: () => void }) {
    const { data: leadDetail } = useLeadDetail(leadId);
    const create = useCreateViewing();
    const [walkIn, setWalkIn] = useState(false);
    const [name, setName] = useState('');
    const [phone, setPhone] = useState('');
    const [propQ, setPropQ] = useState('');
    const [property, setProperty] = useState<PropertyOption | null>(null);
    const [when, setWhen] = useState(() => defaultWhen());
    const [typeOverride, setTypeOverride] = useState<MeetingType | null>(null);
    const [notes, setNotes] = useState('');
    const [interest, setInterest] = useState(0);
    const [feedback, setFeedback] = useState('');
    const { data: props = [], isFetching: searching } = usePropertySearch(propQ, !property);

    // Лидээс ирсэн бол төрлийг статусаас нь таана (гараар сольж болно)
    const inferredType: MeetingType = leadDetail?.lead
        ? leadDetail.lead.status === 'closed_won' ? 'existing_buyer' : leadDetail.lead.status !== 'new' ? 'repeat_customer' : 'new_customer'
        : 'new_customer';
    const type = typeOverride ?? inferredType;
    const setType = setTypeOverride;

    const submit = async () => {
        if (!leadId && !name.trim()) { toast.error('Харилцагчийн нэр оруулна уу'); return; }
        if (!walkIn && !when) { toast.error('Огноо, цаг сонгоно уу'); return; }
        try {
            await create.mutateAsync({
                lead_id: leadId,
                customer_name: leadId ? undefined : name.trim(),
                customer_phone: leadId ? undefined : phone.trim() || null,
                property_id: property?.id ?? null,
                scheduled_at: walkIn ? null : new Date(when).toISOString(),
                meeting_type: type,
                notes: notes.trim() || null,
                walk_in: walkIn,
                interest_level: walkIn && interest ? interest : null,
                feedback: walkIn ? feedback.trim() || null : null,
            });
            toast.success(walkIn ? 'Ирсэн уулзалт бүртгэгдлээ' : 'Уулзалт товлогдлоо');
            onClose();
        } catch (e) {
            toast.error(e instanceof Error ? e.message : 'Хадгалж чадсангүй');
        }
    };

    return (
        <div className="flex h-full flex-col">
            <header className="flex h-[52px] shrink-0 items-center gap-3 border-b border-border px-5">
                <h2 className="text-[16px] font-semibold text-foreground">{walkIn ? 'Ирсэн уулзалт' : 'Уулзалт товлох'}</h2>
                <button type="button" onClick={onClose} className="ml-auto flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-surface-2 hover:text-foreground focus-ring" aria-label="Хаах"><X className="h-4 w-4" /></button>
            </header>
            <div className="flex flex-1 flex-col gap-4 overflow-y-auto p-5">
                <label className="flex cursor-pointer items-center gap-2.5 rounded-md border border-border px-3 py-2 text-[13px] hover:border-border-strong">
                    <button type="button" role="switch" aria-checked={walkIn} onClick={() => setWalkIn((v) => !v)} className={cn('relative h-5 w-9 shrink-0 rounded-full transition-colors', walkIn ? 'bg-brand' : 'bg-border-strong')}>
                        <span className={cn('absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform', walkIn ? 'translate-x-4' : 'translate-x-0.5')} />
                    </button>
                    <span className="text-foreground">Талбай дээр ирсэн — шууд «болсон» гэж бүртгэх</span>
                </label>

                {leadId && leadDetail?.lead ? (
                    <div className="flex items-center gap-3 rounded-md border border-border bg-surface-2/60 px-3 py-2">
                        <Avatar name={leadDetail.lead.customer_name} className="h-7 w-7 text-[11px]" />
                        <div className="min-w-0 flex-1">
                            <div className="truncate text-[13px] font-medium text-foreground">{leadDetail.lead.customer_name}</div>
                            <div className="mono-label truncate text-[12px] text-muted-foreground">{leadDetail.lead.customer_phone || '—'}</div>
                        </div>
                        <Pill tone="info">Лид</Pill>
                    </div>
                ) : (
                    <div className="grid grid-cols-2 gap-3">
                        <Field label="Нэр" required><input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Б. Болд" className={inputCls} /></Field>
                        <Field label="Утас"><input value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" placeholder="9909 1122" className={cn(inputCls, 'mono-label')} /></Field>
                    </div>
                )}

                <Field label="Байр">
                    {property ? (
                        <div className="flex items-center gap-2 rounded-md border border-brand bg-brand-soft px-3 py-1.5 text-[13px]">
                            <MapPin className="h-3.5 w-3.5 text-brand" />
                            <span className="min-w-0 flex-1 truncate text-foreground">{property.name}{property.district ? ` · ${property.district}` : ''}</span>
                            {property.price && <span className="num text-[12px] text-fg-2">{formatMNT(property.price)}</span>}
                            <button type="button" onClick={() => setProperty(null)} className="text-muted-foreground hover:text-foreground" aria-label="Цуцлах"><X className="h-3.5 w-3.5" /></button>
                        </div>
                    ) : (
                        <div className="relative">
                            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                            <input value={propQ} onChange={(e) => setPropQ(e.target.value)} placeholder="Байрны нэр, дүүрэг…" className={cn(inputCls, 'pl-8')} />
                            {searching && <Loader2 className="absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />}
                            {props.length > 0 && (
                                <div className="mt-1 max-h-48 overflow-y-auto rounded-md border border-border bg-surface shadow-lg">
                                    {props.map((p) => (
                                        <button key={p.id} type="button" onClick={() => setProperty(p)} className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[12.5px] hover:bg-surface-2">
                                            <span className="min-w-0 flex-1 truncate text-foreground">{p.name}</span>
                                            {p.rooms && <span className="text-muted-foreground">{p.rooms} өрөө</span>}
                                            {p.price && <span className="num text-fg-2">{formatMNT(p.price)}</span>}
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}
                </Field>

                {!walkIn && (
                    <Field label="Огноо, цаг" required>
                        <input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} className={cn(inputCls, 'mono-label')} />
                    </Field>
                )}

                <Field label="Төрөл">
                    <div className="flex flex-wrap gap-1.5">
                        {MEETING_TYPES.map((t) => (
                            <button key={t} type="button" onClick={() => setType(t)} className={cn('h-[26px] rounded-md border px-2.5 text-[12px] focus-ring', type === t ? 'border-brand bg-brand-soft text-brand' : 'border-border text-fg-2 hover:border-border-strong')}>{MEETING_TYPE_META[t].label}</button>
                        ))}
                    </div>
                </Field>

                {walkIn && (
                    <>
                        <Field label="Сонирхол">
                            <div className="flex gap-1">
                                {[1, 2, 3, 4, 5].map((s) => (
                                    <button key={s} type="button" onClick={() => setInterest(s === interest ? 0 : s)} className="p-0.5" aria-label={`${s}/5`}>
                                        <Star className={cn('h-5 w-5', s <= interest ? 'fill-current text-status-pending' : 'text-border-strong hover:text-status-pending')} />
                                    </button>
                                ))}
                            </div>
                        </Field>
                        <Field label="Харилцагчийн санал"><textarea value={feedback} onChange={(e) => setFeedback(e.target.value)} rows={2} placeholder="Юу таалагдсан, юу болохгүй…" className={cn(inputCls, 'h-auto resize-none py-2')} /></Field>
                    </>
                )}

                <Field label="Тэмдэглэл"><textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="12-р давхраас дээш…" className={cn(inputCls, 'h-auto resize-none py-2')} /></Field>
            </div>
            <footer className="flex shrink-0 items-center gap-2 border-t border-border p-4">
                <button type="button" onClick={onClose} className="h-[34px] rounded-md px-3 text-[13px] text-muted-foreground hover:bg-surface-2 hover:text-foreground focus-ring">Болих</button>
                <button type="button" disabled={create.isPending} onClick={() => void submit()} className="ml-auto inline-flex h-[34px] items-center gap-2 rounded-md bg-brand px-3 text-[12.5px] font-medium text-brand-fg hover:bg-brand-strong disabled:opacity-60 focus-ring">
                    {create.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}{walkIn ? 'Бүртгэх' : 'Товлох'}
                </button>
            </footer>
        </div>
    );
}

function OutcomeSheet({ v, onClose }: { v: ViewingRow; onClose: () => void }) {
    const update = useUpdateViewing();
    const [interest, setInterest] = useState(v.interest_level || 0);
    const [feedback, setFeedback] = useState(v.customer_feedback || '');
    const [followup, setFollowup] = useState<number | null>(null);

    const submit = async () => {
        try {
            const next = followup ? new Date(Date.now() + followup * 86_400_000) : null;
            if (next) next.setHours(10, 0, 0, 0);
            await update.mutateAsync({ id: v.id, patch: { status: 'completed', interest_level: interest || null, customer_feedback: feedback.trim() || null, ...(next ? { next_followup_at: next.toISOString() } : {}) } });
            toast.success('Уулзалт дууслаа');
            onClose();
        } catch (e) {
            toast.error(e instanceof Error ? e.message : 'Хадгалж чадсангүй');
        }
    };

    return (
        <div className="flex h-full flex-col">
            <header className="flex h-[52px] shrink-0 items-center gap-3 border-b border-border px-5">
                <h2 className="truncate text-[16px] font-semibold text-foreground">{v.lead?.customer_name || 'Уулзалт'} — үр дүн</h2>
                <button type="button" onClick={onClose} className="ml-auto flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-surface-2 hover:text-foreground focus-ring" aria-label="Хаах"><X className="h-4 w-4" /></button>
            </header>
            <div className="flex flex-1 flex-col gap-4 overflow-y-auto p-5">
                <div className="text-[12.5px] text-muted-foreground">{formatShortDate(v.scheduled_at)} {formatTime(v.scheduled_at)}{v.property ? ` · ${v.property.name}` : ''}</div>
                <Field label="Сонирхол">
                    <div className="flex gap-1">
                        {[1, 2, 3, 4, 5].map((s) => (
                            <button key={s} type="button" onClick={() => setInterest(s === interest ? 0 : s)} className="p-0.5" aria-label={`${s}/5`}>
                                <Star className={cn('h-6 w-6', s <= interest ? 'fill-current text-status-pending' : 'text-border-strong hover:text-status-pending')} />
                            </button>
                        ))}
                    </div>
                </Field>
                <Field label="Харилцагчийн санал"><textarea autoFocus value={feedback} onChange={(e) => setFeedback(e.target.value)} rows={3} placeholder="Юу таалагдсан, юу болохгүй, ямар шийдвэр гаргасан…" className={cn(inputCls, 'h-auto resize-none py-2')} /></Field>
                <Field label="Дараагийн холбоо">
                    <div className="flex flex-wrap gap-1.5">
                        {[1, 3, 7].map((d) => (
                            <button key={d} type="button" onClick={() => setFollowup(followup === d ? null : d)} className={cn('h-[26px] rounded-md border px-2.5 text-[12px] focus-ring', followup === d ? 'border-brand bg-brand-soft text-brand' : 'border-border text-fg-2 hover:border-border-strong')}>{d === 1 ? 'Маргааш залгах' : `${d} хоногийн дараа`}</button>
                        ))}
                    </div>
                </Field>
            </div>
            <footer className="flex shrink-0 items-center gap-2 border-t border-border p-4">
                <button type="button" onClick={onClose} className="h-[34px] rounded-md px-3 text-[13px] text-muted-foreground hover:bg-surface-2 hover:text-foreground focus-ring">Болих</button>
                <button type="button" disabled={update.isPending} onClick={() => void submit()} className="ml-auto inline-flex h-[34px] items-center gap-2 rounded-md bg-brand px-3 text-[12.5px] font-medium text-brand-fg hover:bg-brand-strong disabled:opacity-60 focus-ring">
                    {update.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}<Check className="h-4 w-4" /> Дууссан
                </button>
            </footer>
        </div>
    );
}

const inputCls = 'h-[34px] w-full rounded-md border border-border-strong bg-surface px-2.5 text-[13px] text-foreground outline-none placeholder:text-muted-foreground focus:border-brand focus:shadow-[0_0_0_3px_var(--brand-soft)]';

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
    return (
        <label className="flex flex-col gap-1.5">
            <span className="text-[11.5px] font-medium text-muted-foreground">{label}{required && <span className="ml-0.5 text-status-danger">*</span>}</span>
            {children}
        </label>
    );
}

function defaultWhen(): string {
    const d = new Date();
    d.setMinutes(0, 0, 0);
    d.setHours(d.getHours() + 1);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

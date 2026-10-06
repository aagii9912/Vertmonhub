'use client';

import React, { useEffect, useId, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowRight, CalendarDays, CalendarPlus, Check, Loader2, MapPin, MoreHorizontal, Search, Star, UserX, X } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useModuleAccess } from '@/hooks/useModuleAccess';
import { useNow } from '@/hooks/useNow';
import { formatShortDate, formatTime, formatWorkdayDate, ubDateStr, ubLocalToIso } from '@/lib/utils/date';
import { formatMNT } from '@/lib/utils/currency';
import { followupAtDays } from '@/lib/leads/next-step';
import {
    useViewings, useCreateViewing, useUpdateViewing, usePropertySearch,
    type PropertyOption, type ViewingPatch, type ViewingRange, type ViewingRow,
} from '@/hooks/useViewings';
import { useLeadDetail, useLeadProjects, useManagers } from '@/hooks/useLeads';
import {
    MEETING_TYPES, MEETING_TYPE_META, VIEWING_STATUS_META,
    dayLabel, defaultMeetingWhen, groupViewingsByDay, scheduledCountsByDay, upcomingDays, viewingDay, viewingStatusLabel, viewingStatusTone,
    type MeetingType, type UpcomingDay,
} from '@/lib/viewings/labels';
import { ANONYMOUS_LEAD_LABEL, ANONYMOUS_MEETING_PHONE, LEAD_NAME_OR_ANONYMOUS, isAnonymousLead, leadDisplayName, normalizeLeadName } from '@/lib/leads/labels';
import { PageHeader } from '@/components/dashboard/PageHeader';
import { FilterChip } from '@/components/dashboard/FilterBar';
import { Skeleton } from '@/components/dashboard/v2/primitives';
import { Alert } from '@/components/ui/Alert';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { Checkbox } from '@/components/ui/Checkbox';
import { EmptyState } from '@/components/ui/EmptyState';
import { StatusPill } from '@/components/ui/StatusPill';
import { Switch } from '@/components/ui/Switch';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/Sheet';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/Dropdown';

/**
 * «Уулзалт» — v3. Өдрийн хуваарь ба ойрын 7 хоног: өдөр бүрийн товлосон уулзалтын тоо, өдрийг
 * дарвал зөвхөн тэр өдөр (дахин дарвал бүх хугацаа). Жагсаалт Улаанбаатарын өдрөөр бүлэглэгдэнэ.
 * Товлох ба үр дүн бүртгэх нь хажуугийн sheet; ?new=1[&lead=] нь товлох цонхыг шууд нээнэ.
 * Цаг бүр Улаанбаатарын цагаар (хөтөч өөр бүст байсан ч).
 */

const RANGES: { key: ViewingRange; label: string }[] = [
    { key: 'today', label: 'Өнөөдөр' },
    { key: 'upcoming', label: 'Удахгүй' },
    { key: 'past', label: 'Өнгөрсөн' },
    { key: 'all', label: 'Бүгд' },
];

export function ViewingsPage() {
    const router = useRouter();
    const search = useSearchParams();
    const { canWrite: canWriteModule } = useModuleAccess();
    const canWrite = canWriteModule('viewings');
    const now = useNow();
    const today = ubDateStr(now);

    const [range, setRange] = useState<ViewingRange>('upcoming');
    const [day, setDay] = useState<string | null>(null);
    const [status, setStatus] = useState('all');
    const [manager, setManager] = useState('all');
    const [createOpen, setCreateOpen] = useState(false);
    const [prefillLead, setPrefillLead] = useState<string | null>(null);
    const [outcomeFor, setOutcomeFor] = useState<ViewingRow | null>(null);

    // ?new=1[&lead=] — Харилцагчийн карт, Түргэн бүртгэл, «+ Шинэ → Уулзалт» (энэ хуудсан дээрээс ч)
    // товлох цонхыг нээнэ; нэг удаа уншаад URL-ээс хасна.
    const deepLink = search.get('new') === '1' ? search.get('lead') ?? '' : null;
    const [seenDeepLink, setSeenDeepLink] = useState<string | null>(null);
    if (deepLink !== seenDeepLink) {
        setSeenDeepLink(deepLink);
        if (deepLink !== null) {
            setPrefillLead(deepLink || null);
            setCreateOpen(true);
        }
    }
    useEffect(() => {
        if (deepLink !== null) router.replace('/dashboard/viewings');
    }, [deepLink, router]);

    const list = useViewings({ range, status, manager });
    // 7 хоногийн тоо «Удахгүй» жагсаалтаас (төлөвийн шүүлтүүргүй) — анхдагч үед жагсаалттай нэг хүсэлт.
    const week = useViewings({ range: 'upcoming', status: 'all', manager });
    const { data: managers = [] } = useManagers();
    const update = useUpdateViewing();
    const counts = list.data?.counts ?? week.data?.counts;

    const days = useMemo(() => upcomingDays(now), [now]);
    const dayCounts = useMemo(() => scheduledCountsByDay(week.data?.viewings ?? []), [week.data]);
    // Шөнө дунд өнгөрч сонгосон өдөр 7 хоногоос гарвал шүүлтүүр өөрөө арилна.
    const selectedDay = days.find((d) => d.key === day) ?? null;
    const groups = useMemo(() => {
        const all = list.data?.viewings ?? [];
        return groupViewingsByDay(selectedDay ? all.filter((v) => viewingDay(v.scheduled_at) === selectedDay.key) : all);
    }, [list.data, selectedDay]);

    const chooseRange = (key: ViewingRange) => {
        setRange(key);
        setDay(null);
    };
    const chooseDay = (key: string) => {
        if (selectedDay?.key === key) {
            setDay(null);
            return;
        }
        setDay(key);
        // Өдөр бүр өнөөдрөөс хойш: одоогийн хугацаанд багтахгүй бол «Удахгүй» руу шилжинэ.
        if (range === 'past' || (range === 'today' && key !== today)) setRange('upcoming');
    };
    const openCreate = () => {
        setPrefillLead(null);
        setCreateOpen(true);
    };
    const closeCreate = () => {
        setCreateOpen(false);
        setPrefillLead(null);
    };

    const patch = (id: string, p: ViewingPatch, msg?: string) =>
        update.mutate({ id, patch: p }, {
            onSuccess: (result) => { if (result.warning) toast.warning(result.warning); else if (msg) toast.success(msg); },
            onError: (e) => toast.error(e instanceof Error ? e.message : 'Алдаа гарлаа'),
        });
    // Яг 24 цаг (УБ-д зуны цаг байхгүй тул маргаашийн ижил цаг).
    const postpone = (v: ViewingRow) => patch(v.id, { scheduled_at: new Date(Date.parse(v.scheduled_at) + 86_400_000).toISOString() }, 'Маргааш руу хойшлуулав');

    const filtered = status !== 'all' || manager !== 'all';
    const subtitle = `${formatWorkdayDate(now)}${typeof counts?.today === 'number' ? ` · ${counts.today} уулзалт өнөөдөр` : ''}`;
    const emptyTitle = selectedDay
        ? selectedDay.label.detail ? `${selectedDay.label.title} уулзалт алга` : `${selectedDay.label.title} — уулзалт алга`
        : range === 'today' ? 'Өнөөдөр уулзалт алга'
        : filtered ? 'Энэ шүүлтүүрт уулзалт алга' : 'Уулзалт олдсонгүй';

    return (
        <div className="mx-auto flex w-full max-w-[1240px] flex-col gap-5">
            <PageHeader title="Уулзалт" subtitle={subtitle} className="mb-0"
                primaryAction={canWrite && <Button onClick={openCreate}><CalendarPlus />Уулзалт товлох</Button>} />

            <WeekStrip days={days} today={today} selected={selectedDay?.key ?? null} counts={dayCounts}
                loading={week.isLoading} failed={!week.data && !!week.error} onSelect={chooseDay} />

            <div className="flex flex-wrap items-center gap-2">
                <div role="group" aria-label="Хугацаа" className="flex items-center gap-1 rounded-xl bg-surface-2 p-1">
                    {RANGES.map((t) => {
                        const n = t.key === 'all' ? undefined : counts?.[t.key];
                        const active = range === t.key;
                        return (
                            <button key={t.key} type="button" aria-pressed={active} onClick={() => chooseRange(t.key)}
                                className={cn('flex h-8 items-center gap-2 rounded-lg px-3 text-sm font-medium transition-colors', active ? 'bg-surface text-foreground shadow-[inset_0_0_0_1px_var(--border)]' : 'text-fg-2 hover:text-foreground')}>
                                {t.label}
                                {typeof n === 'number' && <span className={cn('num text-xs', active ? 'text-brand-strong' : 'text-muted-foreground')}>{n}</span>}
                            </button>
                        );
                    })}
                </div>
                <div className="ml-auto flex flex-wrap items-center gap-2">
                    <FilterChip value={status} onChange={setStatus} label="Төлөв" options={Object.entries(VIEWING_STATUS_META).map(([k, m]) => [k, m.label])} />
                    {managers.length > 0 && <FilterChip value={manager} onChange={setManager} label="Менежер" options={managers.map((m) => [m.name, m.name])} />}
                    {filtered && <Button variant="ghost" size="sm" onClick={() => { setStatus('all'); setManager('all'); }}><X />Цэвэрлэх</Button>}
                </div>
            </div>

            <div className="overflow-hidden rounded-xl border border-border bg-surface">
                {list.error ? (
                    <div className="p-4">
                        <Alert variant="danger">
                            <p>Уулзалтуудыг уншиж чадсангүй. Жагсаалт хоосон гэсэн үг биш.</p>
                            <div><Button size="sm" variant="secondary" onClick={() => void list.refetch()}>Дахин оролдох</Button></div>
                        </Alert>
                    </div>
                ) : list.isLoading || (list.isPlaceholderData && groups.length === 0) ? (
                    // Өмнөх хугацааны түр өгөгдлөөр «уулзалт алга» гэж хэлэхгүй — шинэ жагсаалтыг хүлээнэ.
                    <div className="flex flex-col gap-2 p-4" aria-busy="true">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-14" />)}</div>
                ) : groups.length === 0 ? (
                    <EmptyState icon={<CalendarDays />} title={emptyTitle}
                        description={filtered ? 'Шүүлтүүрээ өөрчилж эсвэл цэвэрлэж үзнэ үү.' : 'Харилцагчийн картаас эсвэл «Уулзалт товлох» товчоор товлоно.'}
                        action={canWrite && <Button size="sm" onClick={openCreate}><CalendarPlus />Уулзалт товлох</Button>} />
                ) : (
                    groups.map((g) => (
                        <DayGroup key={g.key} day={g.key} today={today} count={g.items.length}>
                            {g.items.map((v) => (
                                <AgendaRow key={v.id} v={v} now={now.getTime()} canWrite={canWrite}
                                    busy={!!update.isPending && update.variables?.id === v.id}
                                    onArrived={() => setOutcomeFor(v)}
                                    onNoShow={() => patch(v.id, { status: 'no_show' }, 'Ирээгүй гэж тэмдэглэв')}
                                    onCancel={() => patch(v.id, { status: 'cancelled' }, 'Цуцлагдлаа')}
                                    onPostpone={() => postpone(v)} />
                            ))}
                        </DayGroup>
                    ))
                )}
            </div>

            {/* Товлох */}
            <Sheet open={createOpen} onOpenChange={(o) => { if (!o) closeCreate(); }}>
                <SheetContent side="right" showCloseButton={false} aria-describedby={undefined} className="w-full gap-0 p-0 sm:max-w-[440px]">
                    <SheetTitle className="sr-only">Уулзалт товлох</SheetTitle>
                    {createOpen && <CreateSheet leadId={prefillLead} day={selectedDay?.key ?? null} onClose={closeCreate} />}
                </SheetContent>
            </Sheet>

            {/* Үр дүн */}
            <Sheet open={!!outcomeFor} onOpenChange={(o) => { if (!o) setOutcomeFor(null); }}>
                <SheetContent side="right" showCloseButton={false} aria-describedby={undefined} className="w-full gap-0 p-0 sm:max-w-[420px]">
                    <SheetTitle className="sr-only">Уулзалтын үр дүн</SheetTitle>
                    {outcomeFor && <OutcomeSheet v={outcomeFor} onClose={() => setOutcomeFor(null)} />}
                </SheetContent>
            </Sheet>
        </div>
    );
}

/* ── Ойрын 7 хоног ─────────────────────────────────────────────────────────────────── */

function WeekStrip({ days, today, selected, counts, loading, failed, onSelect }: {
    days: UpcomingDay[];
    today: string;
    selected: string | null;
    counts: Map<string, number>;
    loading: boolean;
    failed: boolean;
    onSelect: (day: string) => void;
}) {
    return (
        <section aria-label="Ойрын 7 хоног" className="grid grid-cols-7 gap-2">
            {days.map((d) => {
                const n = counts.get(d.key) ?? 0;
                const active = selected === d.key;
                const isToday = d.key === today;
                // Тоо үнэн байна: ачаалж байхад «…», уншиж чадаагүй бол «—» (тэг биш).
                const known = !loading && !failed;
                const count = failed ? '—' : loading ? '…' : n > 0 ? `${n} уулзалт` : 'Уулзалтгүй';
                const spoken = failed ? 'тоо тодорхойгүй' : loading ? 'уншиж байна' : n > 0 ? `${n} уулзалт` : 'уулзалтгүй';
                return (
                    <button key={d.key} type="button" aria-pressed={active} aria-current={isToday ? 'date' : undefined}
                        aria-label={`${d.label.full}: ${spoken}`} onClick={() => onSelect(d.key)}
                        className={cn('flex min-w-0 flex-col items-start gap-0.5 rounded-xl border px-3 py-2.5 text-left transition-colors',
                            active ? 'border-brand bg-brand-soft' : 'border-border bg-surface hover:border-border-strong hover:bg-surface-2')}>
                        <span className={cn('w-full truncate text-xs', isToday ? 'font-medium text-brand-strong' : 'text-muted-foreground')}>{d.weekday}</span>
                        <span className={cn('num text-xl font-semibold leading-7', isToday || active ? 'text-brand-strong' : 'text-foreground')}>{d.day}</span>
                        <span className={cn('w-full truncate text-xs', known && n > 0 ? 'font-medium text-fg-2' : 'text-muted-foreground')}>{count}</span>
                    </button>
                );
            })}
        </section>
    );
}

/* ── Өдрийн хуваарь ────────────────────────────────────────────────────────────────── */

function DayGroup({ day, today, count, children }: { day: string; today: string; count: number; children: React.ReactNode }) {
    const label = dayLabel(day, today);
    const headingId = `viewings-day-${day || 'unknown'}`;
    return (
        <section aria-labelledby={headingId} className="border-b border-border last:border-b-0">
            <div className="flex items-center gap-2 border-b border-border bg-surface-2/60 px-5 py-2.5">
                <h2 id={headingId} className="text-sm font-semibold text-foreground">
                    {label.title}
                    {label.detail && <span className="font-normal text-muted-foreground"> · {label.detail}</span>}
                </h2>
                <span className="num ml-auto text-xs text-muted-foreground">{count} уулзалт</span>
            </div>
            <ul>{children}</ul>
        </section>
    );
}

function AgendaRow({ v, now, canWrite, busy, onArrived, onNoShow, onCancel, onPostpone }: {
    v: ViewingRow;
    now: number;
    canWrite: boolean;
    busy: boolean;
    onArrived: () => void;
    onNoShow: () => void;
    onCancel: () => void;
    onPostpone: () => void;
}) {
    const name = leadDisplayName(v.lead);
    const phone = v.lead?.customer_phone?.trim() || '';
    const digits = phone.replace(/\D/g, '');
    const overdue = v.status === 'scheduled' && Date.parse(v.scheduled_at) < now;
    const type = v.meeting_type ? MEETING_TYPE_META[v.meeting_type] : null;
    const nameCls = cn('block truncate text-sm font-medium', isAnonymousLead(v.lead) ? 'text-muted-foreground' : 'text-foreground');
    return (
        <li className={cn('flex items-start gap-4 border-b border-border px-5 py-4 last:border-b-0', overdue && 'bg-status-danger-soft/30')}>
            <div className="w-16 shrink-0">
                <p className={cn('num text-base font-semibold leading-6', overdue ? 'text-status-danger' : 'text-foreground')}>{formatTime(v.scheduled_at)}</p>
                {overdue && <p className="text-xs text-status-danger">Хоцорсон</p>}
            </div>
            <div className="grid min-w-0 flex-1 grid-cols-2 gap-x-6 gap-y-1.5 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,0.8fr)] xl:items-center">
                <div className="row-span-2 min-w-0 xl:row-span-1">
                    {v.lead
                        ? <Link href={`/dashboard/leads?lead=${v.lead.id}`} className={cn(nameCls, 'hover:text-brand-strong')}>{name}</Link>
                        : <span className={nameCls}>{name}</span>}
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">
                        {digits ? <a href={`tel:${digits}`} className="num hover:text-foreground hover:underline">{phone}</a> : 'Утасгүй'}
                        {type && <span> · {type.label}</span>}
                    </p>
                </div>
                <p className="flex min-w-0 items-center gap-1.5 text-sm text-fg-2">
                    <MapPin className="size-3.5 shrink-0 text-muted-foreground" />
                    <span className={cn('truncate', !v.property && 'text-muted-foreground')}>{v.property ? [v.property.name, v.property.district].filter(Boolean).join(' · ') : 'Байр сонгоогүй'}</span>
                </p>
                <p className="flex min-w-0 items-center gap-2 text-sm text-fg-2">
                    {v.sales_manager_name
                        ? <><Avatar name={v.sales_manager_name} /><span className="truncate">{v.sales_manager_name}</span></>
                        : <span className="text-muted-foreground">Хариуцагчгүй</span>}
                </p>
                {v.agent_notes && <p className="col-span-full line-clamp-1 text-xs text-muted-foreground">{v.agent_notes}</p>}
            </div>
            <div className="flex shrink-0 items-center gap-2">
                {v.status === 'completed' && v.interest_level ? (
                    <span className="inline-flex items-center gap-1 text-xs text-status-pending" aria-label={`Сонирхол ${v.interest_level}/5`}>
                        <Star className="size-3.5 fill-current" /><span className="num">{v.interest_level}/5</span>
                    </span>
                ) : null}
                <StatusPill variant={viewingStatusTone(v.status)}>{viewingStatusLabel(v.status)}</StatusPill>
                {canWrite && v.status === 'scheduled' && (
                    <>
                        <Button variant="secondary" size="sm" disabled={busy} onClick={onArrived}><Check />Ирсэн</Button>
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="iconSm" disabled={busy} aria-label={`${name}: уулзалтын бусад үйлдэл`}><MoreHorizontal /></Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                                <DropdownMenuItem onSelect={onPostpone}><ArrowRight />Маргааш руу хойшлуулах</DropdownMenuItem>
                                <DropdownMenuItem onSelect={onNoShow}><UserX />Ирээгүй гэж тэмдэглэх</DropdownMenuItem>
                                <DropdownMenuItem variant="danger" onSelect={onCancel}><X />Уулзалтыг цуцлах</DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>
                    </>
                )}
            </div>
        </li>
    );
}

/* ── Товлох ────────────────────────────────────────────────────────────────────────── */

function CreateSheet({ leadId, day, onClose }: { leadId: string | null; day: string | null; onClose: () => void }) {
    const { data: leadDetail, isLoading: leadLoading } = useLeadDetail(leadId);
    const typeLabelId = useId();
    const { data: projects = [], isLoading: projectsLoading, error: projectsError, refetch: refetchProjects } = useLeadProjects();
    const create = useCreateViewing();
    const [walkIn, setWalkIn] = useState(false);
    const [name, setName] = useState('');
    // Шинэ харилцагч нэрээ хэлээгүй: лидийг нэргүй үүсгэнэ, утас заавал (сервер мөн шалгана).
    const [anonymous, setAnonymous] = useState(false);
    const [phone, setPhone] = useState('');
    const [chosenProjectId, setProjectId] = useState('');
    // Shop = төсөл: ганц төсөлтэй бол автоматаар сонгоно.
    const soleProject = projects.length === 1 ? projects[0].id : null;
    const projectId = soleProject ?? chosenProjectId;
    const [propQ, setPropQ] = useState('');
    const [property, setProperty] = useState<PropertyOption | null>(null);
    // Улаанбаатарын цагаар: өнөөдөр бол дараагийн бүтэн цаг, 7 хоногоос сонгосон өдөр бол 10:00.
    const [when, setWhen] = useState(() => defaultMeetingWhen(new Date(), day));
    const [typeOverride, setType] = useState<MeetingType | null>(null);
    const [notes, setNotes] = useState('');
    const [interest, setInterest] = useState(0);
    const [feedback, setFeedback] = useState('');
    const projectScope = leadId ? leadDetail?.lead.project_id ?? null : projectId || null;
    const { data: props = [], isFetching: searching } = usePropertySearch(propQ, !property, projectScope);
    const lead = leadId ? leadDetail?.lead : undefined;

    // Лидээс ирсэн бол төрлийг статусаас нь таана (гараар сольж болно)
    const inferredType: MeetingType = lead
        ? lead.status === 'closed_won' ? 'existing_buyer' : lead.status !== 'new' ? 'repeat_customer' : 'new_customer'
        : 'new_customer';
    const type = typeOverride ?? inferredType;

    const submit = async () => {
        if (!leadId && !projects.some(p => p.id === projectId)) { toast.error('Төсөл сонгоно уу'); return; }
        if (!leadId && !anonymous && !normalizeLeadName(name)) { toast.error(LEAD_NAME_OR_ANONYMOUS); return; }
        if (!leadId && anonymous && phone.replace(/\D/g, '').length < 8) { toast.error(ANONYMOUS_MEETING_PHONE); return; }
        // datetime-local-ийг Улаанбаатарын цагаар уншина — хөтөч өөр цагийн бүст байсан ч.
        const scheduledAt = walkIn ? null : ubLocalToIso(when);
        if (!walkIn && !scheduledAt) { toast.error('Огноо, цаг сонгоно уу'); return; }
        try {
            const result = await create.mutateAsync({
                lead_id: leadId,
                project_id: leadId ? undefined : projectId,
                customer_name: leadId ? undefined : anonymous ? null : name.trim(),
                customer_phone: leadId ? undefined : phone.trim() || null,
                anonymous: leadId ? undefined : anonymous,
                property_id: property?.id ?? null,
                scheduled_at: scheduledAt,
                meeting_type: type,
                notes: notes.trim() || null,
                walk_in: walkIn,
                interest_level: walkIn && interest ? interest : null,
                feedback: walkIn ? feedback.trim() || null : null,
            });
            if (result.warning) toast.warning(result.warning);
            else toast.success(walkIn ? 'Ирсэн уулзалт бүртгэгдлээ' : 'Уулзалт товлогдлоо');
            onClose();
        } catch (e) {
            toast.error(e instanceof Error ? e.message : 'Хадгалж чадсангүй');
        }
    };

    return (
        <div className="flex h-full flex-col">
            <SheetHeaderBar title={walkIn ? 'Ирсэн уулзалт' : 'Уулзалт товлох'} onClose={onClose} />
            <div className="flex flex-1 flex-col gap-4 overflow-y-auto p-5">
                <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-border px-3 py-2.5 text-sm hover:border-border-strong">
                    <Switch checked={walkIn} onCheckedChange={setWalkIn} />
                    <span className="text-foreground">Талбай дээр ирсэн — шууд «болсон» гэж бүртгэх</span>
                </label>

                {!leadId && !soleProject && (
                    <Field label="Төсөл" required>
                        <select aria-label="Төсөл" required value={projectId} onChange={(e) => { setProjectId(e.target.value); setProperty(null); }} disabled={projectsLoading || !!projectsError} className={inputCls}>
                            <option value="">{projectsLoading ? 'Төсөл ачаалж байна…' : 'Төсөл сонгох'}</option>
                            {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                        </select>
                        {projectsError
                            ? <p role="alert" className="text-xs text-status-danger">Төслүүдийг уншиж чадсангүй. <button type="button" className="underline" onClick={() => void refetchProjects()}>Дахин оролдох</button></p>
                            : !projectsLoading && !projects.length && <p role="status" className="text-xs text-muted-foreground">Уулзалт бүртгэх төслийн эрх олгогдоогүй байна.</p>}
                    </Field>
                )}

                {leadId ? (
                    lead ? (
                        <div className="flex items-center gap-3 rounded-lg border border-border bg-surface-2/60 px-3 py-2.5">
                            <Avatar name={normalizeLeadName(lead.customer_name)} size="md" />
                            <div className="min-w-0 flex-1">
                                <div className={cn('truncate text-sm font-medium', isAnonymousLead(lead) ? 'text-muted-foreground' : 'text-foreground')}>{leadDisplayName(lead)}</div>
                                <div className="num truncate text-xs text-muted-foreground">{lead.customer_phone || 'Утасгүй'}</div>
                            </div>
                            <StatusPill variant="info">Лид</StatusPill>
                        </div>
                    ) : leadLoading ? <Skeleton className="h-14" /> : (
                        <p role="status" className="rounded-lg border border-border bg-surface-2/60 px-3 py-2.5 text-sm text-fg-2">Лидийн мэдээллийг уншиж чадсангүй. Уулзалт энэ лидэд товлогдоно.</p>
                    )
                ) : (
                    <div className="flex flex-col gap-2">
                        <div className="grid grid-cols-2 gap-3">
                            <Field label="Нэр" required={!anonymous}>
                                <input autoFocus value={name} onChange={(e) => setName(e.target.value)} disabled={anonymous} placeholder={anonymous ? ANONYMOUS_LEAD_LABEL : 'Б. Болд'} className={inputCls} />
                            </Field>
                            <Field label="Утас" required={anonymous}>
                                <input value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" placeholder="9909 1122" className={cn(inputCls, 'num')} />
                            </Field>
                        </div>
                        {/* Field нь <label> — checkbox-ийг тусдаа мөрөнд байрлуулна. */}
                        <label htmlFor="meeting-anonymous" className="flex w-fit cursor-pointer select-none items-center gap-2 text-sm text-fg-2">
                            <Checkbox id="meeting-anonymous" checked={anonymous} onCheckedChange={(checked) => { setAnonymous(checked === true); if (checked === true) setName(''); }} />
                            Нэр тодорхойгүй — нэргүй бүртгэх
                        </label>
                    </div>
                )}

                <Field label="Байр">
                    {property ? (
                        <div className="flex items-center gap-2 rounded-lg border border-brand bg-brand-soft px-3 py-2 text-sm">
                            <MapPin className="size-3.5 shrink-0 text-brand-strong" />
                            <span className="min-w-0 flex-1 truncate text-foreground">{property.name}{property.district ? ` · ${property.district}` : ''}</span>
                            {property.price && <span className="num text-xs text-fg-2">{formatMNT(property.price)}</span>}
                            <button type="button" onClick={() => setProperty(null)} className="rounded-md text-muted-foreground hover:text-foreground" aria-label="Байрыг болиулах"><X className="size-3.5" /></button>
                        </div>
                    ) : (
                        <div className="relative">
                            <Search className="pointer-events-none absolute left-3 top-[18px] size-4 -translate-y-1/2 text-muted-foreground" />
                            <input value={propQ} onChange={(e) => setPropQ(e.target.value)} placeholder="Байрны нэр, дүүрэг…" className={cn(inputCls, 'pl-9')} />
                            {searching && <Loader2 className="absolute right-3 top-[18px] size-4 -translate-y-1/2 animate-spin text-muted-foreground" />}
                            {props.length > 0 && (
                                <div className="mt-1 max-h-48 overflow-y-auto rounded-lg border border-border bg-surface">
                                    {props.map((p) => (
                                        <button key={p.id} type="button" onClick={() => setProperty(p)} className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-surface-2">
                                            <span className="min-w-0 flex-1 truncate text-foreground">{p.name}</span>
                                            {p.rooms && <span className="text-xs text-muted-foreground">{p.rooms} өрөө</span>}
                                            {p.price && <span className="num text-xs text-fg-2">{formatMNT(p.price)}</span>}
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}
                </Field>

                {!walkIn && (
                    <Field label="Огноо, цаг" required hint="Улаанбаатарын цагаар">
                        <input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} className={cn(inputCls, 'num')} />
                    </Field>
                )}

                <div className="flex flex-col gap-1.5">
                    <span id={typeLabelId} className="text-xs font-medium text-muted-foreground">Төрөл</span>
                    <div role="group" aria-labelledby={typeLabelId} className="flex flex-wrap gap-1.5">
                        {MEETING_TYPES.map((t) => (
                            <button key={t} type="button" aria-pressed={type === t} onClick={() => setType(t)} className={chipCls(type === t)}>{MEETING_TYPE_META[t].label}</button>
                        ))}
                    </div>
                </div>

                {walkIn && (
                    <>
                        <InterestStars value={interest} onChange={setInterest} size="sm" />
                        <Field label="Харилцагчийн санал">
                            <textarea value={feedback} onChange={(e) => setFeedback(e.target.value)} rows={2} placeholder="Юу таалагдсан, юу болохгүй…" className={textareaCls} />
                        </Field>
                    </>
                )}

                <Field label="Тэмдэглэл">
                    <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="12-р давхраас дээш…" className={textareaCls} />
                </Field>
            </div>
            <footer className="flex shrink-0 items-center gap-2 border-t border-border px-5 py-4">
                <Button size="sm" variant="ghost" onClick={onClose}>Болих</Button>
                <Button size="sm" className="ml-auto" disabled={create.isPending} onClick={() => void submit()}>
                    {create.isPending && <Loader2 className="animate-spin" />}{walkIn ? 'Бүртгэх' : 'Товлох'}
                </Button>
            </footer>
        </div>
    );
}

/* ── Үр дүн ────────────────────────────────────────────────────────────────────────── */

const FOLLOWUP_DAYS = [
    { days: 1, label: 'Маргааш залгах' },
    { days: 3, label: '3 хоногийн дараа' },
    { days: 7, label: '7 хоногийн дараа' },
] as const;

function OutcomeSheet({ v, onClose }: { v: ViewingRow; onClose: () => void }) {
    const update = useUpdateViewing();
    const followupLabelId = useId();
    const [interest, setInterest] = useState(v.interest_level || 0);
    const [feedback, setFeedback] = useState(v.customer_feedback || '');
    const [followup, setFollowup] = useState<number | null>(null);

    const submit = async () => {
        try {
            // Дараагийн холбоо: Улаанбаатарын тэр өдрийн 10:00 (хөтчийн цагийн бүсээс үл хамаарна).
            const next = followup ? followupAtDays(followup) : null;
            const result = await update.mutateAsync({ id: v.id, patch: { status: 'completed', interest_level: interest || null, customer_feedback: feedback.trim() || null, ...(next ? { next_followup_at: next } : {}) } });
            if (result.warning) toast.warning(result.warning);
            else toast.success('Уулзалт дууслаа');
            onClose();
        } catch (e) {
            toast.error(e instanceof Error ? e.message : 'Хадгалж чадсангүй');
        }
    };

    return (
        <div className="flex h-full flex-col">
            <SheetHeaderBar title={`${v.lead ? leadDisplayName(v.lead) : 'Уулзалт'} — үр дүн`} onClose={onClose} />
            <div className="flex flex-1 flex-col gap-4 overflow-y-auto p-5">
                <p className="num text-sm text-muted-foreground">{formatShortDate(v.scheduled_at)} {formatTime(v.scheduled_at)}{v.property ? ` · ${v.property.name}` : ''}</p>
                <InterestStars value={interest} onChange={setInterest} size="md" />
                <Field label="Харилцагчийн санал">
                    <textarea autoFocus value={feedback} onChange={(e) => setFeedback(e.target.value)} rows={3} placeholder="Юу таалагдсан, юу болохгүй, ямар шийдвэр гаргасан…" className={textareaCls} />
                </Field>
                <div className="flex flex-col gap-1.5">
                    <span id={followupLabelId} className="text-xs font-medium text-muted-foreground">Дараагийн холбоо</span>
                    <div role="group" aria-labelledby={followupLabelId} className="flex flex-wrap gap-1.5">
                        {FOLLOWUP_DAYS.map((f) => (
                            <button key={f.days} type="button" aria-pressed={followup === f.days} onClick={() => setFollowup(followup === f.days ? null : f.days)} className={chipCls(followup === f.days)}>{f.label}</button>
                        ))}
                    </div>
                    <p className="text-xs text-muted-foreground">Улаанбаатарын 10:00 цагт сануулна.</p>
                </div>
            </div>
            <footer className="flex shrink-0 items-center gap-2 border-t border-border px-5 py-4">
                <Button size="sm" variant="ghost" onClick={onClose}>Болих</Button>
                <Button size="sm" className="ml-auto" disabled={update.isPending} onClick={() => void submit()}>
                    {update.isPending ? <Loader2 className="animate-spin" /> : <Check />}Дууссан
                </Button>
            </footer>
        </div>
    );
}

/* ── Жижиг хэсгүүд ─────────────────────────────────────────────────────────────────── */

const inputCls = 'h-9 w-full rounded-lg border border-control bg-surface px-3 text-sm text-foreground placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:bg-surface-2';
const textareaCls = 'w-full resize-none rounded-lg border border-control bg-surface px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground';
const chipCls = (active: boolean) => cn(
    'inline-flex h-8 items-center rounded-lg border px-2.5 text-xs font-medium transition-colors',
    active ? 'border-brand bg-brand-soft text-brand-strong' : 'border-border text-fg-2 hover:border-border-strong hover:text-foreground',
);

function SheetHeaderBar({ title, onClose }: { title: string; onClose: () => void }) {
    return (
        <header className="flex h-14 shrink-0 items-center gap-3 border-b border-border px-5">
            <h2 className="truncate text-base font-semibold text-foreground">{title}</h2>
            <Button variant="ghost" size="iconSm" className="ml-auto" onClick={onClose} aria-label="Хаах"><X /></Button>
        </header>
    );
}

function InterestStars({ value, onChange, size }: { value: number; onChange: (v: number) => void; size: 'sm' | 'md' }) {
    const labelId = useId();
    return (
        <div className="flex flex-col gap-1.5">
            <span id={labelId} className="text-xs font-medium text-muted-foreground">Сонирхол</span>
            <div role="group" aria-labelledby={labelId} className="flex gap-1">
                {[1, 2, 3, 4, 5].map((s) => (
                    <button key={s} type="button" onClick={() => onChange(s === value ? 0 : s)} aria-pressed={s === value} className="rounded-md p-0.5" aria-label={`${s}/5`}>
                        <Star className={cn(size === 'md' ? 'size-6' : 'size-5', s <= value ? 'fill-current text-status-pending' : 'text-border-strong hover:text-status-pending')} />
                    </button>
                ))}
            </div>
        </div>
    );
}

function Field({ label, required, hint, children }: { label: string; required?: boolean; hint?: string; children: React.ReactNode }) {
    return (
        <label className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-muted-foreground">
                {label}{required && <span className="ml-0.5 text-status-danger">*</span>}
                {hint && <span className="ml-1.5 font-normal">· {hint}</span>}
            </span>
            {children}
        </label>
    );
}

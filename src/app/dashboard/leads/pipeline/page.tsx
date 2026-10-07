'use client';

import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { useDashboardQuery } from '@/hooks/useDashboardQuery';
import { dashboardFetch } from '@/lib/api/dashboardFetch';
import { toast } from 'sonner';
import {
    GripVertical,
    User,
    Phone,
    Calendar,
    Banknote,
    Loader2,
    AlertTriangle,
    Clock,
    CheckCircle2,
    XCircle,
    Flame,
    Circle,
} from 'lucide-react';
import {
    DndContext,
    DragOverlay,
    PointerSensor,
    KeyboardSensor,
    useSensor,
    useSensors,
    useDraggable,
    useDroppable,
    closestCorners,
    type DragStartEvent,
    type DragEndEvent,
} from '@dnd-kit/core';
import { motion } from 'motion/react';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { PageHeader } from '@/components/dashboard/PageHeader';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { StatusPill } from '@/components/ui/StatusPill';
import {
    Sheet,
    SheetContent,
    SheetHeader,
    SheetTitle,
    SheetDescription,
} from '@/components/ui/Sheet';
import { cn } from '@/lib/utils';
import { formatShortDate } from '@/lib/utils/date';
import { formatMNTShort } from '@/lib/utils/currency';
import { UNCATEGORIZED_KEY, UNCATEGORIZED_LABEL, categoryOptionLabel, leadDisplayName, statusLabel } from '@/lib/leads/labels';
import {
    PIPELINE_STAGE_RULES, daysInStage, isClosedStatus, isOverdue, isStalled, movePipelineLead, pipelineTotals,
    type PipelineStageRule, type PipelineSummary,
} from '@/lib/leads/pipeline';
import { useLeadCategories, type LeadCategoryRow } from '@/hooks/useLeads';
import { CategoryBadge } from '@/components/leads/pickers';
import { FilterChip } from '@/components/dashboard/FilterBar';
import { LeadsViewSwitch } from '@/components/leads/LeadsViewSwitch';
import { LeadCard } from '@/components/leads/LeadCard';
import { useModuleAccess } from '@/hooks/useModuleAccess';

interface Lead {
    id: string;
    customer_name: string | null;
    customer_phone: string | null;
    status: string;
    source: string;
    budget_min: number | null;
    budget_max: number | null;
    preferred_type: string | null;
    urgency: string;
    next_followup_at: string | null;
    stage_changed_at: string | null;
    lost_reason: string | null;
    category_id?: string | null;
    created_at: string;
}

/** Шатны дүрэм (магадлал, зогссон хоног) `lib/leads/pipeline.ts`-ээс; энд зөвхөн харагдац. */
interface Stage extends PipelineStageRule {
    /** толгойн цэгийн өнгө (token) */
    dot: string;
    /** баганын дэвсгэр + хүрээ (token) */
    bg: string;
}

const STAGE_STYLE: Record<string, Pick<Stage, 'dot' | 'bg'>> = {
    new: { dot: 'bg-status-info', bg: 'bg-surface-2/50 border-border' },
    contacted: { dot: 'bg-status-pending', bg: 'bg-surface-2/50 border-border' },
    viewing_scheduled: { dot: 'bg-brand', bg: 'bg-brand-soft border-brand/30' },
    offered: { dot: 'bg-status-pending', bg: 'bg-surface-2/50 border-border' },
    negotiating: { dot: 'bg-status-info', bg: 'bg-surface-2/50 border-border' },
    closed_won: { dot: 'bg-status-success', bg: 'bg-surface-2/50 border-border' },
    closed_lost: { dot: 'bg-status-neutral-soft', bg: 'bg-surface-2/50 border-border' },
};

const PIPELINE_STAGES: Stage[] = PIPELINE_STAGE_RULES.map(rule => ({ ...rule, ...STAGE_STYLE[rule.key] }));

interface PipelineData {
    leads?: Lead[];
    pagination?: { total?: number };
}

const PIPELINE_KEY = ['leads', 'pipeline'] as const;
/** Бүх лидийн тоо, дүн (/api/dashboard/leads/pipeline-summary). */
const PIPELINE_SUMMARY_KEY = ['leads', 'pipeline-summary'] as const;
/** Самбарын карт: хамгийн сүүлд бүртгэгдсэн 1,000 лид (аюулгүйн таг). Тоо, дүнг summary-гаас авна. */
const PIPELINE_CARD_LIMIT = 1000;

const categoryQuery = (category: string) => (category === 'all' ? '' : `category=${encodeURIComponent(category)}`);

const LOST_REASONS = [
    'Үнэ тохироогүй',
    'Санхүүжилт татгалзсан',
    'Өрсөлдөгч сонгосон',
    'Хариу өгөхгүй болсон',
    'Цаг нь биш',
    'Бусад',
];

const urgencyLabel: Record<string, string> = { urgent: 'Яаралтай', normal: 'Энгийн', flexible: 'Уян хатан' };

const urgencyVariant: Record<string, 'danger' | 'neutral' | 'success'> = {
    urgent: 'danger',
    normal: 'neutral',
    flexible: 'success',
};

const formatBudget = (min: number | null, max: number | null) => {
    if (min && max) return `${formatMNTShort(min)} – ${formatMNTShort(max)}`;
    if (min) return `${formatMNTShort(min)}+`;
    if (max) return formatMNTShort(max);
    return '';
};

const formatCount = (n: number) => n.toLocaleString('en-US');

/* -------------------------------------------------------------------------- */
/*  Lead card (дотоод харагдац) — drag overlay болон багана дотор хоёуланд нь   */
/* -------------------------------------------------------------------------- */

function LeadCardBody({ lead, now, category }: { lead: Lead; now: number; category?: LeadCategoryRow | null }) {
    const stalled = isStalled(lead, now);
    const overdue = isOverdue(lead, now);
    const days = daysInStage(lead, now);

    return (
        <>
            <div className="flex items-start justify-between mb-1.5">
                <p className="text-sm font-medium text-foreground flex items-center gap-1">
                    <User className="w-3.5 h-3.5 text-muted-foreground/70" />
                    {leadDisplayName(lead)}
                </p>
                <GripVertical className="w-4 h-4 text-muted-foreground/60 flex-shrink-0" />
            </div>

            {lead.customer_phone && (
                <p className="text-xs text-muted-foreground flex items-center gap-1 mb-1">
                    <Phone className="w-3 h-3" />
                    {lead.customer_phone}
                </p>
            )}

            <div className="flex items-center gap-1.5 flex-wrap">
                {category && <CategoryBadge category={category} className="max-w-[180px]" />}
                {lead.urgency && (
                    <StatusPill variant={urgencyVariant[lead.urgency] || urgencyVariant.normal} className="text-2xs px-1.5 py-0.5">
                        {lead.urgency === 'urgent' ? (
                            <Flame className="w-2.5 h-2.5" />
                        ) : lead.urgency === 'flexible' ? (
                            <Circle className="w-2.5 h-2.5 fill-current" />
                        ) : (
                            <Circle className="w-2.5 h-2.5" />
                        )}
                        {urgencyLabel[lead.urgency] ?? lead.urgency}
                    </StatusPill>
                )}
                {(lead.budget_min || lead.budget_max) && (
                    <span className="text-2xs text-muted-foreground flex items-center gap-0.5 tabular-nums">
                        <Banknote className="w-3 h-3" />
                        {formatBudget(lead.budget_min, lead.budget_max)}
                    </span>
                )}
                {/* Шатанд байсан хугацаа — зогссон бол улаан */}
                {!isClosedStatus(lead.status) && (
                    <span className={cn(
                        'px-1.5 py-0.5 rounded text-2xs font-medium inline-flex items-center gap-0.5 tabular-nums',
                        stalled ? 'bg-status-danger-soft text-status-danger' : 'bg-surface-2 text-muted-foreground/80',
                    )}>
                        <Clock className="w-2.5 h-2.5" />{days}х
                    </span>
                )}
            </div>

            {/* closed_lost дээр алдсан шалтгаан */}
            {lead.status === 'closed_lost' && lead.lost_reason && (
                <p className="text-2xs text-muted-foreground mt-1.5 flex items-center gap-1">
                    <XCircle className="w-3 h-3 flex-shrink-0" />{lead.lost_reason}
                </p>
            )}

            {/* Дараагийн алхам / overdue / алхамгүй */}
            {lead.next_followup_at ? (
                <p className={cn(
                    'text-2xs mt-1.5 flex items-center gap-1',
                    overdue ? 'text-status-danger font-medium' : 'text-brand-strong',
                )}>
                    <Calendar className="w-3 h-3" />
                    {overdue ? 'Хугацаа хэтэрсэн: ' : 'Дараагийн алхам: '}{formatShortDate(lead.next_followup_at)}
                </p>
            ) : !isClosedStatus(lead.status) && (
                <p className="text-2xs mt-1.5 flex items-center gap-1 text-status-pending">
                    <AlertTriangle className="w-3 h-3" />
                    Дараагийн алхамгүй
                </p>
            )}
        </>
    );
}

/* -------------------------------------------------------------------------- */
/*  Draggable lead card                                                        */
/* -------------------------------------------------------------------------- */

function DraggableLeadCard({
    lead,
    now,
    isDragging,
    reduced,
    category,
    selected,
    onOpen,
}: {
    lead: Lead;
    now: number;
    isDragging: boolean;
    reduced: boolean;
    category?: LeadCategoryRow | null;
    selected: boolean;
    onOpen: (id: string) => void;
}) {
    const stalled = isStalled(lead, now);
    const { attributes, listeners, setNodeRef } = useDraggable({ id: lead.id });

    return (
        <motion.div
            ref={setNodeRef}
            {...attributes}
            {...listeners}
            aria-label={`${leadDisplayName(lead)} — Enter: карт нээх, Space: шат солихоор чирэх`}
            // Чирээгүй дарвал (6px-ээс бага) Харилцагчийн карт нээгдэнэ; Enter нь ч мөн адил (Space — гараар чирэх).
            onClick={() => onOpen(lead.id)}
            onKeyDown={(event) => {
                listeners?.onKeyDown?.(event);
                if (event.key === 'Enter' && !event.defaultPrevented) { event.preventDefault(); onOpen(lead.id); }
            }}
            layout={!reduced}
            initial={reduced ? false : { opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: reduced ? 0 : 0.22 }}
            className={cn(
                'bg-surface rounded-lg p-3 border cursor-grab active:cursor-grabbing hover:border-border-strong transition-colors touch-none',
                isDragging ? 'opacity-50 scale-95' : '',
                selected ? 'border-brand shadow-[inset_3px_0_0_var(--brand)]' : stalled ? 'border-status-danger/50' : 'border-border',
            )}
        >
            <LeadCardBody lead={lead} now={now} category={category} />
        </motion.div>
    );
}

/* -------------------------------------------------------------------------- */
/*  Droppable stage column                                                     */
/* -------------------------------------------------------------------------- */

function StageColumn({
    stage,
    stageLeads,
    stageCount,
    stageValue,
    now,
    activeDragId,
    reduced,
    categoryOf,
    openId,
    onOpen,
}: {
    stage: Stage;
    stageLeads: Lead[];
    /** Шатны бүх лид (серверийн тоолол) — ачаалсан картаас олон байж болно. */
    stageCount: number;
    stageValue: number;
    now: number;
    activeDragId: string | null;
    reduced: boolean;
    categoryOf: (lead: Lead) => LeadCategoryRow | null;
    openId: string | null;
    onOpen: (id: string) => void;
}) {
    const { setNodeRef, isOver } = useDroppable({ id: stage.key });

    return (
        <div
            ref={setNodeRef}
            data-stage={stage.key}
            className={cn(
                'flex-1 min-w-[240px] rounded-xl border p-3 transition-all',
                stage.bg,
                activeDragId ? 'ring-2 ring-ring/40' : '',
                isOver ? 'ring-2 ring-ring' : '',
            )}
        >
            <div className="flex items-center gap-2 mb-3">
                <div className={cn('w-3 h-3 rounded-full', stage.dot)} />
                <span className="text-sm font-semibold text-foreground flex items-center gap-1">
                    {stage.key === 'closed_won' && <CheckCircle2 className="w-3.5 h-3.5 text-status-success" />}
                    {stage.key === 'closed_lost' && <XCircle className="w-3.5 h-3.5 text-muted-foreground" />}
                    {statusLabel(stage.key)}
                </span>
                <span className="text-xs text-muted-foreground/70 ml-auto tabular-nums">{formatCount(stageCount)}</span>
            </div>
            {stageValue > 0 && (
                <p className="text-2xs text-muted-foreground -mt-2 mb-2 flex items-center gap-0.5 tabular-nums">
                    <Banknote className="w-3 h-3" />{formatMNTShort(stageValue)}
                </p>
            )}
            {stageLeads.length < stageCount && (
                <p className="text-2xs text-status-pending -mt-1 mb-2 tabular-nums">
                    {formatCount(stageLeads.length)} / {formatCount(stageCount)} карт харагдаж байна
                </p>
            )}

            <div className="space-y-2 min-h-[100px]">
                {stageLeads.map(lead => (
                    <DraggableLeadCard
                        key={lead.id}
                        lead={lead}
                        now={now}
                        isDragging={activeDragId === lead.id}
                        reduced={reduced}
                        category={categoryOf(lead)}
                        selected={openId === lead.id}
                        onOpen={onOpen}
                    />
                ))}
            </div>
        </div>
    );
}

/** Самбарын URL: жагсаалттай ижил ангиллын шүүлтүүр (жагсаалт ↔ Шатаар солиход хадгалагдана) ба нээлттэй карт. */
function boardUrl(category: string, leadId: string | null) {
    const sp = new URLSearchParams(categoryQuery(category));
    if (leadId) sp.set('lead', leadId);
    const query = sp.toString();
    return `/dashboard/leads/pipeline${query ? `?${query}` : ''}`;
}

export default function PipelinePage() {
    const queryClient = useQueryClient();
    const reduced = useReducedMotion();
    const search = useSearchParams();
    const { canWrite } = useModuleAccess();
    const { data: categories = [] } = useLeadCategories();
    // Ангиллаар шүүх — сервер дээр: карт ба бүх лидийн тоо, таамаг хоёуланд.
    const [category, setCategoryState] = useState(() => search?.get('category') || 'all');
    const [openId, setOpenId] = useState<string | null>(() => search?.get('lead') ?? null);
    const setCategory = (next: string) => {
        setCategoryState(next);
        window.history.replaceState(null, '', boardUrl(next, openId));
    };
    const openCard = (id: string | null) => {
        setOpenId(id);
        window.history.replaceState(null, '', boardUrl(category, id));
    };
    const filter = categoryQuery(category);
    const list = useDashboardQuery<PipelineData>(
        PIPELINE_KEY, `/api/dashboard/leads?pageSize=${PIPELINE_CARD_LIMIT}${filter ? `&${filter}` : ''}`, { keepPreviousData: true });
    const summaryQuery = useDashboardQuery<PipelineSummary>(
        PIPELINE_SUMMARY_KEY, `/api/dashboard/leads/pipeline-summary${filter ? `?${filter}` : ''}`, { keepPreviousData: true });
    const { data, dataUpdatedAt } = list;
    const summary = summaryQuery.data;
    const leads = data?.leads ?? [];
    const categoryOf = (lead: Lead) => (lead.category_id ? categories.find(c => c.id === lead.category_id) ?? null : null);
    // Самбарт ачаалсан картаас олон лид байвал (жагсаалтын нийт тоо) ил хэлнэ.
    const listTotal = data?.pagination?.total ?? leads.length;
    const [activeDragId, setActiveDragId] = useState<string | null>(null);
    const [lostModal, setLostModal] = useState<{ leadId: string; name: string } | null>(null);
    // Өгөгдөл ирэх бүрд (dataUpdatedAt) "хоног" тооцоо ч шинэчлэгдэнэ.
    const [clock, setClock] = useState<number>(() => Date.now());
    const now = Math.max(clock, dataUpdatedAt);

    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
        // Enter-ийг карт нээхэд үлдээнэ: гараар чирэх нь Space.
        useSensor(KeyboardSensor, { keyboardCodes: { start: ['Space'], cancel: ['Escape'], end: ['Space'] } }),
    );

    useEffect(() => {
        // "хоног" тооцоог цагийн дагуу шинэчлэх (1 цаг тутам) + таб руу буцахад шууд.
        const t = setInterval(() => setClock(Date.now()), 3600_000);
        const refresh = () => { if (!document.hidden) setClock(Date.now()); };
        window.addEventListener('focus', refresh);
        document.addEventListener('visibilitychange', refresh);
        return () => {
            clearInterval(t);
            window.removeEventListener('focus', refresh);
            document.removeEventListener('visibilitychange', refresh);
        };
    }, []);

    /** Самбарын cache-ийг синхрон засна — буулгасан карт тэр даруй шинэ баганад харагдана. */
    function updateCachedLeads(update: (lead: Lead) => Lead) {
        queryClient.setQueriesData<PipelineData>({ queryKey: PIPELINE_KEY }, (current) =>
            current ? { ...current, leads: (current.leads ?? []).map(update) } : current);
    }

    /** Харагдаж буй (идэвхтэй) тооллыг л засна — бусад ангиллын хадгалсан тоолол дахин уншигдана. */
    function updateCachedSummary(update: (current: PipelineSummary) => PipelineSummary) {
        queryClient.setQueriesData<PipelineSummary>({ queryKey: PIPELINE_SUMMARY_KEY, type: 'active' }, (current) =>
            current ? update(current) : current);
    }

    async function moveToStage(leadId: string, newStatus: string, lostReason?: string) {
        // Зөвхөн тухайн лийдийн хуучин төлвийг хадгална — алдаа гарвал бусад зэрэгцээ
        // зөөлтийг устгахгүйгээр энэ нэг картыг л буцаана.
        const original = leads.find(l => l.id === leadId);
        if (!original) return;
        const stampedAt = new Date().toISOString();
        const moved: Lead = {
            ...original,
            status: newStatus,
            stage_changed_at: stampedAt,
            lost_reason: newStatus === 'closed_lost' ? (lostReason ?? original.lost_reason) : null,
        };
        const movedAt = Date.now();
        // Явж буй дахин таталтыг (хуучин төлөвтэй байж болзошгүй) цуцалж, дараа нь зөөлтийг тусгана.
        void queryClient.cancelQueries({ queryKey: PIPELINE_KEY });
        void queryClient.cancelQueries({ queryKey: PIPELINE_SUMMARY_KEY });
        updateCachedLeads(l => (l.id === leadId ? moved : l));
        updateCachedSummary(current => movePipelineLead(current, original, moved, movedAt));
        try {
            const res = await dashboardFetch(`/api/dashboard/leads/${leadId}`, {
                method: 'PATCH',
                body: JSON.stringify({ status: newStatus, ...(lostReason ? { lost_reason: lostReason } : {}) }),
            });
            if (!res.ok) throw new Error('Failed');
            // Хүсэлтийн явцад самбар/тоолол дахин татагдаж эхэлсэн бол серверийн шинэ төлвөөр дахин татна.
            if (queryClient.isFetching({ queryKey: PIPELINE_KEY })) void queryClient.invalidateQueries({ queryKey: PIPELINE_KEY });
            if (queryClient.isFetching({ queryKey: PIPELINE_SUMMARY_KEY })) void queryClient.invalidateQueries({ queryKey: PIPELINE_SUMMARY_KEY });
            // Лидийн бусад жагсаалт/тоо дараагийн нээлтэд шинэчлэгдэнэ (самбарыг дахин татахгүй).
            void queryClient.invalidateQueries({
                queryKey: ['leads'],
                predicate: (query) => query.queryKey[1] !== 'pipeline' && query.queryKey[1] !== 'pipeline-summary',
            });
            toast.success('Статус солигдлоо');
        } catch {
            updateCachedLeads(l => (l.id === leadId ? original : l));
            updateCachedSummary(current => movePipelineLead(current, moved, original, movedAt));
            // Нэгтгэлийг серверийн бодит тоогоор баталгаажуулна.
            void queryClient.invalidateQueries({ queryKey: PIPELINE_SUMMARY_KEY });
            toast.error('Статус солиход алдаа');
        }
    }

    const handleDragStart = (e: DragStartEvent) => {
        setActiveDragId(String(e.active.id));
    };

    const handleDragEnd = (e: DragEndEvent) => {
        const leadId = String(e.active.id);
        const stageKey = e.over ? String(e.over.id) : null;
        setActiveDragId(null);
        if (!leadId || !stageKey) return;
        const lead = leads.find(l => l.id === leadId);
        if (!lead || lead.status === stageKey) return;
        // "Алдсан"-руу шилжихэд шалтгаан асууна (win/loss analysis).
        if (stageKey === 'closed_lost') {
            setLostModal({ leadId, name: leadDisplayName(lead) });
            return;
        }
        moveToStage(leadId, stageKey);
    };

    const activeLead = activeDragId ? leads.find(l => l.id === activeDragId) ?? null : null;

    // Самбар картгүйгээр тоо, таамгийг (эсвэл эсрэгээр) харуулахгүй: аль нэг нь уншигдаагүй бол алдаа.
    const loadError = (!data && list.error) || (!summary && summaryQuery.error);
    if (loadError) {
        return (
            <Alert variant="danger">
                <AlertTitle>Лид татахад алдаа</AlertTitle>
                <AlertDescription>{loadError.message}</AlertDescription>
                <Button size="sm" variant="secondary" className="self-start" disabled={list.isFetching || summaryQuery.isFetching}
                    onClick={() => { if (!data) void list.refetch(); if (!summary) void summaryQuery.refetch(); }}>Дахин оролдох</Button>
            </Alert>
        );
    }

    if (!data || !summary) {
        return (
            <div className="flex items-center justify-center min-h-[400px]">
                <Loader2 className="w-8 h-8 animate-spin text-brand-strong" />
            </div>
        );
    }

    // ---- Forecast / hygiene: бүх лидээр (серверийн тоолол); карт нь зөвхөн ачаалсан хэсэг ----
    const totals = pipelineTotals(summary);
    const stageSummary = new Map<string, PipelineSummary['stages'][number]>(summary.stages.map(s => [s.status, s]));

    return (
        <div>
            <PageHeader
                title="Шатаар"
                subtitle={`${formatCount(totals.total)} лид · картыг чирж шат солино, дарж нээнэ`}
                className="mb-4"
            />
            <div className="mb-4 flex flex-wrap items-center gap-x-6 gap-y-3">
                <dl className="flex flex-wrap items-center gap-x-6 gap-y-2">
                    <div>
                        <dt className="text-xs text-muted-foreground">Нээлттэй дүн</dt>
                        <dd className="num text-sm font-semibold text-foreground">{formatMNTShort(totals.openValue)}</dd>
                    </div>
                    <div>
                        <dt className="text-xs text-muted-foreground">Жинлэсэн таамаг</dt>
                        <dd className="num text-sm font-semibold text-brand-strong">{formatMNTShort(totals.weightedForecast)}</dd>
                    </div>
                    <div>
                        <dt className="text-xs text-muted-foreground">Хаасан</dt>
                        <dd className="num text-sm font-semibold text-status-success">{formatMNTShort(totals.wonValue)}</dd>
                    </div>
                </dl>
                {categories.length > 0 && (
                    <FilterChip value={category} onChange={setCategory} label="Ангилал"
                        options={[[UNCATEGORIZED_KEY, UNCATEGORIZED_LABEL], ...categories.map((c): [string, string] => [c.id, categoryOptionLabel(c)])]} />
                )}
                <LeadsViewSwitch current="board" query={categoryQuery(category)} className="ml-auto" />
            </div>

            {/* Карт хамгийн сүүлийн 1,000 лидээр хязгаарлагдана; тоо, дүн, таамаг бүх лидээр (summary). */}
            {listTotal > leads.length && (
                <Alert variant="warning" className="mb-3">
                    <AlertTitle>Картын жагсаалт бүрэн биш: {formatCount(listTotal)} лидээс хамгийн сүүлд бүртгэгдсэн {formatCount(leads.length)} лидийн карт харагдаж байна</AlertTitle>
                    <AlertDescription>
                        Баганын тоо, нээлттэй дүн, жинлэсэн таамаг, хаасан дүн, зогссон ба дараагийн алхамгүй лидийн тоог бүх лидээр тооцсон. Харагдахгүй лидийг «Жагсаалт» харагдацаас хайж нээнэ үү.
                    </AlertDescription>
                </Alert>
            )}

            {/* Hygiene анхааруулга */}
            {(totals.stalled > 0 || totals.noNextStep > 0) && (
                <div className="flex items-center gap-3 mb-4 flex-wrap">
                    {totals.stalled > 0 && (
                        <StatusPill variant="danger" className="px-2.5 py-1">
                            <AlertTriangle className="w-3.5 h-3.5" />
                            {formatCount(totals.stalled)} зогссон лид
                        </StatusPill>
                    )}
                    {totals.noNextStep > 0 && (
                        <StatusPill variant="pending" className="px-2.5 py-1">
                            <Clock className="w-3.5 h-3.5" />
                            {formatCount(totals.noNextStep)} дараагийн алхамгүй
                        </StatusPill>
                    )}
                </div>
            )}

            <DndContext
                sensors={sensors}
                collisionDetection={closestCorners}
                onDragStart={handleDragStart}
                onDragEnd={handleDragEnd}
                onDragCancel={() => setActiveDragId(null)}
            >
                <div className="overflow-x-auto -mx-1 px-1">
                    <div className="flex gap-3" style={{ minWidth: `${PIPELINE_STAGES.length * 260}px` }}>
                        {PIPELINE_STAGES.map(stage => {
                            const stageLeads = leads.filter(l => l.status === stage.key);
                            return (
                                <StageColumn
                                    key={stage.key}
                                    stage={stage}
                                    stageLeads={stageLeads}
                                    stageCount={stageSummary.get(stage.key)?.count ?? 0}
                                    stageValue={stageSummary.get(stage.key)?.value ?? 0}
                                    now={now}
                                    activeDragId={activeDragId}
                                    reduced={reduced}
                                    categoryOf={categoryOf}
                                    openId={openId}
                                    onOpen={openCard}
                                />
                            );
                        })}
                    </div>
                </div>

                <DragOverlay>
                    {activeLead ? (
                        <div className="bg-surface rounded-lg p-3 border border-border shadow-lg w-[232px] cursor-grabbing">
                            <LeadCardBody lead={activeLead} now={now} category={categoryOf(activeLead)} />
                        </div>
                    ) : null}
                </DragOverlay>
            </DndContext>

            {openId && (
                <aside aria-label="Харилцагчийн карт" className="fixed inset-y-0 right-0 z-30 mt-[var(--header-h)] w-[min(440px,100vw)] overflow-hidden border-l border-border bg-surface shadow-xl">
                    <LeadCard key={openId} leadId={openId} canWrite={canWrite('leads')} onClose={() => openCard(null)} onOpenLead={openCard} />
                </aside>
            )}

            {/* Алдсан шалтгааны хүснэгт (Sheet) */}
            <Sheet open={!!lostModal} onOpenChange={(open) => { if (!open) setLostModal(null); }}>
                <SheetContent side="right" className="sm:max-w-sm">
                    <SheetHeader>
                        <SheetTitle>Яагаад алдсан бэ?</SheetTitle>
                        <SheetDescription>
                            {lostModal?.name} — шалтгааныг сонгоно уу
                        </SheetDescription>
                    </SheetHeader>
                    <div className="space-y-1.5 px-6 pb-6">
                        {LOST_REASONS.map(reason => (
                            <button
                                key={reason}
                                onClick={() => {
                                    if (lostModal) moveToStage(lostModal.leadId, 'closed_lost', reason);
                                    setLostModal(null);
                                }}
                                className="w-full text-left px-3 py-2 rounded-md text-sm text-foreground hover:bg-surface-2 border border-border transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                            >
                                {reason}
                            </button>
                        ))}
                    </div>
                </SheetContent>
            </Sheet>
        </div>
    );
}

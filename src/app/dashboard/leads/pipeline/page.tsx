'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import {
    GripVertical,
    User,
    Phone,
    Calendar,
    DollarSign,
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

interface Lead {
    id: string;
    customer_name: string;
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
    created_at: string;
}

interface Stage {
    key: string;
    label: string;
    /** толгойн цэгийн өнгө (token) */
    dot: string;
    /** баганын дэвсгэр + хүрээ (token) */
    bg: string;
    /** closed_won-руу хүрэх магадлал (weighted forecast) */
    probability: number;
    /** энэ шатанд хэдэн хоног зогсвол "зогссон" гэж үзэх (0 = шалгахгүй) */
    stalledDays: number;
}

const PIPELINE_STAGES: Stage[] = [
    { key: 'new', label: 'Шинэ', dot: 'bg-status-info', bg: 'bg-status-info-soft border-status-info/30', probability: 0.1, stalledDays: 3 },
    { key: 'contacted', label: 'Холбогдсон', dot: 'bg-status-pending', bg: 'bg-status-pending-soft border-status-pending/30', probability: 0.2, stalledDays: 5 },
    { key: 'viewing_scheduled', label: 'Үзлэг товлосон', dot: 'bg-brand', bg: 'bg-brand-soft border-brand/30', probability: 0.4, stalledDays: 7 },
    { key: 'offered', label: 'Санал илгээсэн', dot: 'bg-status-pending', bg: 'bg-status-pending-soft border-status-pending/30', probability: 0.6, stalledDays: 7 },
    { key: 'negotiating', label: 'Хэлэлцэж байна', dot: 'bg-status-info', bg: 'bg-status-info-soft border-status-info/30', probability: 0.8, stalledDays: 10 },
    { key: 'closed_won', label: 'Амжилттай', dot: 'bg-status-success', bg: 'bg-status-success-soft border-status-success/30', probability: 1, stalledDays: 0 },
    { key: 'closed_lost', label: 'Алдсан', dot: 'bg-status-neutral-soft', bg: 'bg-surface-2/40 border-border', probability: 0, stalledDays: 0 },
];

const STAGE_MAP: Record<string, Stage> = Object.fromEntries(PIPELINE_STAGES.map(s => [s.key, s]));

const LOST_REASONS = [
    'Үнэ тохироогүй',
    'Санхүүжилт татгалзсан',
    'Өрсөлдөгч сонгосон',
    'Хариу өгөхгүй болсон',
    'Цаг нь биш',
    'Бусад',
];

const urgencyVariant: Record<string, 'danger' | 'neutral' | 'success'> = {
    urgent: 'danger',
    normal: 'neutral',
    flexible: 'success',
};

const DAY_MS = 86400000;

const fmtMoney = (n: number) => n >= 1e9 ? `${(n / 1e9).toFixed(1)}B` : n >= 1e6 ? `${(n / 1e6).toFixed(0)}M` : n.toLocaleString();

const formatBudget = (min: number | null, max: number | null) => {
    if (min && max) return `${fmtMoney(min)}-${fmtMoney(max)}₮`;
    if (min) return `${fmtMoney(min)}₮+`;
    if (max) return `${fmtMoney(max)}₮`;
    return '';
};

/** Лийдийн төлөөлөл утга (budget mid-point) — forecast-д ашиглана. */
const leadValue = (l: Lead): number => {
    if (l.budget_min && l.budget_max) return (l.budget_min + l.budget_max) / 2;
    return l.budget_min || l.budget_max || 0;
};

const isClosed = (status: string) => status === 'closed_won' || status === 'closed_lost';

/** Одоогийн шатанд хэдэн хоног болсон (stage_changed_at, эс бөгөөс created_at). */
const daysInStage = (l: Lead, now: number): number => {
    const ts = l.stage_changed_at || l.created_at;
    if (!ts) return 0;
    return Math.floor((now - new Date(ts).getTime()) / DAY_MS);
};

const isStalled = (l: Lead, now: number): boolean => {
    if (isClosed(l.status)) return false;
    const threshold = STAGE_MAP[l.status]?.stalledDays || 0;
    return threshold > 0 && daysInStage(l, now) >= threshold;
};

const isOverdue = (l: Lead, now: number): boolean =>
    !!l.next_followup_at && !isClosed(l.status) && new Date(l.next_followup_at).getTime() < now;

const noNextStep = (l: Lead): boolean => !l.next_followup_at && !isClosed(l.status);

/* -------------------------------------------------------------------------- */
/*  Lead card (дотоод харагдац) — drag overlay болон багана дотор хоёуланд нь   */
/* -------------------------------------------------------------------------- */

function LeadCardBody({ lead, now }: { lead: Lead; now: number }) {
    const stalled = isStalled(lead, now);
    const overdue = isOverdue(lead, now);
    const days = daysInStage(lead, now);

    return (
        <>
            <div className="flex items-start justify-between mb-1.5">
                <p className="text-sm font-medium text-foreground flex items-center gap-1">
                    <User className="w-3.5 h-3.5 text-muted-foreground/70" />
                    {lead.customer_name || 'Нэргүй'}
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
                {lead.urgency && (
                    <StatusPill variant={urgencyVariant[lead.urgency] || urgencyVariant.normal} className="text-2xs px-1.5 py-0.5">
                        {lead.urgency === 'urgent' ? (
                            <Flame className="w-2.5 h-2.5" />
                        ) : lead.urgency === 'flexible' ? (
                            <Circle className="w-2.5 h-2.5 fill-current" />
                        ) : (
                            <Circle className="w-2.5 h-2.5" />
                        )}
                        {lead.urgency}
                    </StatusPill>
                )}
                {(lead.budget_min || lead.budget_max) && (
                    <span className="text-2xs text-muted-foreground flex items-center gap-0.5 tabular-nums">
                        <DollarSign className="w-2.5 h-2.5" />
                        {formatBudget(lead.budget_min, lead.budget_max)}
                    </span>
                )}
                {/* Шатанд байсан хугацаа — зогссон бол улаан */}
                {!isClosed(lead.status) && (
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
                    {overdue ? 'Хугацаа хэтэрсэн: ' : 'Follow-up: '}{formatShortDate(lead.next_followup_at)}
                </p>
            ) : !isClosed(lead.status) && (
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
}: {
    lead: Lead;
    now: number;
    isDragging: boolean;
    reduced: boolean;
}) {
    const stalled = isStalled(lead, now);
    const { attributes, listeners, setNodeRef } = useDraggable({ id: lead.id });

    return (
        <motion.div
            ref={setNodeRef}
            {...attributes}
            {...listeners}
            layout={!reduced}
            initial={reduced ? false : { opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: reduced ? 0 : 0.22 }}
            className={cn(
                'bg-surface rounded-lg p-3 border cursor-grab active:cursor-grabbing hover:shadow-md transition-shadow touch-none outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40 focus-visible:ring-offset-2 focus-visible:ring-offset-background',
                isDragging ? 'opacity-50 scale-95' : '',
                stalled ? 'border-status-danger/50 ring-1 ring-status-danger/20' : 'border-border',
            )}
        >
            <LeadCardBody lead={lead} now={now} />
        </motion.div>
    );
}

/* -------------------------------------------------------------------------- */
/*  Droppable stage column                                                     */
/* -------------------------------------------------------------------------- */

function StageColumn({
    stage,
    stageLeads,
    stageValue,
    now,
    activeDragId,
    reduced,
}: {
    stage: Stage;
    stageLeads: Lead[];
    stageValue: number;
    now: number;
    activeDragId: string | null;
    reduced: boolean;
}) {
    const { setNodeRef, isOver } = useDroppable({ id: stage.key });

    return (
        <div
            ref={setNodeRef}
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
                    {stage.label}
                </span>
                <span className="text-xs text-muted-foreground/70 ml-auto tabular-nums">{stageLeads.length}</span>
            </div>
            {stageValue > 0 && (
                <p className="text-2xs text-muted-foreground -mt-2 mb-2 flex items-center gap-0.5 tabular-nums">
                    <DollarSign className="w-3 h-3" />{fmtMoney(stageValue)}₮
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
                    />
                ))}
            </div>
        </div>
    );
}

export default function PipelinePage() {
    const { shop } = useAuth();
    const reduced = useReducedMotion();
    const [leads, setLeads] = useState<Lead[]>([]);
    const [loading, setLoading] = useState(true);
    const [activeDragId, setActiveDragId] = useState<string | null>(null);
    const [lostModal, setLostModal] = useState<{ leadId: string; name: string } | null>(null);
    const [now, setNow] = useState<number>(() => Date.now());
    const [total, setTotal] = useState(0);

    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
        useSensor(KeyboardSensor),
    );

    useEffect(() => {
        if (!shop?.id) return;
        fetchLeads();
        // "хоног" тооцоог цагийн дагуу шинэчлэх (1 цаг тутам) + таб руу буцахад шууд.
        const t = setInterval(() => setNow(Date.now()), 3600_000);
        const refresh = () => { if (!document.hidden) setNow(Date.now()); };
        window.addEventListener('focus', refresh);
        document.addEventListener('visibilitychange', refresh);
        return () => {
            clearInterval(t);
            window.removeEventListener('focus', refresh);
            document.removeEventListener('visibilitychange', refresh);
        };
    }, [shop?.id]);

    async function fetchLeads() {
        if (!shop?.id) return;
        setLoading(true);
        try {
            // pageSize=1000 — pipeline самбар бүх лийдийг харуулна (аюулгүйн таг).
            const res = await fetch('/api/dashboard/leads?pageSize=1000', {
                headers: { 'x-shop-id': shop.id },
            });
            if (!res.ok) throw new Error('Failed');
            const json = await res.json();
            setLeads(json.leads || []);
            setTotal(json.pagination?.total ?? (json.leads?.length || 0));
            setNow(Date.now());
        } catch {
            toast.error('Лийд татахад алдаа');
        } finally {
            setLoading(false);
        }
    }

    async function moveToStage(leadId: string, newStatus: string, lostReason?: string) {
        // Зөвхөн тухайн лийдийн хуучин төлвийг хадгална — алдаа гарвал бусад зэрэгцээ
        // зөөлтийг устгахгүйгээр энэ нэг картыг л буцаана.
        const original = leads.find(l => l.id === leadId);
        const stampedAt = new Date().toISOString();
        setLeads(p => p.map(l => l.id === leadId
            ? {
                ...l,
                status: newStatus,
                stage_changed_at: stampedAt,
                lost_reason: newStatus === 'closed_lost' ? (lostReason ?? l.lost_reason) : null,
            }
            : l));
        try {
            const res = await fetch(`/api/dashboard/leads/${leadId}`, {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                    'x-shop-id': localStorage.getItem('vertmonhub_active_shop_id') || shop?.id || '',
                },
                body: JSON.stringify({ status: newStatus, ...(lostReason ? { lost_reason: lostReason } : {}) }),
            });
            if (!res.ok) throw new Error('Failed');
            toast.success('Статус солигдлоо');
        } catch {
            if (original) setLeads(p => p.map(l => l.id === leadId ? original : l));
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
            setLostModal({ leadId, name: lead.customer_name || 'Нэргүй' });
            return;
        }
        moveToStage(leadId, stageKey);
    };

    // ---- Forecast / hygiene нэгтгэлүүд ----
    const activeLeads = leads.filter(l => !isClosed(l.status));
    const openValue = activeLeads.reduce((s, l) => s + leadValue(l), 0);
    const weightedForecast = activeLeads.reduce((s, l) => s + leadValue(l) * (STAGE_MAP[l.status]?.probability || 0), 0);
    const wonValue = leads.filter(l => l.status === 'closed_won').reduce((s, l) => s + leadValue(l), 0);
    const stalledCount = activeLeads.filter(l => isStalled(l, now)).length;
    const noStepCount = activeLeads.filter(noNextStep).length;

    const activeLead = activeDragId ? leads.find(l => l.id === activeDragId) ?? null : null;

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-[400px]">
                <Loader2 className="w-8 h-8 animate-spin text-brand-strong" />
            </div>
        );
    }

    return (
        <div>
            <PageHeader
                eyebrow="Pipeline"
                title="Pipeline"
                subtitle={`${leads.length} лийд • Чирж зөөнө үү`}
                breadcrumbs={[
                    { label: 'Лийдүүд', href: '/dashboard/leads' },
                    { label: 'Pipeline' },
                ]}
                secondaryActions={
                    <Button variant="secondary" size="sm" href="/dashboard/leads">
                        Буцах
                    </Button>
                }
                primaryAction={
                    <div className="flex items-center gap-4">
                        <div className="text-right">
                            <p className="text-2xs uppercase tracking-wide text-muted-foreground/70">Нээлттэй дүн</p>
                            <p className="text-sm font-semibold text-foreground tabular-nums">{fmtMoney(openValue)}₮</p>
                        </div>
                        <div className="text-right">
                            <p className="text-2xs uppercase tracking-wide text-muted-foreground/70">Жинлэсэн таамаг</p>
                            <p className="text-sm font-bold text-brand-strong tabular-nums">{fmtMoney(weightedForecast)}₮</p>
                        </div>
                        <div className="text-right">
                            <p className="text-2xs uppercase tracking-wide text-muted-foreground/70">Хаасан</p>
                            <p className="text-sm font-semibold text-status-success tabular-nums">{fmtMoney(wonValue)}₮</p>
                        </div>
                    </div>
                }
            />

            {/* Truncation анхааруулга — 1000-аас олон лийдтэй бол самбар бүгдийг
                харуулахгүй тул forecast/тоо дутуу болохыг мэдэгдэнэ. */}
            {total > leads.length && (
                <div className="flex items-center gap-1.5 mb-3 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-status-danger-soft text-status-danger">
                    <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
                    Нийт {total} лийдээс эхний {leads.length} харагдаж байна — таамаг/тоо дутуу. Шүүлтүүрээр багасгана уу.
                </div>
            )}

            {/* Hygiene анхааруулга */}
            {(stalledCount > 0 || noStepCount > 0) && (
                <div className="flex items-center gap-3 mb-4 flex-wrap">
                    {stalledCount > 0 && (
                        <StatusPill variant="danger" className="px-2.5 py-1">
                            <AlertTriangle className="w-3.5 h-3.5" />
                            {stalledCount} зогссон лийд
                        </StatusPill>
                    )}
                    {noStepCount > 0 && (
                        <StatusPill variant="pending" className="px-2.5 py-1">
                            <Clock className="w-3.5 h-3.5" />
                            {noStepCount} дараагийн алхамгүй
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
                            const stageValue = stageLeads.reduce((s, l) => s + leadValue(l), 0);
                            return (
                                <StageColumn
                                    key={stage.key}
                                    stage={stage}
                                    stageLeads={stageLeads}
                                    stageValue={stageValue}
                                    now={now}
                                    activeDragId={activeDragId}
                                    reduced={reduced}
                                />
                            );
                        })}
                    </div>
                </div>

                <DragOverlay>
                    {activeLead ? (
                        <div className="bg-surface rounded-lg p-3 border border-border shadow-lg w-[232px] cursor-grabbing">
                            <LeadCardBody lead={activeLead} now={now} />
                        </div>
                    ) : null}
                </DragOverlay>
            </DndContext>

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

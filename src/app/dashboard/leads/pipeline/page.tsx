'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { GripVertical, User, Phone, Calendar, DollarSign, ArrowLeft, Loader2, AlertTriangle, Clock, X } from 'lucide-react';
import Link from 'next/link';
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
    color: string;
    bg: string;
    /** closed_won-руу хүрэх магадлал (weighted forecast) */
    probability: number;
    /** энэ шатанд хэдэн хоног зогсвол "зогссон" гэж үзэх (0 = шалгахгүй) */
    stalledDays: number;
}

const PIPELINE_STAGES: Stage[] = [
    { key: 'new', label: 'Шинэ', color: 'bg-status-info', bg: 'bg-status-info-soft border-status-info/30', probability: 0.1, stalledDays: 3 },
    { key: 'contacted', label: 'Холбогдсон', color: 'bg-status-pending', bg: 'bg-status-pending-soft border-yellow-200', probability: 0.2, stalledDays: 5 },
    { key: 'viewing_scheduled', label: 'Үзлэг товлосон', color: 'bg-brand', bg: 'bg-brand-soft border-brand', probability: 0.4, stalledDays: 7 },
    { key: 'offered', label: 'Санал илгээсэн', color: 'bg-status-pending', bg: 'bg-status-pending-soft border-orange-200', probability: 0.6, stalledDays: 7 },
    { key: 'negotiating', label: 'Хэлэлцэж байна', color: 'bg-status-info', bg: 'bg-status-info-soft border-indigo-200', probability: 0.8, stalledDays: 10 },
    { key: 'closed_won', label: '✅ Амжилттай', color: 'bg-status-success', bg: 'bg-status-success-soft border-status-success/30', probability: 1, stalledDays: 0 },
    { key: 'closed_lost', label: '❌ Алдсан', color: 'bg-surface-2', bg: 'bg-surface-2/40 border-border', probability: 0, stalledDays: 0 },
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

const urgencyColors: Record<string, string> = {
    urgent: 'bg-status-danger-soft text-status-danger',
    normal: 'bg-surface-2 text-muted-foreground',
    flexible: 'bg-status-success-soft text-status-success',
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

export default function PipelinePage() {
    const { shop } = useAuth();
    const [leads, setLeads] = useState<Lead[]>([]);
    const [loading, setLoading] = useState(true);
    const [draggingId, setDraggingId] = useState<string | null>(null);
    const [lostModal, setLostModal] = useState<{ leadId: string; name: string } | null>(null);
    const [now, setNow] = useState<number>(() => Date.now());
    const [total, setTotal] = useState(0);

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

    const handleDragStart = (e: React.DragEvent, leadId: string) => {
        e.dataTransfer.setData('leadId', leadId);
        setDraggingId(leadId);
    };

    const handleDrop = (e: React.DragEvent, stageKey: string) => {
        e.preventDefault();
        const leadId = e.dataTransfer.getData('leadId');
        setDraggingId(null);
        if (!leadId) return;
        const lead = leads.find(l => l.id === leadId);
        if (!lead || lead.status === stageKey) return;
        // "Алдсан"-руу шилжихэд шалтгаан асууна (win/loss analysis).
        if (stageKey === 'closed_lost') {
            setLostModal({ leadId, name: lead.customer_name || 'Нэргүй' });
            return;
        }
        moveToStage(leadId, stageKey);
    };

    const handleDragOver = (e: React.DragEvent) => e.preventDefault();

    // ---- Forecast / hygiene нэгтгэлүүд ----
    const activeLeads = leads.filter(l => !isClosed(l.status));
    const openValue = activeLeads.reduce((s, l) => s + leadValue(l), 0);
    const weightedForecast = activeLeads.reduce((s, l) => s + leadValue(l) * (STAGE_MAP[l.status]?.probability || 0), 0);
    const wonValue = leads.filter(l => l.status === 'closed_won').reduce((s, l) => s + leadValue(l), 0);
    const stalledCount = activeLeads.filter(l => isStalled(l, now)).length;
    const noStepCount = activeLeads.filter(noNextStep).length;

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-[400px]">
                <Loader2 className="w-8 h-8 animate-spin text-brand-strong" />
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-surface-2/40">
            <div className="bg-surface border-b border-border px-6 py-4">
                <div className="flex items-center justify-between gap-4 flex-wrap">
                    <div className="flex items-center gap-3">
                        <Link href="/dashboard/leads" className="p-2 hover:bg-surface-2 rounded-lg">
                            <ArrowLeft className="w-5 h-5 text-muted-foreground" />
                        </Link>
                        <div>
                            <h1 className="text-xl font-semibold text-foreground">Pipeline</h1>
                            <p className="text-xs text-muted-foreground">{leads.length} лийд • Чирж зөөнө үү</p>
                        </div>
                    </div>

                    {/* Forecast хураангуй */}
                    <div className="flex items-center gap-4">
                        <div className="text-right">
                            <p className="text-[10px] uppercase tracking-wide text-muted-foreground/70">Нээлттэй дүн</p>
                            <p className="text-sm font-semibold text-foreground">{fmtMoney(openValue)}₮</p>
                        </div>
                        <div className="text-right">
                            <p className="text-[10px] uppercase tracking-wide text-muted-foreground/70">Жинлэсэн таамаг</p>
                            <p className="text-sm font-bold text-brand-strong">{fmtMoney(weightedForecast)}₮</p>
                        </div>
                        <div className="text-right">
                            <p className="text-[10px] uppercase tracking-wide text-muted-foreground/70">Хаасан</p>
                            <p className="text-sm font-semibold text-status-success">{fmtMoney(wonValue)}₮</p>
                        </div>
                    </div>
                </div>

                {/* Truncation анхааруулга — 1000-аас олон лийдтэй бол самбар бүгдийг
                    харуулахгүй тул forecast/тоо дутуу болохыг мэдэгдэнэ. */}
                {total > leads.length && (
                    <div className="flex items-center gap-1.5 mt-3 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-status-danger-soft text-status-danger">
                        <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
                        Нийт {total} лийдээс эхний {leads.length} харагдаж байна — таамаг/тоо дутуу. Шүүлтүүрээр багасгана уу.
                    </div>
                )}

                {/* Hygiene анхааруулга */}
                {(stalledCount > 0 || noStepCount > 0) && (
                    <div className="flex items-center gap-3 mt-3 flex-wrap">
                        {stalledCount > 0 && (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-status-danger-soft text-status-danger">
                                <AlertTriangle className="w-3.5 h-3.5" />
                                {stalledCount} зогссон лийд
                            </span>
                        )}
                        {noStepCount > 0 && (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-status-pending-soft text-status-pending">
                                <Clock className="w-3.5 h-3.5" />
                                {noStepCount} дараагийн алхамгүй
                            </span>
                        )}
                    </div>
                )}
            </div>

            <div className="p-4 overflow-x-auto">
                <div className="flex gap-3" style={{ minWidth: `${PIPELINE_STAGES.length * 260}px` }}>
                    {PIPELINE_STAGES.map(stage => {
                        const stageLeads = leads.filter(l => l.status === stage.key);
                        const stageValue = stageLeads.reduce((s, l) => s + leadValue(l), 0);
                        return (
                            <div
                                key={stage.key}
                                onDrop={e => handleDrop(e, stage.key)}
                                onDragOver={handleDragOver}
                                className={`flex-1 min-w-[240px] rounded-xl border p-3 ${stage.bg} transition-all ${draggingId ? 'ring-2 ring-violet-300 ring-opacity-50' : ''}`}
                            >
                                <div className="flex items-center gap-2 mb-3">
                                    <div className={`w-3 h-3 rounded-full ${stage.color}`} />
                                    <span className="text-sm font-semibold text-foreground">{stage.label}</span>
                                    <span className="text-xs text-muted-foreground/70 ml-auto">{stageLeads.length}</span>
                                </div>
                                {stageValue > 0 && (
                                    <p className="text-[11px] text-muted-foreground -mt-2 mb-2 flex items-center gap-0.5">
                                        <DollarSign className="w-3 h-3" />{fmtMoney(stageValue)}₮
                                    </p>
                                )}

                                <div className="space-y-2 min-h-[100px]">
                                    {stageLeads.map(lead => {
                                        const stalled = isStalled(lead, now);
                                        const overdue = isOverdue(lead, now);
                                        const days = daysInStage(lead, now);
                                        return (
                                            <div
                                                key={lead.id}
                                                draggable
                                                onDragStart={e => handleDragStart(e, lead.id)}
                                                className={`bg-surface rounded-lg p-3 border cursor-grab active:cursor-grabbing hover:shadow-md transition-all ${draggingId === lead.id ? 'opacity-50 scale-95' : ''} ${stalled ? 'border-status-danger/50 ring-1 ring-status-danger/20' : 'border-border'}`}
                                            >
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
                                                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${urgencyColors[lead.urgency] || urgencyColors.normal}`}>
                                                            {lead.urgency === 'urgent' ? '🔥' : lead.urgency === 'flexible' ? '🟢' : '⚪'} {lead.urgency}
                                                        </span>
                                                    )}
                                                    {(lead.budget_min || lead.budget_max) && (
                                                        <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                                                            <DollarSign className="w-2.5 h-2.5" />
                                                            {formatBudget(lead.budget_min, lead.budget_max)}
                                                        </span>
                                                    )}
                                                    {/* Шатанд байсан хугацаа — зогссон бол улаан */}
                                                    {!isClosed(lead.status) && (
                                                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium inline-flex items-center gap-0.5 ${stalled ? 'bg-status-danger-soft text-status-danger' : 'bg-surface-2 text-muted-foreground/80'}`}>
                                                            <Clock className="w-2.5 h-2.5" />{days}х
                                                        </span>
                                                    )}
                                                </div>

                                                {/* closed_lost дээр алдсан шалтгаан */}
                                                {lead.status === 'closed_lost' && lead.lost_reason && (
                                                    <p className="text-[10px] text-muted-foreground mt-1.5">❌ {lead.lost_reason}</p>
                                                )}

                                                {/* Дараагийн алхам / overdue / алхамгүй */}
                                                {lead.next_followup_at ? (
                                                    <p className={`text-[10px] mt-1.5 flex items-center gap-1 ${overdue ? 'text-status-danger font-medium' : 'text-brand-strong'}`}>
                                                        <Calendar className="w-3 h-3" />
                                                        {overdue ? 'Хугацаа хэтэрсэн: ' : 'Follow-up: '}{formatShortDate(lead.next_followup_at)}
                                                    </p>
                                                ) : !isClosed(lead.status) && (
                                                    <p className="text-[10px] mt-1.5 flex items-center gap-1 text-status-pending">
                                                        <AlertTriangle className="w-3 h-3" />
                                                        Дараагийн алхамгүй
                                                    </p>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* Алдсан шалтгааны modal */}
            {lostModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setLostModal(null)}>
                    <div className="bg-surface rounded-xl shadow-xl border border-border w-full max-w-sm p-5" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-between mb-1">
                            <h2 className="text-base font-semibold text-foreground">Яагаад алдсан бэ?</h2>
                            <button onClick={() => setLostModal(null)} className="p-1 hover:bg-surface-2 rounded-lg">
                                <X className="w-4 h-4 text-muted-foreground" />
                            </button>
                        </div>
                        <p className="text-xs text-muted-foreground mb-4">{lostModal.name} — шалтгааныг сонгоно уу</p>
                        <div className="space-y-1.5">
                            {LOST_REASONS.map(reason => (
                                <button
                                    key={reason}
                                    onClick={() => { moveToStage(lostModal.leadId, 'closed_lost', reason); setLostModal(null); }}
                                    className="w-full text-left px-3 py-2 rounded-lg text-sm text-foreground hover:bg-surface-2 border border-border transition-colors"
                                >
                                    {reason}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import { GripVertical, User, Phone, Calendar, DollarSign, ArrowLeft, Loader2 } from 'lucide-react';
import Link from 'next/link';

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
    created_at: string;
}

const PIPELINE_STAGES = [
    { key: 'new', label: 'Шинэ', color: 'bg-status-info', bg: 'bg-status-info-soft border-status-info/30' },
    { key: 'contacted', label: 'Холбогдсон', color: 'bg-status-pending', bg: 'bg-status-pending-soft border-yellow-200' },
    { key: 'viewing_scheduled', label: 'Үзлэг товлосон', color: 'bg-brand', bg: 'bg-brand-soft border-brand' },
    { key: 'offered', label: 'Санал илгээсэн', color: 'bg-status-pending', bg: 'bg-status-pending-soft border-orange-200' },
    { key: 'negotiating', label: 'Хэлэлцэж байна', color: 'bg-status-info', bg: 'bg-status-info-soft border-indigo-200' },
    { key: 'closed_won', label: '✅ Амжилттай', color: 'bg-status-success', bg: 'bg-status-success-soft border-status-success/30' },
    { key: 'closed_lost', label: '❌ Алдсан', color: 'bg-surface-2', bg: 'bg-surface-2/40 border-border' },
];

const urgencyColors: Record<string, string> = {
    urgent: 'bg-status-danger-soft text-status-danger',
    normal: 'bg-surface-2 text-muted-foreground',
    flexible: 'bg-status-success-soft text-status-success',
};

const formatBudget = (min: number | null, max: number | null) => {
    const fmt = (n: number) => n >= 1e9 ? `${(n / 1e9).toFixed(1)}B` : n >= 1e6 ? `${(n / 1e6).toFixed(0)}M` : n.toLocaleString();
    if (min && max) return `${fmt(min)}-${fmt(max)}₮`;
    if (min) return `${fmt(min)}₮+`;
    return '';
};

export default function PipelinePage() {
    const { shop } = useAuth();
    const [leads, setLeads] = useState<Lead[]>([]);
    const [loading, setLoading] = useState(true);
    const [draggingId, setDraggingId] = useState<string | null>(null);

    useEffect(() => {
        if (!shop?.id) return;
        fetchLeads();
    }, [shop?.id]);

    async function fetchLeads() {
        if (!shop?.id) return;
        setLoading(true);
        const { data, error } = await supabase
            .from('leads')
            .select('id, customer_name, customer_phone, status, source, budget_min, budget_max, preferred_type, urgency, next_followup_at, created_at')
            .eq('shop_id', shop.id)
            .order('created_at', { ascending: false });

        if (error) { toast.error('Лийд татахад алдаа'); return; }
        setLeads(data || []);
        setLoading(false);
    }

    async function moveToStage(leadId: string, newStatus: string) {
        const { error } = await supabase
            .from('leads')
            .update({ status: newStatus, updated_at: new Date().toISOString() })
            .eq('id', leadId);

        if (error) { toast.error('Статус солиход алдаа'); return; }
        setLeads(prev => prev.map(l => l.id === leadId ? { ...l, status: newStatus } : l));
        toast.success('Статус солигдлоо');
    }

    const handleDragStart = (e: React.DragEvent, leadId: string) => {
        e.dataTransfer.setData('leadId', leadId);
        setDraggingId(leadId);
    };

    const handleDrop = (e: React.DragEvent, stageKey: string) => {
        e.preventDefault();
        const leadId = e.dataTransfer.getData('leadId');
        if (leadId) moveToStage(leadId, stageKey);
        setDraggingId(null);
    };

    const handleDragOver = (e: React.DragEvent) => e.preventDefault();

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
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <Link href="/dashboard/leads" className="p-2 hover:bg-surface-2 rounded-lg">
                            <ArrowLeft className="w-5 h-5 text-muted-foreground" />
                        </Link>
                        <div>
                            <h1 className="text-xl font-semibold text-foreground">Pipeline</h1>
                            <p className="text-xs text-muted-foreground">{leads.length} лийд • Чирж зөөнө үү</p>
                        </div>
                    </div>
                    <div className="flex gap-2">
                        {PIPELINE_STAGES.slice(0, -2).map(s => {
                            const count = leads.filter(l => l.status === s.key).length;
                            return (
                                <div key={s.key} className="text-center">
                                    <div className={`w-8 h-8 rounded-full ${s.color} text-white text-sm font-bold flex items-center justify-center`}>
                                        {count}
                                    </div>
                                    <p className="text-[10px] text-muted-foreground/70 mt-0.5">{s.label.substring(0, 6)}</p>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>

            <div className="p-4 overflow-x-auto">
                <div className="flex gap-3" style={{ minWidth: `${PIPELINE_STAGES.length * 260}px` }}>
                    {PIPELINE_STAGES.map(stage => {
                        const stageLeads = leads.filter(l => l.status === stage.key);
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

                                <div className="space-y-2 min-h-[100px]">
                                    {stageLeads.map(lead => (
                                        <div
                                            key={lead.id}
                                            draggable
                                            onDragStart={e => handleDragStart(e, lead.id)}
                                            className={`bg-surface rounded-lg p-3 border border-border cursor-grab active:cursor-grabbing hover:shadow-md transition-all ${draggingId === lead.id ? 'opacity-50 scale-95' : ''}`}
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
                                            </div>

                                            {lead.next_followup_at && (
                                                <p className="text-[10px] text-brand-strong mt-1.5 flex items-center gap-1">
                                                    <Calendar className="w-3 h-3" />
                                                    Follow-up: {new Date(lead.next_followup_at).toLocaleDateString('mn-MN')}
                                                </p>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}

'use client';

/**
 * AI Orchestrator-ийн санал болгосон үйлдлийн харилцан-ярианы доторх ХУРААНГУЙ тэмдэглэл.
 * Баталгаажуулах/цуцлах гол UI нь ActionConfirmModal попап цонхонд байна.
 * - pending  → дарж попап нээх "Баталгаажуулах" pill
 * - running  → гүйцэтгэж буй индикатор
 * - done/cancelled/error → үр дүнгийн мөр
 */

import React from 'react';
import { Loader2, ShieldAlert, ShieldCheck, CheckCircle2, XCircle, ChevronRight, Clock } from 'lucide-react';
import { getRiskTier } from '@/lib/ai/riskTiers';

export interface PendingActionUI {
    id: string;
    tool: string;
    args: Record<string, unknown>;
    label: string;
    preview: Record<string, unknown>;
    agentName: string;
    emoji: string;
    status?: 'pending' | 'running' | 'done' | 'cancelled' | 'error';
    resultMessage?: string;
    /** "Энэ session-д үргэлж зөвшөөрөх"-ээр попапгүйгээр автоматаар гүйцэтгэсэн эсэх. */
    autoApproved?: boolean;
}

interface Props {
    action: PendingActionUI;
    /** pending pill дарахад баталгаажуулах попапыг (дахин) нээнэ. */
    onReopen: (action: PendingActionUI) => void;
}

export function ActionConfirmCard({ action, onReopen }: Props) {
    const status = action.status || 'pending';

    // Авто-зөвшөөрсөн үйлдэл: баталгаажуулах товч огт харуулахгүй — шууд гүйцэтгэлийн индикатор.
    if (action.autoApproved && (status === 'pending' || status === 'running')) {
        return (
            <div className="mt-2 flex items-center gap-2 text-sm text-foreground/80 bg-surface-2/60 border border-border/60 rounded-xl px-3 py-2">
                <Loader2 className="w-4 h-4 flex-shrink-0 animate-spin text-brand" />
                <span>Автоматаар гүйцэтгэж байна: {action.label}</span>
                <ShieldCheck className="w-3.5 h-3.5 ml-auto text-muted-foreground flex-shrink-0" />
            </div>
        );
    }

    if (status === 'done') {
        return (
            <div className="mt-2 flex items-center gap-2 text-sm text-status-success bg-status-success-soft border border-status-success/30 rounded-xl px-3 py-2">
                <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
                <span>{action.resultMessage || `Гүйцэтгэлээ: ${action.label}`}</span>
                {action.autoApproved && (
                    <span className="ml-auto inline-flex items-center gap-1 text-[11px] text-muted-foreground bg-surface-2 rounded-full px-2 py-0.5 flex-shrink-0">
                        <ShieldCheck className="w-3 h-3" /> Автоматаар зөвшөөрсөн
                    </span>
                )}
            </div>
        );
    }
    if (status === 'cancelled') {
        return (
            <div className="mt-2 flex items-center gap-2 text-sm text-muted-foreground bg-surface-2/60 border border-border/60 rounded-xl px-3 py-2">
                <XCircle className="w-4 h-4 flex-shrink-0" />
                <span>Цуцлагдсан: {action.label}</span>
            </div>
        );
    }
    if (status === 'error') {
        return (
            <div className="mt-2 flex items-center gap-2 text-sm text-status-danger bg-status-danger-soft border border-status-danger/30 rounded-xl px-3 py-2">
                <XCircle className="w-4 h-4 flex-shrink-0" />
                <span>{action.resultMessage || `Алдаа: ${action.label}`}</span>
            </div>
        );
    }
    if (status === 'running') {
        return (
            <div className="mt-2 flex items-center gap-2 text-sm text-foreground/80 bg-surface-2/60 border border-border/60 rounded-xl px-3 py-2">
                <Loader2 className="w-4 h-4 flex-shrink-0 animate-spin text-brand" />
                <span>Гүйцэтгэж байна: {action.label}</span>
            </div>
        );
    }

    // pending → дарахад баталгаажуулах попап нээгдэнэ
    const tier = getRiskTier(action.tool);
    const isDelete = tier === 'danger';
    const isAdmin = tier === 'admin';
    const accentCls = isDelete
        ? 'border-status-danger/30 bg-status-danger-soft'
        : isAdmin
            ? 'border-status-pending/40 bg-status-pending-soft'
            : 'border-brand/30 bg-brand-soft/40';

    return (
        <button
            onClick={() => onReopen(action)}
            className={`mt-2 w-full flex items-center gap-2.5 text-left rounded-xl border ${accentCls} px-3 py-2.5 hover:shadow-sm transition group`}
        >
            {isDelete || isAdmin
                ? <ShieldAlert className="w-4 h-4 text-foreground/70 flex-shrink-0" />
                : <Clock className="w-4 h-4 text-brand flex-shrink-0" />}
            <div className="min-w-0">
                <p className="text-sm font-semibold text-foreground truncate">{action.label}</p>
                <p className="text-[11px] text-muted-foreground">Баталгаажуулалт хүлээгдэж байна — {action.agentName}</p>
            </div>
            <span className="ml-auto inline-flex items-center gap-1 text-xs font-medium text-brand-strong flex-shrink-0">
                Баталгаажуулах <ChevronRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
            </span>
        </button>
    );
}

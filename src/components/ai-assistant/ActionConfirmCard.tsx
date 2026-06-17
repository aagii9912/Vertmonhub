'use client';

/**
 * AI Orchestrator-ийн санал болгосон үйлдлийг хэрэглэгчээр баталгаажуулах карт.
 * Зөвшөөрөх → бодит үйлдлийг /api/ai-assistant/action гүйцэтгэнэ. Цуцлах → үл хийнэ.
 */

import React from 'react';
import { Check, X, Loader2, ShieldAlert, CheckCircle2, XCircle } from 'lucide-react';

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
}

interface Props {
    action: PendingActionUI;
    onApprove: (action: PendingActionUI) => void;
    onCancel: (action: PendingActionUI) => void;
}

const DELETE_TOOLS = ['delete_property', 'delete_lead'];
const ADMIN_TOOLS = ['invite_user', 'assign_role', 'create_role'];

export function ActionConfirmCard({ action, onApprove, onCancel }: Props) {
    const isDelete = DELETE_TOOLS.includes(action.tool);
    const isAdmin = ADMIN_TOOLS.includes(action.tool);
    const accent = isDelete ? 'rose' : isAdmin ? 'amber' : 'emerald';
    const accentCls = {
        rose: 'border-rose-300 bg-rose-50',
        amber: 'border-amber-300 bg-amber-50',
        emerald: 'border-status-success/30 bg-status-success-soft',
    }[accent];

    const status = action.status || 'pending';

    if (status === 'done') {
        return (
            <div className="mt-2 flex items-center gap-2 text-sm text-status-success bg-status-success-soft border border-status-success/30 rounded-xl px-3 py-2">
                <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
                <span>{action.resultMessage || `Гүйцэтгэлээ: ${action.label}`}</span>
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

    return (
        <div className={`mt-2 rounded-xl border ${accentCls} p-3`}>
            <div className="flex items-center gap-2 mb-2">
                {isDelete || isAdmin ? <ShieldAlert className="w-4 h-4 text-foreground/70" /> : <span>{action.emoji}</span>}
                <span className="text-sm font-semibold text-foreground">{action.label}</span>
                <span className="ml-auto text-[11px] text-muted-foreground">{action.agentName}</span>
            </div>

            <div className="rounded-lg bg-surface/70 border border-border/40 p-2 mb-3 space-y-0.5">
                {Object.entries(action.preview).map(([k, v]) => (
                    <div key={k} className="flex gap-2 text-xs">
                        <span className="text-muted-foreground min-w-[90px]">{k}:</span>
                        <span className="text-foreground font-medium break-all">{String(v)}</span>
                    </div>
                ))}
            </div>

            <div className="flex items-center gap-2">
                <button
                    onClick={() => onApprove(action)}
                    disabled={status === 'running'}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-status-success text-white text-xs font-medium hover:opacity-90 disabled:opacity-60 transition"
                >
                    {status === 'running' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                    Зөвшөөрөх
                </button>
                <button
                    onClick={() => onCancel(action)}
                    disabled={status === 'running'}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-surface border border-border text-muted-foreground text-xs font-medium hover:bg-surface-2 disabled:opacity-60 transition"
                >
                    <X className="w-3.5 h-3.5" />
                    Цуцлах
                </button>
            </div>
        </div>
    );
}

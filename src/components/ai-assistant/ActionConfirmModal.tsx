'use client';

/**
 * AI Orchestrator-ийн санал болгосон үйлдлийг баталгаажуулах ПОПАП цонх (Claude Code маягийн).
 * Зөвшөөрөх → /api/ai-assistant/action гүйцэтгэнэ. Цуцлах → үл хийнэ. Esc/дэвсгэр → түр хаана.
 * Олон үйлдэл хүлээгдэж байвал нэг нэгээр нь (queue) гаргана.
 */

import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Check, X, Loader2, ShieldAlert, Sparkles } from 'lucide-react';
import type { PendingActionUI } from './ActionConfirmCard';

const DELETE_TOOLS = ['delete_property', 'delete_lead', 'delete_viewing', 'delete_contract', 'delete_customer'];
const ADMIN_TOOLS = ['invite_user', 'assign_role', 'create_role'];

interface Props {
    action: PendingActionUI | null;
    queueIndex?: number;
    queueTotal?: number;
    onApprove: (action: PendingActionUI) => void;
    onCancel: (action: PendingActionUI) => void;
    onDismiss: (action: PendingActionUI) => void;
}

export function ActionConfirmModal({ action, queueIndex = 0, queueTotal = 1, onApprove, onCancel, onDismiss }: Props) {
    const open = !!action;
    const running = action?.status === 'running';
    const approveRef = useRef<HTMLButtonElement>(null);

    // Гар товчлуурууд (Enter=зөвшөөрөх, Esc=хаах). Хамгийн сүүлийн утгыг ref-ээр барина.
    const latest = useRef({ action, running, onApprove, onDismiss });
    latest.current = { action, running, onApprove, onDismiss };

    useEffect(() => {
        if (!open) return;
        const onKey = (e: KeyboardEvent) => {
            const { action: a, running: r, onApprove: ap, onDismiss: dm } = latest.current;
            if (!a || r) return;
            if (e.key === 'Escape') { e.preventDefault(); dm(a); }
            else if (e.key === 'Enter') { e.preventDefault(); ap(a); }
        };
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, [open]);

    // Нээлттэй үед хуудасны гүйлтийг түгжинэ.
    useEffect(() => {
        if (!open) return;
        const prev = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => { document.body.style.overflow = prev; };
    }, [open]);

    // Шинэ үйлдэл гарч ирэх бүрд "Зөвшөөрөх" товчид фокус өгнө.
    useEffect(() => { if (open) approveRef.current?.focus(); }, [open, action?.id]);

    if (!action || typeof document === 'undefined') return null;

    const isDelete = DELETE_TOOLS.includes(action.tool);
    const isAdmin = ADMIN_TOOLS.includes(action.tool);
    const tone = isDelete ? 'danger' : isAdmin ? 'admin' : 'safe';
    const toneRing = { danger: 'ring-rose-400/40', admin: 'ring-amber-400/40', safe: 'ring-brand/30' }[tone];
    const toneHeader = { danger: 'from-rose-500 to-rose-600', admin: 'from-amber-500 to-amber-600', safe: 'from-brand to-brand-strong' }[tone];
    const approveBtn = { danger: 'bg-rose-600 hover:bg-rose-700', admin: 'bg-amber-600 hover:bg-amber-700', safe: 'bg-status-success hover:opacity-90' }[tone];

    return createPortal(
        <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4">
            {/* Дэвсгэр */}
            <div
                className="absolute inset-0 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200"
                onClick={() => !running && onDismiss(action)}
            />
            {/* Цонх */}
            <div
                role="dialog"
                aria-modal="true"
                aria-label={action.label}
                className={`relative w-full sm:max-w-md bg-surface rounded-t-2xl sm:rounded-2xl shadow-2xl ring-1 ${toneRing} overflow-hidden animate-in fade-in zoom-in-95 slide-in-from-bottom-4 sm:slide-in-from-bottom-0 duration-200`}
            >
                {/* Толгой */}
                <div className={`px-5 py-4 bg-gradient-to-r ${toneHeader} text-white flex items-center gap-3`}>
                    <div className="w-9 h-9 rounded-xl bg-white/20 flex items-center justify-center flex-shrink-0">
                        {isDelete || isAdmin ? <ShieldAlert className="w-5 h-5" /> : <Sparkles className="w-5 h-5" />}
                    </div>
                    <div className="min-w-0">
                        <p className="text-[11px] uppercase tracking-wide text-white/80 font-medium">Баталгаажуулалт шаардлагатай</p>
                        <h3 className="text-sm font-semibold truncate">{action.label}</h3>
                    </div>
                    {queueTotal > 1 && (
                        <span className="ml-auto text-[11px] bg-white/20 rounded-full px-2 py-0.5 font-medium flex-shrink-0">
                            {queueIndex + 1}/{queueTotal}
                        </span>
                    )}
                </div>

                {/* Их бие */}
                <div className="px-5 py-4">
                    <div className="flex items-center gap-2 mb-3 text-xs text-muted-foreground">
                        <span>{action.emoji}</span>
                        <span>{action.agentName}</span>
                        <code className="ml-auto text-[10px] bg-surface-2 rounded px-1.5 py-0.5 text-muted-foreground">{action.tool}</code>
                    </div>

                    <div className="rounded-xl bg-surface-2/60 border border-border/50 divide-y divide-border/40">
                        {Object.entries(action.preview).map(([k, v]) => (
                            <div key={k} className="flex gap-3 px-3 py-2 text-xs">
                                <span className="text-muted-foreground min-w-[96px] flex-shrink-0">{k}</span>
                                <span className="text-foreground font-medium break-all">{String(v)}</span>
                            </div>
                        ))}
                    </div>

                    {(isDelete || isAdmin) && (
                        <div className={`mt-3 flex items-start gap-2 text-xs rounded-lg px-3 py-2 ${isDelete ? 'bg-rose-50 text-rose-700' : 'bg-amber-50 text-amber-700'}`}>
                            <ShieldAlert className="w-4 h-4 flex-shrink-0 mt-0.5" />
                            <span>{isDelete
                                ? 'Энэ үйлдэл өгөгдөл устгана. Үргэлжлүүлэхдээ итгэлтэй байна уу?'
                                : 'Энэ нь админ эрхийн өндөр ач холбогдолтой үйлдэл.'}</span>
                        </div>
                    )}
                </div>

                {/* Хөл */}
                <div className="px-5 py-4 bg-surface-2/40 border-t border-border/50 flex items-center gap-2">
                    <button
                        onClick={() => onCancel(action)}
                        disabled={running}
                        className="flex-1 inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-surface border border-border text-sm font-medium text-muted-foreground hover:bg-surface-2 disabled:opacity-60 transition"
                    >
                        <X className="w-4 h-4" /> Цуцлах
                    </button>
                    <button
                        ref={approveRef}
                        onClick={() => onApprove(action)}
                        disabled={running}
                        className={`flex-1 inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl text-white text-sm font-semibold disabled:opacity-70 transition ${approveBtn}`}
                    >
                        {running ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                        {running ? 'Гүйцэтгэж байна...' : 'Зөвшөөрөх'}
                    </button>
                </div>
                <div className="px-5 pb-3 -mt-1 text-center">
                    <span className="text-[10px] text-muted-foreground">Enter — Зөвшөөрөх · Esc — Хаах</span>
                </div>
            </div>
        </div>,
        document.body,
    );
}

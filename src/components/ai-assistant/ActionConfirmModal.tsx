'use client';

/**
 * AI Orchestrator-ийн санал болгосон үйлдлийг баталгаажуулах ПОПАП цонх (Claude Desktop маягийн).
 *
 * Radix Dialog primitive дээр угсарсан тул focus-trap, ARIA, Esc, scroll-lock-ыг үнэгүй авна.
 * Эрсдэлийн 3 түвшин:
 *   • safe   → Зөвшөөрөх / Энэ session-д үргэлж зөвшөөрөх / Татгалзах
 *   • danger → давхар-баталгаажуулалттай Устгах / Татгалзах (үргэлж зөвшөөрөх БАЙХГҮЙ)
 *   • admin  → давхар-баталгаажуулалттай Батлах / Татгалзах (үргэлж зөвшөөрөх БАЙХГҮЙ)
 * Зөвшөөрөх → /api/ai-assistant/action гүйцэтгэнэ. Esc/дэвсгэр → түр хаана (dismiss).
 * Олон үйлдэл хүлээгдэж байвал нэг нэгээр нь (queue) гаргана.
 */

import React, { useEffect, useRef, useState } from 'react';
import { Dialog as DialogPrimitive } from 'radix-ui';
import { Check, X, Loader2, ShieldAlert, ShieldCheck, Repeat } from 'lucide-react';
import { getRiskTier, canRememberTool } from '@/lib/ai/riskTiers';
import type { PendingActionUI } from './ActionConfirmCard';

interface Props {
    action: PendingActionUI | null;
    queueIndex?: number;
    queueTotal?: number;
    onApprove: (action: PendingActionUI) => void;
    /** "Энэ session-д үргэлж зөвшөөрөх" — цээжилж дараа нь одоогийнхыг мөн гүйцэтгэнэ. */
    onAllowAlways: (action: PendingActionUI) => void;
    onCancel: (action: PendingActionUI) => void;
    onDismiss: (action: PendingActionUI) => void;
}

const TONE = {
    safe: { chip: 'bg-brand-soft text-brand-strong', ring: 'ring-brand/20', primary: 'bg-status-success hover:opacity-90', Icon: ShieldCheck },
    danger: { chip: 'bg-status-danger-soft text-status-danger', ring: 'ring-status-danger/25', primary: 'bg-status-danger hover:opacity-90', Icon: ShieldAlert },
    admin: { chip: 'bg-status-pending-soft text-status-pending', ring: 'ring-status-pending/30', primary: 'bg-status-pending hover:opacity-90', Icon: ShieldAlert },
} as const;

export function ActionConfirmModal({ action, queueIndex = 0, queueTotal = 1, onApprove, onAllowAlways, onCancel, onDismiss }: Props) {
    const open = !!action;
    const running = action?.status === 'running';
    const approveRef = useRef<HTMLButtonElement>(null);
    const declineRef = useRef<HTMLButtonElement>(null);

    // Устгах/админд давхар баталгаажуулалт: эхний даралт "зэвсэглэнэ", 3 сек дотор дахин дарж гүйцэтгэнэ.
    const [armed, setArmed] = useState(false);
    const [armedFor, setArmedFor] = useState<string | undefined>(action?.id);
    const armTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    const tier = action ? getRiskTier(action.tool) : 'safe';
    const rememberable = action ? canRememberTool(action.tool) : false;
    const needsDoubleConfirm = tier === 'danger' || tier === 'admin';

    // Шинэ үйлдэл гарах бүрд armed төлөвийг render үед цэвэрлэнэ (setState-in-effect-ээс зайлсхийнэ).
    if (action?.id !== armedFor) {
        setArmedFor(action?.id);
        setArmed(false);
    }
    // Unmount дээр давхар-баталгаажуулалтын timer-ийг цэвэрлэнэ.
    useEffect(() => () => { if (armTimer.current) clearTimeout(armTimer.current); }, []);

    // Enter=Зөвшөөрөх (зөвхөн safe түвшинд, фокус товч дээр байхгүй үед — товчны native Enter-тэй давхцахгүй).
    const latest = useRef({ action, running, tier, onApprove });
    useEffect(() => { latest.current = { action, running, tier, onApprove }; });
    useEffect(() => {
        if (!open) return;
        const onKey = (e: KeyboardEvent) => {
            const { action: a, running: r, tier: t, onApprove: ap } = latest.current;
            if (!a || r || t !== 'safe') return;
            if (e.key === 'Enter' && (document.activeElement as HTMLElement)?.tagName !== 'BUTTON') {
                e.preventDefault();
                ap(a);
            }
        };
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, [open]);

    if (!action) return null;

    const t = TONE[tier];
    const primaryClick = () => {
        if (needsDoubleConfirm && !armed) {
            setArmed(true);
            if (armTimer.current) clearTimeout(armTimer.current);
            armTimer.current = setTimeout(() => setArmed(false), 3000);
            return;
        }
        if (armTimer.current) clearTimeout(armTimer.current);
        onApprove(action);
    };

    const primaryLabel = running
        ? 'Гүйцэтгэж байна...'
        : armed
            ? (tier === 'danger' ? 'Дахин дарж устгана уу' : 'Дахин дарж баталгаажуулна уу')
            : (tier === 'danger' ? 'Устгах' : tier === 'admin' ? 'Батлах' : 'Зөвшөөрөх');

    const preventCloseWhileRunning = (e: Event) => { if (running) e.preventDefault(); };

    return (
        <DialogPrimitive.Root open={open} onOpenChange={(o) => { if (!o && !running) onDismiss(action); }}>
            <DialogPrimitive.Portal>
                <DialogPrimitive.Overlay
                    className="fixed inset-0 z-[100] bg-black/50 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0"
                />
                <DialogPrimitive.Content
                    onEscapeKeyDown={preventCloseWhileRunning}
                    onPointerDownOutside={preventCloseWhileRunning}
                    onInteractOutside={preventCloseWhileRunning}
                    onOpenAutoFocus={(e) => { e.preventDefault(); (needsDoubleConfirm ? declineRef : approveRef).current?.focus(); }}
                    className={`fixed z-[100] inset-x-0 bottom-0 sm:inset-auto sm:top-1/2 sm:left-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2 w-full sm:max-w-md max-h-[90dvh] flex flex-col bg-surface rounded-t-2xl sm:rounded-2xl shadow-2xl ring-1 ${t.ring} overflow-hidden outline-none data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 data-[state=open]:slide-in-from-bottom-4 sm:data-[state=open]:slide-in-from-bottom-0 duration-200`}
                >
                    {/* Толгой — төвийг сахисан (Claude Desktop маягийн), өнгө нь зөвхөн эрсдэлийн icon chip дээр */}
                    <div className="flex items-center gap-3 px-5 py-4 border-b border-border flex-shrink-0">
                        <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${t.chip}`}>
                            <t.Icon className="w-5 h-5" />
                        </div>
                        <div className="min-w-0 flex-1">
                            <p className="text-[12px] text-muted-foreground">Зөвшөөрөл хүсэж байна</p>
                            <DialogPrimitive.Title className="text-[15px] font-semibold text-foreground truncate">
                                {action.label}
                            </DialogPrimitive.Title>
                        </div>
                        {queueTotal > 1 && (
                            <span className="text-[12px] tabular-nums text-muted-foreground bg-surface-2 rounded-full px-2 py-0.5 flex-shrink-0">
                                {queueIndex + 1}/{queueTotal}
                            </span>
                        )}
                    </div>

                    {/* Их бие — урт preview үед дотроо гүйнэ */}
                    <div className="px-5 py-4 overflow-y-auto flex-1">
                        <div className="flex items-center gap-2 mb-3 text-xs text-muted-foreground">
                            <span>{action.emoji}</span>
                            <span>{action.agentName}</span>
                            <code className="ml-auto font-mono text-[10px] bg-surface-2 border border-border rounded px-1.5 py-0.5 text-muted-foreground">{action.tool}</code>
                        </div>

                        <div className="rounded-xl bg-surface border border-border divide-y divide-border">
                            {Object.entries(action.preview).map(([k, v]) => (
                                <div key={k} className="flex gap-3 px-3 py-2 text-xs">
                                    <span className="text-muted-foreground min-w-[96px] flex-shrink-0">{k}</span>
                                    <span className="text-foreground font-medium break-all">{String(v)}</span>
                                </div>
                            ))}
                        </div>

                        {needsDoubleConfirm && (
                            <div role="note" className={`mt-3 flex items-start gap-2 text-xs rounded-lg px-3 py-2 ${tier === 'danger' ? 'bg-status-danger-soft text-status-danger' : 'bg-status-pending-soft text-status-pending'}`}>
                                <ShieldAlert className="w-4 h-4 flex-shrink-0 mt-0.5" />
                                <span>{tier === 'danger'
                                    ? 'Энэ үйлдэл өгөгдөл устгана. (Сэргээх боломжтой.)'
                                    : 'Энэ нь админ эрхийн өндөр ач холбогдолтой үйлдэл.'}</span>
                            </div>
                        )}
                    </div>

                    {/* Хөл — эрсдэлийн түвшнээр товчнууд (үргэлж харагдана) */}
                    <div className="px-5 pt-3 pb-4 flex flex-col gap-2 flex-shrink-0 border-t border-border">
                        <button
                            ref={approveRef}
                            onClick={primaryClick}
                            disabled={running}
                            className={`w-full inline-flex items-center justify-center gap-1.5 h-[42px] rounded-xl text-white text-sm font-semibold disabled:opacity-70 transition ${armed && needsDoubleConfirm ? `${t.primary} brightness-90` : t.primary}`}
                        >
                            {running ? <Loader2 className="w-4 h-4 animate-spin" /> : armed && needsDoubleConfirm ? <ShieldAlert className="w-4 h-4" /> : <Check className="w-4 h-4" />}
                            {primaryLabel}
                        </button>

                        {tier === 'safe' && rememberable && (
                            <button
                                onClick={() => onAllowAlways(action)}
                                disabled={running}
                                className="w-full flex flex-col items-center gap-0.5 rounded-xl bg-surface border border-border-strong px-4 py-2 text-foreground hover:bg-surface-2 disabled:opacity-60 transition"
                            >
                                <span className="inline-flex items-center gap-1.5 text-sm font-medium">
                                    <Repeat className="w-4 h-4" /> Энэ session-д үргэлж зөвшөөрөх
                                </span>
                                <span className="text-[11px] text-muted-foreground">
                                    <code className="font-mono">{action.tool}</code> үйлдлийг цаашид асуухгүй
                                </span>
                            </button>
                        )}

                        <button
                            ref={declineRef}
                            onClick={() => onCancel(action)}
                            disabled={running}
                            className="w-full inline-flex items-center justify-center gap-1.5 h-[42px] rounded-xl bg-transparent border border-border text-sm font-medium text-muted-foreground hover:bg-surface-2 disabled:opacity-60 transition"
                        >
                            <X className="w-4 h-4" /> Татгалзах
                        </button>

                        <p className="text-center text-[10px] text-muted-foreground mt-1">
                            {tier === 'safe' ? 'Enter — Зөвшөөрөх · Esc — Хаах' : 'Esc — Хаах'}
                        </p>
                    </div>

                    {/* Дэлгэц уншигчид зориулсан тайлбар (Radix Description шаардлага) */}
                    <DialogPrimitive.Description className="sr-only">
                        {action.agentName} agent {action.label} үйлдлийг санал болгож байна. Зөвшөөрөх эсвэл татгалзана уу.
                    </DialogPrimitive.Description>
                </DialogPrimitive.Content>
            </DialogPrimitive.Portal>
        </DialogPrimitive.Root>
    );
}

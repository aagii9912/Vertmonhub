'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Sparkles, Check, X, Loader2, AlertCircle, RotateCcw, ChevronDown, ChevronRight, ShieldCheck, Copy, CheckCheck, Users } from 'lucide-react';
import dynamic from 'next/dynamic';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { useAiContext, suggestionsFor, contextLabel } from '@/lib/ai/context';
import { streamAssistant, approveAssistantAction, type StreamEvent, type StreamDone } from '@/lib/ai/client';
import { addAllowedTool, isToolAllowed } from '@/lib/ai/allowedTools';
import { MarkdownMessage } from '@/components/ai-assistant/MarkdownMessage';
import { OrchestrationTrace } from '@/components/ai-assistant/OrchestrationTrace';
import { AiComposer, type AiAttachment } from './AiComposer';

/**
 * AI туслахын чат — панел ба бүтэн хуудас хоёулаа үүнийг ашиглана.
 *
 * Streaming: төлөвлөгөө → агент бүр (tool дуудлагатай) → нэгтгэл → токен.
 * Үйлдэл: mutating tool-ууд preview ирнэ → карт дээр Зөвшөөрөх / Болих /
 * Үргэлж зөвшөөрөх. Алдаа: ойлгомжтой мессеж + «Дахин оролдох».
 */

/** Үйлдэл батлагдсаны дараа AI-д далдаар илгээх үргэлжлүүлэх мессежийн угтвар (UI-д харагдахгүй, түүхэнд орно). */
export const CONTINUATION_PREFIX = '[Систем]';

export interface AiMessage {
    id: string;
    role: 'user' | 'assistant';
    content: string;
    /** Далд (системийн үргэлжлүүлэх) мессеж — рендер хийхгүй */
    hidden?: boolean;
    attachments?: { url: string; name: string; mimeType: string }[];
    chartConfig?: { type?: string; data?: { name: string; value: number }[] } | null;
    data?: unknown;
    agentsUsed?: StreamDone['agentsUsed'];
    trace?: unknown;
    pendingActions?: PendingAction[];
    /** Тодруулга (ask_user) — chip-ээр хариулна */
    clarification?: { question: string; options: string[] } | null;
    /** Явцын мөрүүд (tool дуудлага, дэд агент) — streaming үед ба дараа нь хураангуй */
    activity?: Activity[];
    status?: string | null;
    streaming?: boolean;
    error?: { message: string; retryable: boolean; request?: PendingRequest };
}

export interface PendingAction {
    id: string;
    tool: string;
    args: Record<string, unknown>;
    label: string;
    preview: Record<string, unknown>;
    agentName: string;
    status: 'pending' | 'running' | 'done' | 'cancelled' | 'error';
    resultMessage?: string;
    /** Серверийн бодит үр дүн (id-ууд) — үргэлжлүүлэх мессежид AI-д өгнө */
    result?: unknown;
    autoApproved?: boolean;
}

/** Чат дотор inline харагдах нэг ажил: tool дуудлага эсвэл дэд агентын алхам. */
export interface Activity {
    id: string;
    kind: 'tool' | 'agent';
    label: string;
    agentId?: string;
    status: 'run' | 'ok' | 'fail';
    summary?: string;
    latencyMs?: number;
}

interface PendingRequest {
    text: string;
    attachments: { url: string; name: string; mimeType: string }[];
}

const TOOL_LABEL: Record<string, string> = {
    delegate_to_specialists: 'Мэргэжилтнүүдэд хуваарилах', ask_user: 'Тодруулга',
    update_unit_status: 'Нэгжийн статус', delete_property: 'Байр устгах', delete_viewing: 'Уулзалт цуцлах', delete_customer: 'Харилцагч устгах', create_role: 'Дүр үүсгэх',
    get_dashboard_stats: 'Самбарын тоо', list_properties: 'Байр хайх', list_leads: 'Лид хайх', get_lead_details: 'Лидийн мэдээлэл',
    get_customer_insights: 'Харилцагчийн дүн', list_contracts: 'Гэрээ хайх', get_contract_details: 'Гэрээний мэдээлэл', get_contracts_summary: 'Гэрээний нэгтгэл',
    get_sales_summary: 'Борлуулалтын нэгтгэл', get_sales_forecast: 'Прогноз', compare_properties: 'Байр харьцуулах', get_marketing_summary: 'Маркетингийн нэгтгэл',
    get_marketing_budget_status: 'Төсвийн байдал', get_market_indicators: 'Зах зээлийн үзүүлэлт', update_lead_status: 'Лидийн статус', add_lead_note: 'Тэмдэглэл',
    schedule_viewing: 'Уулзалт товлох', create_lead: 'Лид үүсгэх', create_customer: 'Харилцагч үүсгэх', create_contract: 'Гэрээ үүсгэх', process_contract_action: 'Гэрээний үйлдэл',
    update_property_status: 'Байрны статус', update_property_price: 'Байрны үнэ', create_property: 'Байр үүсгэх', bulk_update_leads: 'Олон лид шинэчлэх', attach_file: 'Файл хавсаргах',
    remember_fact: 'Санах', create_social_post: 'Пост үүсгэх', delete_lead: 'Лид устгах', delete_contract: 'Гэрээ устгах', invite_user: 'Хэрэглэгч урих', assign_role: 'Эрх оноох',
};
const toolLabel = (t: string) => TOOL_LABEL[t] ?? t;

/** Түүхэнд илгээх агуулга: текст + гүйцэтгэсэн/цуцалсан үйлдлийн тэмдэглэл + тодруулга. */
function historyContent(m: AiMessage): string {
    const parts = [m.content];
    if (m.clarification && !m.content) parts.push(`(Тодруулга асуусан: ${m.clarification.question})`);
    const acts = (m.pendingActions || []).filter((a) => a.status !== 'pending' && a.status !== 'running');
    if (acts.length) parts.push('[Үйлдлийн төлөв: ' + acts.map((a) => `${a.label} — ${a.status === 'done' ? 'гүйцэтгэгдсэн' : a.status === 'cancelled' ? 'хэрэглэгч цуцалсан' : 'алдаа'}`).join('; ') + ']');
    return parts.filter(Boolean).join('\n');
}

function uid() { return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`; }

interface Props {
    compact?: boolean;
    className?: string;
    /** Гаднаас composer-т оруулах текст */
    prefill?: string | null;
    onPrefillConsumed?: () => void;
    /** Панел нээлттэй эсэх (autofocus-д) */
    active?: boolean;
    /** Бүтэн хуудас: түүхээс ачаалсан яриа */
    conversationId?: string | null;
    onConversationId?: (id: string | null) => void;
    initialMessages?: AiMessage[];
    messagesLoading?: boolean;
}

export function AiChat({ compact, className, prefill, onPrefillConsumed, active, conversationId: convProp, onConversationId, initialMessages, messagesLoading }: Props) {
    const { shop, user } = useAuth();
    const ctx = useAiContext();
    const [messages, setMessages] = useState<AiMessage[]>(initialMessages ?? []);
    const [conversationId, setConversationId] = useState<string | null>(convProp ?? null);
    const [busy, setBusy] = useState(false);
    const abortRef = useRef<AbortController | null>(null);
    const messagesRef = useRef<AiMessage[]>(messages);
    messagesRef.current = messages;
    const scrollRef = useRef<HTMLDivElement>(null);
    const firedRef = useRef<Set<string>>(new Set());

    // Бүтэн хуудас яриа солиход AiChat-ыг key-ээр дахин mount хийдэг тул
    // initialMessages / conversationId-г зөвхөн эхний render-д уншина.

    // Автомат гүйлгэлт
    useEffect(() => {
        const el = scrollRef.current;
        if (el) el.scrollTop = el.scrollHeight;
    }, [messages]);

    const update = useCallback((id: string, patch: Partial<AiMessage> | ((m: AiMessage) => AiMessage)) => {
        setMessages((prev) => prev.map((m) => (m.id === id ? (typeof patch === 'function' ? patch(m) : { ...m, ...patch }) : m)));
    }, []);

    const send = async (text: string, attachments: AiAttachment[] | PendingRequest['attachments'], opts?: { hidden?: boolean }) => {
        const atts = attachments.map((a) => ({ url: a.url!, name: a.name, mimeType: a.mimeType })).filter((a) => a.url);
        const content = text || (atts.length ? 'Хавсаргасан файлыг шинжилж туслаач.' : '');
        if (!content) return;
        const history = messagesRef.current.filter((m) => !m.error && (m.content || m.pendingActions?.length || m.clarification)).slice(-20).map((m) => ({ role: m.role, content: historyContent(m) }));
        const userMsg: AiMessage = { id: uid(), role: 'user', content, attachments: atts, hidden: opts?.hidden };
        const asstId = uid();
        setMessages((prev) => [...prev, userMsg, { id: asstId, role: 'assistant', content: '', streaming: true, activity: [], status: 'Бодож байна…' }]);
        setBusy(true);
        const controller = new AbortController();
        abortRef.current = controller;

        await streamAssistant(
            { message: content, shopId: shop?.id, conversationId, history, attachments: atts, context: ctx },
            {
                signal: controller.signal,
                onEvent: (e: StreamEvent) => {
                    switch (e.type) {
                        case 'status':
                            update(asstId, { status: e.text });
                            break;
                        case 'tool_start':
                            update(asstId, (m) => ({ ...m, status: null, activity: [...(m.activity || []), { id: e.id, kind: 'tool', label: toolLabel(e.tool), agentId: e.agentId, status: 'run' }] }));
                            break;
                        case 'tool_done':
                            update(asstId, (m) => ({ ...m, activity: (m.activity || []).map((a) => (a.id === e.id ? { ...a, status: e.ok ? 'ok' : 'fail', summary: e.summary, latencyMs: e.latencyMs } : a)) }));
                            break;
                        case 'step_start':
                            update(asstId, (m) => ({ ...m, status: null, activity: [...(m.activity || []), { id: `agent:${e.agentId}`, kind: 'agent', label: e.agentName, agentId: e.agentId, status: 'run', summary: e.task }] }));
                            break;
                        case 'step_done':
                            update(asstId, (m) => ({ ...m, activity: (m.activity || []).map((a) => (a.id === `agent:${e.agentId}` ? { ...a, status: e.ok ? 'ok' : 'fail', latencyMs: e.latencyMs, summary: e.ok ? (e.toolsUsed.length ? `${e.toolsUsed.length} хайлт` : a.summary) : (e.error || 'Алдаа') } : a)) }));
                            break;
                        case 'token':
                            update(asstId, (m) => ({ ...m, status: null, content: m.content + e.text }));
                            break;
                        case 'token_reset':
                            update(asstId, { content: '' });
                            break;
                        case 'clarify':
                            update(asstId, { status: null, clarification: { question: e.question, options: e.options } });
                            break;
                        case 'done': {
                            const actions: PendingAction[] = (e.pendingActions || []).map((a) => ({ ...a, status: 'pending', autoApproved: shop?.id ? isToolAllowed(shop.id, a.tool, user?.id) : false }));
                            update(asstId, (m) => ({ ...m, content: e.response || m.content, streaming: false, status: null, activity: (m.activity || []).map((a) => (a.status === 'run' ? { ...a, status: 'ok' } : a)), chartConfig: e.chartConfig as AiMessage['chartConfig'], data: e.data, agentsUsed: e.agentsUsed, trace: e.trace, pendingActions: actions, clarification: e.clarification ?? m.clarification ?? null }));
                            if (e.conversationId && e.conversationId !== conversationId) { setConversationId(e.conversationId); onConversationId?.(e.conversationId); }
                            break;
                        }
                        case 'error':
                            update(asstId, (m) => ({ ...m, streaming: false, status: null, error: { message: e.message, retryable: e.retryable !== false, request: { text: content, attachments: atts } } }));
                            break;
                    }
                },
            },
        );
        setBusy(false);
        abortRef.current = null;
    };

    const stop = () => abortRef.current?.abort();

    const retry = (m: AiMessage) => {
        const req = m.error?.request;
        if (!req) return;
        // Шүүсэн жагсаалтаа шууд ref-д тавина — state closure хоцорч алдсан user turn 2 удаа явдаг байв
        const idx = messages.indexOf(m);
        const next = messages.filter((x, i) => x.id !== m.id && !(x.role === 'user' && x.content === req.text && i === idx - 1));
        setMessages(next);
        messagesRef.current = next;
        void send(req.text, req.attachments);
    };

    /* ---------- үйлдэл ---------- */
    const setAction = (id: string, patch: Partial<PendingAction>) =>
        setMessages((prev) => prev.map((m) => (m.pendingActions ? { ...m, pendingActions: m.pendingActions.map((a) => (a.id === id ? { ...a, ...patch } : a)) } : m)));

    const continuationTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    /**
     * Бүх карт шийдэгдсэн (pending үлдээгүй) бөгөөд ≥1 гүйцэтгэгдсэн бол AI-д далд мессежээр
     * үр дүнг (шинэ id-тай) өгч үргэлжлүүлнэ — «лид үүсгэ → уулзалт товло» маягийн олон
     * алхамт даалгаврын дараагийн алхмыг зөв id-тай санал болгоно.
     */
    const scheduleContinuation = useCallback((msgId: string) => {
        if (continuationTimer.current) clearTimeout(continuationTimer.current);
        continuationTimer.current = setTimeout(() => {
            const m = messagesRef.current.find((x) => x.id === msgId);
            const acts = m?.pendingActions || [];
            if (!acts.length || acts.some((a) => a.status === 'pending' || a.status === 'running')) return;
            const done = acts.filter((a) => a.status === 'done');
            if (!done.length) return;
            const lines = done.map((a) => `- ${a.label}: ${a.resultMessage || 'гүйцэтгэгдлээ'}${a.result ? ` ${JSON.stringify(a.result).slice(0, 400)}` : ''}`).join('\n');
            const skipped = acts.filter((a) => a.status !== 'done').map((a) => a.label);
            void send(`${CONTINUATION_PREFIX} Хэрэглэгч дараах үйлдлийг баталж, гүйцэтгэгдлээ:\n${lines}${skipped.length ? `\nЦуцалсан/алдаатай: ${skipped.join(', ')}` : ''}\nХэрэглэгчийн анхны хүсэлтэд ҮЛДСЭН алхам байвал одоо шинэ id-г ашиглаад үргэлжлүүл (tool дууд). Үлдсэн алхам байхгүй бол НЭГ өгүүлбэрээр товч баталгаажуулж (жишээ: «Тэмдэглэл нэмэгдлээ.») дуусга.`, [], { hidden: true });
        }, 400);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const approve = useCallback(async (a: PendingAction) => {
        setAction(a.id, { status: 'running' });
        const r = await approveAssistantAction({ shopId: shop?.id, tool: a.tool, args: a.args, conversationId });
        if (r.ok) { setAction(a.id, { status: 'done', resultMessage: r.message, result: r.result }); toast.success(r.message); }
        else { setAction(a.id, { status: 'error', resultMessage: r.message, autoApproved: false }); toast.error(r.message); }
        const owner = messagesRef.current.find((m) => m.pendingActions?.some((x) => x.id === a.id));
        if (owner) scheduleContinuation(owner.id);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [shop?.id, conversationId, scheduleContinuation]);

    const approveAll = async (ids: string[]) => {
        const all = messages.flatMap((m) => m.pendingActions || []).filter((a) => ids.includes(a.id) && a.status === 'pending');
        for (const a of all) await approve(a);
    };

    const allowAlways = (a: PendingAction) => {
        if (shop?.id) addAllowedTool(shop.id, a.tool, user?.id);
        setMessages((prev) => prev.map((m) => (m.pendingActions ? { ...m, pendingActions: m.pendingActions.map((x) => (x.id !== a.id && x.status === 'pending' && x.tool === a.tool ? { ...x, autoApproved: true } : x)) } : m)));
        void approve(a);
    };

    // Цээжилсэн (үргэлж зөвшөөрсөн) tool-ыг автоматаар гүйцэтгэнэ — нэг л удаа.
    useEffect(() => {
        for (const a of messages.flatMap((m) => m.pendingActions || [])) {
            if (a.status === 'pending' && a.autoApproved && !firedRef.current.has(a.id)) { firedRef.current.add(a.id); void approve(a); }
        }
    }, [messages, approve]);

    const suggestions = useMemo(() => suggestionsFor(ctx), [ctx]);
    const empty = messages.length === 0 && !messagesLoading;

    return (
        <div className={cn('flex min-h-0 flex-col', className)}>
            <div ref={scrollRef} className={cn('min-h-0 flex-1 overflow-y-auto', compact ? 'px-3.5 py-3' : 'px-4 py-5 md:px-8')}>
                <div className={cn('mx-auto flex flex-col gap-4', !compact && 'max-w-3xl')}>
                    {messagesLoading && <div className="flex items-center gap-2 py-8 text-[12.5px] text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Яриа ачаалж байна…</div>}
                    {empty && (
                        <div className={cn('flex flex-col', compact ? 'gap-3 pt-2' : 'items-center gap-4 py-10 text-center')}>
                            <span className="flex h-9 w-9 items-center justify-center rounded-md bg-brand-soft text-brand"><Sparkles className="h-4.5 w-4.5" /></span>
                            <div>
                                <div className="text-[14px] font-semibold text-foreground">{ctx ? `${contextLabel(ctx)} — юугаар туслах вэ?` : 'Юугаар туслах вэ?'}</div>
                                <p className="mt-1 text-[12.5px] text-muted-foreground">Өгөгдөл асуух, дүгнэлт авах, лид/уулзалт/гэрээний үйлдлийг чатаар хийлгэх. Үйлдэл бүрийг та батална.</p>
                            </div>
                            <div className={cn('flex flex-wrap gap-1.5', !compact && 'justify-center')}>
                                {suggestions.map((s) => (
                                    <button key={s.label} type="button" onClick={() => (s.prompt.endsWith(': ') ? onPrefillConsumed && (window.dispatchEvent(new CustomEvent('vertmon:ai-prefill', { detail: s.prompt }))) : void send(s.prompt, []))} className="h-[28px] rounded-md border border-border bg-surface px-2.5 text-[12.5px] text-fg-2 transition-colors hover:border-brand hover:bg-brand-soft hover:text-brand focus-ring">
                                        {s.label}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}

                    {messages.map((m) => (m.role === 'user' ? ((m.hidden || m.content.startsWith(CONTINUATION_PREFIX)) ? null : <UserBubble key={m.id} m={m} />) : <AssistantBlock key={m.id} m={m} compact={!!compact} busy={busy} onRetry={() => retry(m)} onApprove={approve} onApproveAll={approveAll} onCancel={(a) => { setAction(a.id, { status: 'cancelled' }); const owner = messagesRef.current.find((x) => x.pendingActions?.some((y) => y.id === a.id)); if (owner) scheduleContinuation(owner.id); }} onAlways={allowAlways} onClarify={(t) => void send(t, [])} />))}
                </div>
            </div>

            <div className={cn('shrink-0 border-t border-border bg-surface', compact ? 'p-3' : 'px-4 py-3 md:px-8')}>
                <div className={cn(!compact && 'mx-auto max-w-3xl')}>
                    {!empty && suggestions.length > 0 && !busy && (
                        <div className="mb-2 flex gap-1.5 overflow-x-auto no-scrollbar">
                            {suggestions.slice(0, 3).map((s) => (
                                <button key={s.label} type="button" onClick={() => void send(s.prompt, [])} className="h-[24px] shrink-0 rounded-md border border-border px-2 text-[11.5px] text-fg-2 hover:border-brand hover:text-brand">{s.label}</button>
                            ))}
                        </div>
                    )}
                    <PrefillBridge prefill={prefill} onPrefillConsumed={onPrefillConsumed}>
                        {(pf, consumed) => <AiComposer busy={busy} onSend={(t, a) => void send(t, a)} onStop={stop} prefill={pf} onPrefillConsumed={consumed} autoFocus={active} compact={compact} />}
                    </PrefillBridge>
                    <div className="mt-1.5 flex items-center justify-between text-[10.5px] text-muted-foreground">
                        <span>Enter — илгээх · Shift+Enter — мөр</span>
                        <span className="inline-flex items-center gap-1"><ShieldCheck className="h-3 w-3" /> Үйлдлийг та батална</span>
                    </div>
                </div>
            </div>
        </div>
    );
}

/** Гаднаас (панел / санал) ирэх prefill-ийг composer-т дамжуулна. */
function PrefillBridge({ prefill, onPrefillConsumed, children }: { prefill?: string | null; onPrefillConsumed?: () => void; children: (pf: string | null, consumed: () => void) => React.ReactNode }) {
    const [local, setLocal] = useState<string | null>(null);
    useEffect(() => {
        const fn = (e: Event) => setLocal((e as CustomEvent<string>).detail);
        window.addEventListener('vertmon:ai-prefill', fn);
        return () => window.removeEventListener('vertmon:ai-prefill', fn);
    }, []);
    const pf = prefill ?? local;
    return <>{children(pf, () => { setLocal(null); onPrefillConsumed?.(); })}</>;
}

/* ------------------------------------------------------------------ */

function UserBubble({ m }: { m: AiMessage }) {
    return (
        <div className="flex justify-end">
            <div className="max-w-[85%] rounded-md bg-brand px-3 py-2 text-[13px] leading-relaxed text-brand-fg">
                {m.content}
                {m.attachments && m.attachments.length > 0 && (
                    <div className="mt-1.5 flex flex-wrap gap-1">
                        {m.attachments.map((a) => <span key={a.url} className="rounded bg-white/15 px-1.5 py-0.5 text-[11px]">{a.name}</span>)}
                    </div>
                )}
            </div>
        </div>
    );
}

function AssistantBlock({ m, compact, busy, onRetry, onApprove, onApproveAll, onCancel, onAlways, onClarify }: { m: AiMessage; compact: boolean; busy: boolean; onRetry: () => void; onApprove: (a: PendingAction) => void; onApproveAll: (ids: string[]) => void; onCancel: (a: PendingAction) => void; onAlways: (a: PendingAction) => void; onClarify: (text: string) => void }) {
    const [showTrace, setShowTrace] = useState(false);
    const copy = () => { void navigator.clipboard?.writeText(m.content); toast.success('Хуулагдлаа'); };
    const pending = (m.pendingActions || []).filter((a) => a.status === 'pending');
    const isLast = !busy;

    return (
        <div className="flex gap-2.5">
            <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-brand-soft text-brand"><Sparkles className="h-3.5 w-3.5" /></span>
            <div className="min-w-0 flex-1">
                {(m.activity?.length || m.status) ? <ActivityView items={m.activity || []} status={m.status} streaming={!!m.streaming} /> : null}
                {m.error ? (
                    <div className="rounded-md border border-status-danger/30 bg-status-danger-soft px-3 py-2 text-[12.5px] text-status-danger">
                        <div className="flex items-start gap-2"><AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" /><span>{m.error.message}</span></div>
                        {m.error.retryable && <button type="button" onClick={onRetry} className="mt-2 inline-flex h-7 items-center gap-1.5 rounded-md border border-status-danger/40 bg-surface px-2 text-[12px] font-medium text-status-danger hover:bg-status-danger-soft"><RotateCcw className="h-3.5 w-3.5" /> Дахин оролдох</button>}
                    </div>
                ) : (
                    <>
                        {m.content ? (
                            <div className={cn('group/msg relative text-[13px] leading-relaxed text-foreground', m.streaming && 'after:ml-0.5 after:inline-block after:h-3.5 after:w-1.5 after:animate-pulse after:bg-brand after:align-middle')}>
                                <MarkdownMessage content={m.content} />
                                {!m.streaming && (
                                    <button type="button" onClick={copy} className="invisible absolute -right-1 top-0 flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-surface-2 group-hover/msg:visible" aria-label="Хуулах"><Copy className="h-3 w-3" /></button>
                                )}
                            </div>
                        ) : m.streaming && !m.activity?.length && !m.status ? (
                            <div className="flex items-center gap-2 text-[12.5px] text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Холбогдож байна…</div>
                        ) : null}
                        {m.clarification && (
                            <div className="mt-2 rounded-md border border-brand/30 bg-brand-soft/40 px-3 py-2">
                                <div className="text-[13px] font-medium text-foreground">{m.clarification.question}</div>
                                {m.clarification.options.length > 0 && (
                                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                                        {m.clarification.options.map((o) => (
                                            <button key={o} type="button" disabled={!isLast} onClick={() => onClarify(o)} className="h-[28px] rounded-md border border-border bg-surface px-2.5 text-[12.5px] text-foreground transition-colors hover:border-brand hover:text-brand disabled:opacity-50 focus-ring">{o}</button>
                                        ))}
                                    </div>
                                )}
                                <div className="mt-1 text-[11px] text-muted-foreground">Эсвэл доор бичээд хариулна уу.</div>
                            </div>
                        )}
                        {m.chartConfig?.data && m.chartConfig.data.length > 0 && <ChartBlock cfg={m.chartConfig} compact={compact} />}
                        {m.pendingActions && m.pendingActions.length > 0 && (
                            <div className="mt-2 flex flex-col gap-2">
                                {pending.length > 1 && (
                                    <div className="flex items-center gap-2 rounded-md border border-brand/30 bg-brand-soft/40 px-3 py-1.5 text-[12px]">
                                        <span className="font-medium text-foreground">{pending.length} үйлдэл таны зөвшөөрлийг хүлээж байна</span>
                                        <button type="button" onClick={() => onApproveAll(pending.map((a) => a.id))} className="ml-auto inline-flex h-[26px] items-center gap-1 rounded-md bg-brand px-2 text-[12px] font-medium text-brand-fg hover:bg-brand-strong"><CheckCheck className="h-3.5 w-3.5" /> Бүгдийг зөвшөөрөх</button>
                                    </div>
                                )}
                                {m.pendingActions.map((a) => <ActionCard key={a.id} a={a} onApprove={() => onApprove(a)} onCancel={() => onCancel(a)} onAlways={() => onAlways(a)} />)}
                            </div>
                        )}
                        {!m.streaming && m.trace ? (
                            <div className="mt-1.5">
                                <button type="button" onClick={() => setShowTrace((v) => !v)} className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground">
                                    {showTrace ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                                    {(m.agentsUsed || []).map((a) => a.name).join(' · ') || 'Мөшгилт'}
                                    {(m.trace as { totalLatencyMs?: number })?.totalLatencyMs ? <span className="mono-label">· {((m.trace as { totalLatencyMs: number }).totalLatencyMs / 1000).toFixed(1)}с</span> : null}
                                </button>
                                {showTrace && <div className="mt-1"><OrchestrationTrace trace={m.trace as never} /></div>}
                            </div>
                        ) : null}
                    </>
                )}
            </div>
        </div>
    );
}

/**
 * Явцын мөрүүд — ChatGPT/Claude маягаар «Лид хайж байна… → 12 лид олдлоо».
 * Streaming дууссаны дараа хураангуй (collapsed) хэвээр үлдэнэ.
 */
function ActivityView({ items, status, streaming }: { items: Activity[]; status?: string | null; streaming: boolean }) {
    const [open, setOpen] = useState(false);
    const expanded = streaming || open;
    const ok = items.filter((a) => a.status === 'ok').length;
    return (
        <div className="mb-2 text-[12px]">
            {!streaming && items.length > 0 && (
                <button type="button" onClick={() => setOpen((v) => !v)} className="inline-flex items-center gap-1 text-[11.5px] text-muted-foreground hover:text-foreground">
                    {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                    {items.length} алхам · {ok} амжилттай
                </button>
            )}
            {expanded && (
                <div className={cn('flex flex-col gap-1 rounded-md border border-border bg-surface-2/50 px-2.5 py-2', !streaming && 'mt-1')}>
                    {items.map((a) => (
                        <Row key={a.id} icon={a.status === 'run' ? <Loader2 className="h-3.5 w-3.5 animate-spin text-brand" /> : a.status === 'ok' ? <Check className="h-3.5 w-3.5 text-status-success" /> : <X className="h-3.5 w-3.5 text-status-danger" />}>
                            {a.kind === 'agent' && <Users className="mr-1 h-3 w-3 text-muted-foreground" />}
                            <span className={cn('font-medium', a.status === 'run' ? 'text-foreground' : 'text-fg-2')}>{a.label}{a.status === 'run' ? '…' : ''}</span>
                            {a.summary && <span className="ml-1.5 truncate text-muted-foreground">{a.status === 'run' && a.kind === 'agent' ? a.summary : a.status !== 'run' ? `→ ${a.summary}` : ''}</span>}
                            {a.latencyMs !== undefined && a.latencyMs > 0 && <span className="mono-label ml-auto pl-2 text-[10.5px] text-muted-foreground">{(a.latencyMs / 1000).toFixed(1)}с</span>}
                        </Row>
                    ))}
                    {status && <Row icon={<Loader2 className="h-3.5 w-3.5 animate-spin text-brand" />}><span className="text-muted-foreground">{status}</span></Row>}
                </div>
            )}
        </div>
    );
}
function Row({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
    return <div className="flex items-center gap-2"><span className="flex h-4 w-4 shrink-0 items-center justify-center">{icon}</span><span className="flex min-w-0 flex-1 items-center">{children}</span></div>;
}

function ActionCard({ a, onApprove, onCancel, onAlways }: { a: PendingAction; onApprove: () => void; onCancel: () => void; onAlways: () => void }) {
    const rows = Object.entries(a.preview || {}).filter(([, v]) => v !== null && v !== undefined && v !== '').slice(0, 8);
    const tone = a.status === 'done' ? 'border-status-success/40' : a.status === 'error' ? 'border-status-danger/40' : a.status === 'cancelled' ? 'border-border opacity-60' : 'border-brand/40';
    return (
        <div className={cn('rounded-md border bg-surface', tone)}>
            <div className="flex items-center gap-2 border-b border-border px-3 py-2">
                <span className="text-[12.5px] font-semibold text-foreground">{a.label}</span>
                <span className="text-[11px] text-muted-foreground">· {a.agentName}</span>
                <span className="ml-auto">
                    {a.status === 'running' && <Loader2 className="h-3.5 w-3.5 animate-spin text-brand" />}
                    {a.status === 'done' && <span className="inline-flex items-center gap-1 text-[11.5px] font-medium text-status-success"><Check className="h-3.5 w-3.5" /> Гүйцэтгэгдлээ</span>}
                    {a.status === 'cancelled' && <span className="text-[11.5px] text-muted-foreground">Цуцалсан</span>}
                    {a.status === 'error' && <span className="text-[11.5px] font-medium text-status-danger">Алдаа</span>}
                </span>
            </div>
            {rows.length > 0 && (
                <dl className="grid grid-cols-[110px_1fr] gap-x-3 gap-y-1 px-3 py-2 text-[12px]">
                    {rows.map(([k, v]) => (<React.Fragment key={k}><dt className="truncate text-muted-foreground">{k}</dt><dd className="truncate text-foreground">{typeof v === 'object' ? JSON.stringify(v) : String(v)}</dd></React.Fragment>))}
                </dl>
            )}
            {a.resultMessage && a.status !== 'pending' && <div className={cn('px-3 pb-2 text-[12px]', a.status === 'error' ? 'text-status-danger' : 'text-fg-2')}>{a.resultMessage}</div>}
            {a.status === 'pending' && (
                <div className="flex flex-wrap items-center gap-1.5 border-t border-border px-3 py-2">
                    <button type="button" onClick={onApprove} className="inline-flex h-[28px] items-center gap-1.5 rounded-md bg-brand px-2.5 text-[12px] font-medium text-brand-fg hover:bg-brand-strong"><Check className="h-3.5 w-3.5" /> Зөвшөөрөх</button>
                    <button type="button" onClick={onCancel} className="h-[28px] rounded-md border border-border-strong bg-surface px-2.5 text-[12px] text-foreground hover:bg-surface-2">Болих</button>
                    <button type="button" onClick={onAlways} className="ml-auto text-[11.5px] text-muted-foreground hover:text-foreground" title="Энэ төрлийн үйлдлийг энэ session-д дахин асуухгүй">Үргэлж зөвшөөрөх</button>
                </div>
            )}
        </div>
    );
}

// Диаграм — recharts-ийг зөвхөн харагдах үед татна (AiChat бүх хуудсанд mounted)
const ChartBlock = dynamic(() => import('./AiChartBlock'), {
    ssr: false,
    loading: () => <div className="mt-2 h-[160px] animate-pulse rounded-md border border-border bg-surface" />,
});

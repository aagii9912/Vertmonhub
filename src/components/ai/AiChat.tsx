'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Sparkles, Check, X, Loader2, AlertCircle, RotateCcw, ChevronDown, ChevronRight, Wrench, ShieldCheck, Copy } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line } from 'recharts';
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

export interface AiMessage {
    id: string;
    role: 'user' | 'assistant';
    content: string;
    attachments?: { url: string; name: string; mimeType: string }[];
    chartConfig?: { type?: string; data?: { name: string; value: number }[] } | null;
    data?: unknown;
    agentsUsed?: StreamDone['agentsUsed'];
    trace?: unknown;
    pendingActions?: PendingAction[];
    /** Streaming явцын төлөв (зөвхөн идэвхтэй хариунд) */
    progress?: Progress;
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
    autoApproved?: boolean;
}

interface Progress {
    phase: 'planning' | 'running' | 'synthesizing' | 'done';
    reasoning?: string;
    steps: { agentId: string; agentName: string; task: string; status: 'wait' | 'run' | 'ok' | 'fail'; tools: string[]; latencyMs?: number; error?: string }[];
}

interface PendingRequest {
    text: string;
    attachments: { url: string; name: string; mimeType: string }[];
}

const TOOL_LABEL: Record<string, string> = {
    get_dashboard_stats: 'Самбарын тоо', list_properties: 'Байр хайх', list_leads: 'Лид хайх', get_lead_details: 'Лидийн мэдээлэл',
    get_customer_insights: 'Харилцагчийн дүн', list_contracts: 'Гэрээ хайх', get_contract_details: 'Гэрээний мэдээлэл', get_contracts_summary: 'Гэрээний нэгтгэл',
    get_sales_summary: 'Борлуулалтын нэгтгэл', get_sales_forecast: 'Прогноз', compare_properties: 'Байр харьцуулах', get_marketing_summary: 'Маркетингийн нэгтгэл',
    get_marketing_budget_status: 'Төсвийн байдал', get_market_indicators: 'Зах зээлийн үзүүлэлт', update_lead_status: 'Лидийн статус', add_lead_note: 'Тэмдэглэл',
    schedule_viewing: 'Уулзалт товлох', create_lead: 'Лид үүсгэх', create_customer: 'Харилцагч үүсгэх', create_contract: 'Гэрээ үүсгэх', process_contract_action: 'Гэрээний үйлдэл',
    update_property_status: 'Байрны статус', update_property_price: 'Байрны үнэ', create_property: 'Байр үүсгэх', bulk_update_leads: 'Олон лид шинэчлэх', attach_file: 'Файл хавсаргах',
    remember_fact: 'Санах', create_social_post: 'Пост үүсгэх', delete_lead: 'Лид устгах', delete_contract: 'Гэрээ устгах', invite_user: 'Хэрэглэгч урих', assign_role: 'Эрх оноох',
};
const toolLabel = (t: string) => TOOL_LABEL[t] ?? t;

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
    const { shop } = useAuth();
    const ctx = useAiContext();
    const [messages, setMessages] = useState<AiMessage[]>(initialMessages ?? []);
    const [conversationId, setConversationId] = useState<string | null>(convProp ?? null);
    const [busy, setBusy] = useState(false);
    const abortRef = useRef<AbortController | null>(null);
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

    const send = async (text: string, attachments: AiAttachment[] | PendingRequest['attachments']) => {
        const atts = attachments.map((a) => ({ url: a.url!, name: a.name, mimeType: a.mimeType })).filter((a) => a.url);
        const content = text || (atts.length ? 'Хавсаргасан файлыг шинжилж туслаач.' : '');
        if (!content) return;
        const history = messages.filter((m) => !m.error && m.content).slice(-20).map((m) => ({ role: m.role, content: m.content }));
        const userMsg: AiMessage = { id: uid(), role: 'user', content, attachments: atts };
        const asstId = uid();
        setMessages((prev) => [...prev, userMsg, { id: asstId, role: 'assistant', content: '', streaming: true, progress: { phase: 'planning', steps: [] } }]);
        setBusy(true);
        const controller = new AbortController();
        abortRef.current = controller;

        await streamAssistant(
            { message: content, shopId: shop?.id, conversationId, history, attachments: atts, context: ctx },
            {
                signal: controller.signal,
                onEvent: (e: StreamEvent) => {
                    switch (e.type) {
                        case 'plan':
                            update(asstId, (m) => ({ ...m, progress: { phase: 'running', reasoning: e.reasoning, steps: e.steps.map((s) => ({ ...s, status: 'wait', tools: [] })) } }));
                            break;
                        case 'step_start':
                            update(asstId, (m) => ({ ...m, progress: m.progress && { ...m.progress, phase: 'running', steps: m.progress.steps.map((s, i) => (i === e.index ? { ...s, status: 'run' } : s)) } }));
                            break;
                        case 'tool':
                            update(asstId, (m) => ({ ...m, progress: m.progress && { ...m.progress, steps: m.progress.steps.map((s) => (s.agentId === e.agentId && s.status === 'run' ? { ...s, tools: [...s.tools, e.tool] } : s)) } }));
                            break;
                        case 'step_done':
                            update(asstId, (m) => ({ ...m, progress: m.progress && { ...m.progress, steps: m.progress.steps.map((s, i) => (i === e.index ? { ...s, status: e.ok ? 'ok' : 'fail', latencyMs: e.latencyMs, tools: e.toolsUsed.length ? e.toolsUsed : s.tools, error: e.error } : s)) } }));
                            break;
                        case 'synthesis_start':
                            update(asstId, (m) => ({ ...m, progress: m.progress && { ...m.progress, phase: 'synthesizing' } }));
                            break;
                        case 'token':
                            update(asstId, (m) => ({ ...m, content: m.content + e.text }));
                            break;
                        case 'token_reset':
                            update(asstId, { content: '' });
                            break;
                        case 'done': {
                            const actions: PendingAction[] = (e.pendingActions || []).map((a) => ({ ...a, status: 'pending', autoApproved: shop?.id ? isToolAllowed(shop.id, a.tool) : false }));
                            update(asstId, (m) => ({ ...m, content: e.response || m.content, streaming: false, progress: m.progress && { ...m.progress, phase: 'done' }, chartConfig: e.chartConfig as AiMessage['chartConfig'], data: e.data, agentsUsed: e.agentsUsed, trace: e.trace, pendingActions: actions }));
                            if (e.conversationId && e.conversationId !== conversationId) { setConversationId(e.conversationId); onConversationId?.(e.conversationId); }
                            break;
                        }
                        case 'error':
                            update(asstId, (m) => ({ ...m, streaming: false, progress: undefined, error: { message: e.message, retryable: e.retryable !== false, request: { text: content, attachments: atts } } }));
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
        setMessages((prev) => prev.filter((x) => x.id !== m.id && !(x.role === 'user' && x.content === req.text && prev.indexOf(x) === prev.indexOf(m) - 1)));
        void send(req.text, req.attachments);
    };

    /* ---------- үйлдэл ---------- */
    const setAction = (id: string, patch: Partial<PendingAction>) =>
        setMessages((prev) => prev.map((m) => (m.pendingActions ? { ...m, pendingActions: m.pendingActions.map((a) => (a.id === id ? { ...a, ...patch } : a)) } : m)));

    const approve = useCallback(async (a: PendingAction) => {
        setAction(a.id, { status: 'running' });
        const r = await approveAssistantAction({ shopId: shop?.id, tool: a.tool, args: a.args, conversationId });
        if (r.ok) { setAction(a.id, { status: 'done', resultMessage: r.message }); toast.success(r.message); }
        else { setAction(a.id, { status: 'error', resultMessage: r.message, autoApproved: false }); toast.error(r.message); }
    }, [shop?.id, conversationId]);

    const allowAlways = (a: PendingAction) => {
        if (shop?.id) addAllowedTool(shop.id, a.tool);
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

                    {messages.map((m) => (m.role === 'user' ? <UserBubble key={m.id} m={m} /> : <AssistantBlock key={m.id} m={m} compact={!!compact} onRetry={() => retry(m)} onApprove={approve} onCancel={(a) => setAction(a.id, { status: 'cancelled' })} onAlways={allowAlways} />))}
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

function AssistantBlock({ m, compact, onRetry, onApprove, onCancel, onAlways }: { m: AiMessage; compact: boolean; onRetry: () => void; onApprove: (a: PendingAction) => void; onCancel: (a: PendingAction) => void; onAlways: (a: PendingAction) => void }) {
    const [showTrace, setShowTrace] = useState(false);
    const copy = () => { void navigator.clipboard?.writeText(m.content); toast.success('Хуулагдлаа'); };

    return (
        <div className="flex gap-2.5">
            <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-brand-soft text-brand"><Sparkles className="h-3.5 w-3.5" /></span>
            <div className="min-w-0 flex-1">
                {m.progress && (m.streaming || m.progress.phase !== 'done') && <ProgressView p={m.progress} />}
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
                        ) : m.streaming && !m.progress ? (
                            <div className="flex items-center gap-2 text-[12.5px] text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Холбогдож байна…</div>
                        ) : null}
                        {m.chartConfig?.data && m.chartConfig.data.length > 0 && <ChartBlock cfg={m.chartConfig} compact={compact} />}
                        {m.pendingActions && m.pendingActions.length > 0 && (
                            <div className="mt-2 flex flex-col gap-2">
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

function ProgressView({ p }: { p: Progress }) {
    return (
        <div className="mb-2 flex flex-col gap-1 rounded-md border border-border bg-surface-2/50 px-2.5 py-2 text-[12px]">
            {p.phase === 'planning' && <Row icon={<Loader2 className="h-3.5 w-3.5 animate-spin text-brand" />}>Асуултыг шинжилж, мэргэжилтэн сонгож байна…</Row>}
            {p.steps.map((s, i) => (
                <Row key={i} icon={s.status === 'run' ? <Loader2 className="h-3.5 w-3.5 animate-spin text-brand" /> : s.status === 'ok' ? <Check className="h-3.5 w-3.5 text-status-success" /> : s.status === 'fail' ? <X className="h-3.5 w-3.5 text-status-danger" /> : <span className="inline-block h-3.5 w-3.5 rounded-full border border-border-strong" />}>
                    <span className={cn('font-medium', s.status === 'wait' ? 'text-muted-foreground' : 'text-foreground')}>{s.agentName}</span>
                    {s.tools.length > 0 && <span className="ml-1.5 inline-flex flex-wrap gap-1">{[...new Set(s.tools)].map((t) => <span key={t} className="inline-flex items-center gap-0.5 rounded bg-surface-3 px-1 text-[10.5px] text-fg-2"><Wrench className="h-2.5 w-2.5" />{toolLabel(t)}</span>)}</span>}
                    {s.latencyMs !== undefined && <span className="mono-label ml-auto text-[10.5px] text-muted-foreground">{(s.latencyMs / 1000).toFixed(1)}с</span>}
                </Row>
            ))}
            {p.phase === 'synthesizing' && <Row icon={<Loader2 className="h-3.5 w-3.5 animate-spin text-brand" />}>Хариуг нэгтгэж байна…</Row>}
        </div>
    );
}
function Row({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
    return <div className="flex items-center gap-2"><span className="flex h-4 w-4 shrink-0 items-center justify-center">{icon}</span><span className="flex min-w-0 flex-1 flex-wrap items-center">{children}</span></div>;
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

function ChartBlock({ cfg, compact }: { cfg: NonNullable<AiMessage['chartConfig']>; compact: boolean }) {
    const data = cfg.data || [];
    const H = compact ? 160 : 220;
    return (
        <div className="mt-2 rounded-md border border-border bg-surface p-2">
            <ResponsiveContainer width="100%" height={H}>
                {cfg.type === 'line' ? (
                    <LineChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                        <CartesianGrid stroke="var(--border)" vertical={false} />
                        <XAxis dataKey="name" tick={{ fontSize: 10.5, fill: 'var(--muted)' }} axisLine={false} tickLine={false} />
                        <YAxis tick={{ fontSize: 10.5, fill: 'var(--muted)' }} axisLine={false} tickLine={false} width={44} />
                        <Tooltip contentStyle={{ fontSize: 12, borderRadius: 6, border: '1px solid var(--border)' }} />
                        <Line type="monotone" dataKey="value" stroke="var(--brand)" strokeWidth={2} dot={false} />
                    </LineChart>
                ) : (
                    <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                        <CartesianGrid stroke="var(--border)" vertical={false} />
                        <XAxis dataKey="name" tick={{ fontSize: 10.5, fill: 'var(--muted)' }} axisLine={false} tickLine={false} />
                        <YAxis tick={{ fontSize: 10.5, fill: 'var(--muted)' }} axisLine={false} tickLine={false} width={44} />
                        <Tooltip contentStyle={{ fontSize: 12, borderRadius: 6, border: '1px solid var(--border)' }} />
                        <Bar dataKey="value" fill="var(--brand)" radius={[3, 3, 0, 0]} />
                    </BarChart>
                )}
            </ResponsiveContainer>
        </div>
    );
}

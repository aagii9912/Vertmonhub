/**
 * AI Orchestrator v3 — type definitions
 *
 * v3 = ГИБРИД: нэг үндсэн Claude туслах (бүх tool-той agentic loop, streaming) +
 * шаардлагатай үед мэргэшсэн дэд агентуудад зэрэг хуваарилах (`delegate_to_specialists`).
 * Planner/synthesizer дуудлагууд байхгүй — модель өөрөө шийднэ.
 */

import type { AssistantPerms } from '@/lib/ai/data-assistant';

/** Бүртгэлтэй дэд агентуудын тогтмол ID-ууд. */
export type AgentId =
    | 'data-analyst'
    | 'property-expert'
    | 'crm-specialist'
    | 'finance-analyst'
    | 'advisor'
    | 'operations-admin'
    | 'marketing-specialist';

/** Нэг дэд агентын тодорхойлолт (registry дотор). */
export interface AgentDefinition {
    id: AgentId;
    name: string;
    emoji: string;
    color: 'emerald' | 'violet' | 'sky' | 'amber' | 'rose';
    /** Үндсэн туслах энэ агентыг хэзээ сонгохыг ойлгох тайлбар. */
    description: string;
    readToolNames: string[];
    writeToolNames: string[];
    deleteToolNames?: string[];
    adminToolNames?: string[];
    buildInstruction: (shopKnowledge?: string) => string;
}

/** AI санал болгосон, хэрэглэгчийн зөвшөөрлийг хүлээж буй үйлдэл. */
export interface PendingAction {
    id: string;
    tool: string;
    args: Record<string, unknown>;
    label: string;
    preview: Record<string, unknown>;
    agentId: string;
    agentName: string;
    emoji: string;
}

/** Модель хэрэглэгчээс тодруулга асуусан (ask_user). */
export interface Clarification {
    question: string;
    options: string[];
}

/** Ярианы түүхийн нэг мессеж (client → server). */
export interface HistoryMessage {
    role: string;
    content: string;
}

/**
 * Streaming үйл явдлууд — UI алхам бүрийг бодит цагт харуулна (ChatGPT/Claude маяг).
 * - tool_start/tool_done: үндсэн туслахын tool дуудлага (chat дотор inline мөр).
 * - step_*: дэд агентын ажил (delegate үед).
 * - token: эцсийн хариуны хэсэг; token_reset: өмнөх урьдчилсан текстийг хаях.
 */
export type OrchestratorEvent =
    | { type: 'status'; text: string }
    | { type: 'tool_start'; id: string; tool: string; args: Record<string, unknown>; agentId?: AgentId }
    | { type: 'tool_done'; id: string; tool: string; ok: boolean; summary: string; latencyMs: number; agentId?: AgentId }
    | { type: 'step_start'; agentId: AgentId; agentName: string; task: string }
    | { type: 'step_done'; agentId: AgentId; agentName: string; ok: boolean; latencyMs: number; toolsUsed: string[]; error?: string }
    | { type: 'token'; text: string }
    | { type: 'token_reset' }
    | { type: 'clarify'; question: string; options: string[] };

export interface OrchestratorContext {
    shopId: string;
    userId: string;
    perms: AssistantPerms;
    shopKnowledge?: string;
    history?: HistoryMessage[];
    /** Урт ярианы хураангуй (DB-ээс, best-effort). */
    conversationSummary?: string | null;
    onEvent?: (event: OrchestratorEvent) => void;
    /** Нэвтэрсэн хэрэглэгчийн нэр — үүсгэх үйлдэлд хадгална. */
    userName?: string;
    attachments?: OrchestratorAttachment[];
    /** Дэд агентын ажиллагаанд: аль агент (trace/event-д). */
    agentId?: AgentId;
    /** Client холболт таслахад (Зогсоох / таб хаах) Claude дуудлагыг зогсооно. */
    signal?: AbortSignal;
    /** Энэ мөчөөс хойш шинэ раунд/агент эхлүүлэхгүй (Vercel maxDuration-аас өмнө partial хариу өгнө). */
    deadlineAt?: number;
}

export interface OrchestratorAttachment {
    url: string;
    name?: string;
    mimeType?: string;
}

/** Нэг дэд агентын үр дүн. */
export interface AgentRunResult {
    text: string;
    data: unknown;
    chartConfig: unknown;
    toolsUsed: string[];
    latencyMs: number;
    tokens: number;
    ok: boolean;
    error?: string;
    pendingActions: PendingAction[];
}

/** Trace-д бичигдэх нэг tool дуудлага. */
export interface TraceTool {
    tool: string;
    agentId: AgentId | 'main';
    ok: boolean;
    latencyMs: number;
    summary: string;
}

/** Trace-д бичигдэх нэг дэд агентын алхам. */
export interface TraceStep {
    agentId: AgentId;
    agentName: string;
    emoji: string;
    color: string;
    task: string;
    toolsUsed: string[];
    latencyMs: number;
    tokens: number;
    ok: boolean;
    error?: string;
}

/** Бүх ажиллагааны ил тод мөшгилт. */
export interface OrchestrationTrace {
    model: string;
    /** Үндсэн loop-ийн модель дуудлагын тоо */
    rounds: number;
    tools: TraceTool[];
    steps: TraceStep[];
    totalLatencyMs: number;
    totalTokens: number;
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens: number;
    summaryUsed: boolean;
}

export interface AgentBadge {
    id: AgentId | 'main';
    name: string;
    emoji: string;
    color: string;
}

export interface OrchestratorResult {
    text: string;
    data: unknown;
    chartConfig: unknown;
    agentsUsed: AgentBadge[];
    trace: OrchestrationTrace;
    pendingActions: PendingAction[];
    clarification: Clarification | null;
}

/**
 * AI Orchestrator — type definitions
 *
 * The orchestrator замчилагч нь нэг хүсэлтийг задлан шинжилж, тусгай мэргэшсэн
 * agent-уудад (Дата аналист, Байрны мэргэжилтэн, CRM, Санхүү, Зөвлөх) хуваарилж,
 * үр дүнг нэгтгээд, бүх алхмын мөшгилт (trace)-ийг буцаана.
 */

import type { AssistantPerms } from '@/lib/ai/data-assistant';

/** Бүртгэлтэй agent-уудын тогтмол ID-ууд. */
export type AgentId =
    | 'data-analyst'
    | 'property-expert'
    | 'crm-specialist'
    | 'finance-analyst'
    | 'advisor';

/** Нэг agent-ийн тодорхойлолт (registry дотор). */
export interface AgentDefinition {
    id: AgentId;
    /** Хэрэглэгчид харагдах монгол нэр. */
    name: string;
    emoji: string;
    /** Badge-ийн өнгөний түлхүүр (UI talvendaa map хийнэ). */
    color: 'emerald' | 'violet' | 'sky' | 'amber' | 'rose';
    /** Planner энэ agent-ийг хэзээ сонгохыг ойлгох тайлбар. */
    description: string;
    temperature: number;
    /** Энэ agent-д нээлттэй унших tool-уудын нэрс (data-assistant readTools-оос). */
    readToolNames: string[];
    /** Бичих эрхтэй үед нээгдэх write tool-уудын нэрс (perms.canWrite шаардана). */
    writeToolNames: string[];
    /** Тухайн agent-д зориулсан фокустай систем заавар. */
    buildInstruction: (shopKnowledge?: string) => string;
}

/** Orchestrator гүйцэтгэлд дамжуулах контекст. */
export interface OrchestratorContext {
    shopId: string;
    userId: string;
    perms: AssistantPerms;
    shopKnowledge?: string;
    history?: Array<{ role: string; content: string }>;
}

/** Planner-ийн гаргасан нэг алхам. */
export interface PlanStep {
    agentId: AgentId;
    /** Тухайн agent-д өгөх дэд даалгавар (монголоор). */
    task: string;
}

/** Planner-ийн бүтэн төлөвлөгөө. */
export interface OrchestrationPlan {
    reasoning: string;
    steps: PlanStep[];
}

/** Нэг agent гүйцэтгэлийн үр дүн. */
export interface AgentRunResult {
    text: string;
    data: any;
    chartConfig: any;
    toolsUsed: string[];
    latencyMs: number;
    tokens: number;
    ok: boolean;
    error?: string;
}

/** Trace-д бичигдэх нэг алхмын мөшгилт. */
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

/** Бүх орчестрацийн ил тод мөшгилт (observability). */
export interface OrchestrationTrace {
    plannerReasoning: string;
    plannerLatencyMs: number;
    plannerModel: string;
    steps: TraceStep[];
    synthesisUsed: boolean;
    synthesisLatencyMs: number;
    totalLatencyMs: number;
    totalTokens: number;
}

/** Хэрэглэгч/UI-д харуулах хураангуй agent тэмдэг. */
export interface AgentBadge {
    id: AgentId;
    name: string;
    emoji: string;
    color: string;
}

/** Orchestrator-ийн эцсийн үр дүн. */
export interface OrchestratorResult {
    text: string;
    data: any;
    chartConfig: any;
    agentsUsed: AgentBadge[];
    trace: OrchestrationTrace;
}

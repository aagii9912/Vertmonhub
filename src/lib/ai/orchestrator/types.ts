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
    | 'advisor'
    | 'operations-admin'
    | 'marketing-specialist';

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
    /** Бичих эрхтэй үед нээгдэх write/create tool-уудын нэрс (perms.canWrite шаардана). */
    writeToolNames: string[];
    /** Устгах эрхтэй үед нээгдэх delete tool-уудын нэрс (perms.canDelete шаардана). */
    deleteToolNames?: string[];
    /** ЗӨВХӨН super_admin-д нээгдэх admin tool-уудын нэрс. */
    adminToolNames?: string[];
    /** Тухайн agent-д зориулсан фокустай систем заавар. */
    buildInstruction: (shopKnowledge?: string) => string;
}

/** AI санал болгосон, хэрэглэгчийн зөвшөөрлийг хүлээж буй үйлдэл. */
export interface PendingAction {
    id: string;
    tool: string;
    args: Record<string, unknown>;
    /** Хэрэглэгчид харагдах товч гарчиг. */
    label: string;
    /** Гүйцэтгэхээс өмнө харуулах талбарууд. */
    preview: Record<string, unknown>;
    agentId: string;
    agentName: string;
    emoji: string;
}

/** Orchestrator гүйцэтгэлд дамжуулах контекст. */
/**
 * Streaming үйл явдлууд — UI алхам бүрийн явцыг бодит цагт харуулна.
 * token — эцсийн хариуны хэсэг; token_reset — өмнө илгээсэн урьдчилсан текстийг
 * хаях (model дунд нь tool дуудсан үед).
 */
export type OrchestratorEvent =
    | { type: 'plan'; reasoning: string; steps: Array<{ agentId: AgentId; agentName: string; task: string }>; latencyMs: number }
    | { type: 'step_start'; agentId: AgentId; agentName: string; index: number }
    | { type: 'tool'; agentId: AgentId; tool: string }
    | { type: 'step_done'; agentId: AgentId; agentName: string; index: number; ok: boolean; latencyMs: number; toolsUsed: string[]; error?: string }
    | { type: 'synthesis_start' }
    | { type: 'token'; text: string }
    | { type: 'token_reset' };

export interface OrchestratorContext {
    shopId: string;
    userId: string;
    perms: AssistantPerms;
    shopKnowledge?: string;
    history?: Array<{ role: string; content: string }>;
    /** Streaming: алхам/токен бүрийг хүлээн авагч (заавал биш). */
    onEvent?: (event: OrchestratorEvent) => void;
    /** Ганц агенттай төлөвлөгөөнд эцсийн текстийг токеноор урсгах эсэх (orchestrator тавина). */
    streamFinal?: boolean;
    /** Нэвтэрсэн хэрэглэгчийн (борлуулалтын менежер) нэр — үүсгэх үйлдэлд хадгална. */
    userName?: string;
    /** Чатад хавсаргасан файлууд (AI унших/шинжлэх + бичлэгт хавсаргах). */
    attachments?: OrchestratorAttachment[];
    /** Client холболт таслахад (Зогсоох / таб хаах) Gemini дуудлагыг зогсооно. */
    signal?: AbortSignal;
    /** Энэ мөчөөс хойш шинэ агент эхлүүлэхгүй (Vercel maxDuration-аас өмнө partial хариу өгнө). */
    deadlineAt?: number;
}

/** Чатын хавсралт — /api/dashboard/upload-аас ирсэн URL. */
export interface OrchestratorAttachment {
    url: string;
    name?: string;
    mimeType?: string;
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
    /** Энэ agent-ийн санал болгосон, баталгаажуулалт хүлээж буй үйлдлүүд. */
    pendingActions: PendingAction[];
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
    /** Хэрэглэгчийн зөвшөөрлийг хүлээж буй үйлдлүүд (баталгаажуулалтын карт). */
    pendingActions: PendingAction[];
}

/**
 * GPT Responses agentic loop — үндсэн туслах ба дэд агент хоёулаа үүнийг ашиглана.
 *
 * Нэг дуудлага = model.stream → (tool_use блокууд байвал) tool гүйцэтгэ → tool_result-уудыг
 * НЭГ user мессежээр буцаа → давт. `end_turn` (эсвэл ask_user) дээр зогсоно.
 * Streaming: текст токен бүрийг onEvent('token') руу. Tool дуудлагын өмнөх товч тайлбар
 * («Лидийг шалгая…») хадгалагдаж, дараагийн раундын текст хоосон мөрөөр залгагдана.
 */

import type Anthropic from '@anthropic-ai/sdk';
import { randomUUID } from 'crypto';
import { logger } from '@/lib/utils/logger';
import { executeDataTool } from '@/lib/ai/data-assistant';
import { generateChartConfig } from '@/lib/ai/data-assistant/functions';
import { streamResponse, responseText, toResponseInput, toResponseTools } from '@/lib/ai/openai/responses';
import { describeOpenAIError } from '@/lib/ai/openai/client';
import { ASK_USER_TOOL } from '@/lib/ai/claude/tools';
import { AUTO_TOOL_NAMES, MUTATING_TOOL_NAMES } from '@/lib/ai/data-assistant/tools';

const AUTO_SET = new Set(AUTO_TOOL_NAMES);
import type { AgentId, Clarification, HistoryMessage, OrchestratorAttachment, OrchestratorContext, PendingAction, RunInterruption, TraceTool } from './types';

export const MAX_HISTORY = 20;
export const MAX_ROUNDS = 8;

/* ------------------------------------------------------------------ */
/* Түүх ба оролт                                                        */
/* ------------------------------------------------------------------ */

/**
 * Client-ийн түүхийг Claude MessageParam[] болгоно: сүүлийн MAX_HISTORY, эхнийх заавал user.
 * Дараалсан ижил role-ийг API нэгтгэдэг тул нэмэлт merge шаардлагагүй.
 */
export function buildHistory(history?: HistoryMessage[], max = MAX_HISTORY): Anthropic.MessageParam[] {
    const mapped: Anthropic.MessageParam[] = (history || [])
        .filter((m) => (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string' && m.content.trim())
        .slice(-max)
        .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content }));
    while (mapped.length > 0 && mapped[0].role !== 'user') mapped.shift();
    return mapped;
}

/**
 * SSRF хамгаалалт: хавсралтын URL нь ЗӨВХӨН манай Supabase storage-ийн public bucket
 * (upload route-ийн буцаадаг хаяг) байх ёстой — client-ээс ирсэн дурын URL-ийг сервер татахгүй.
 */
export function isAllowedAttachmentUrl(url: string): boolean {
    const base = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim();
    if (!base || typeof url !== 'string') return false;
    try {
        const u = new URL(url);
        const b = new URL(base);
        if (u.protocol !== b.protocol || u.host !== b.host) return false;
        return u.pathname.startsWith('/storage/v1/object/public/products/') || u.pathname.startsWith('/storage/v1/object/public/property-images/');
    } catch {
        return false;
    }
}

function isImage(mime?: string): mime is 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp' {
    return mime === 'image/jpeg' || mime === 'image/png' || mime === 'image/gif' || mime === 'image/webp';
}

/** Хэрэглэгчийн мессеж + хавсралт (зураг/PDF inline base64) → content блокууд. */
export async function buildUserContent(text: string, attachments?: OrchestratorAttachment[]): Promise<Anthropic.ContentBlockParam[]> {
    if (!attachments || attachments.length === 0) return [{ type: 'text', text }];
    const list = attachments.map((a, i) => `${i + 1}. ${a.name || 'файл'} — ${a.url}${a.mimeType ? ` (${a.mimeType})` : ''}`).join('\n');
    const blocks: Anthropic.ContentBlockParam[] = [];
    for (const att of attachments) {
        if (!isImage(att.mimeType) && att.mimeType !== 'application/pdf') continue;
        if (!isAllowedAttachmentUrl(att.url)) continue;
        try {
            const res = await fetch(att.url, { signal: AbortSignal.timeout(10_000), redirect: 'error' });
            if (!res.ok) continue;
            const buf = await res.arrayBuffer();
            if (buf.byteLength > 8 * 1024 * 1024) continue;
            const data = Buffer.from(buf).toString('base64');
            if (isImage(att.mimeType)) blocks.push({ type: 'image', source: { type: 'base64', media_type: att.mimeType, data } });
            else blocks.push({ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data } });
        } catch { /* татаж чадахгүй бол URL текстэд үлдэнэ */ }
    }
    blocks.push({ type: 'text', text: `${text}\n\n[Хавсаргасан файлууд]:\n${list}\n(Бичлэгт хавсаргах бол attach_file-д яг дээрх URL-ийг өг.)` });
    return blocks;
}

/* ------------------------------------------------------------------ */
/* Tool үр дүнгийн товч (UI-д «12 лид олдлоо» гэх мэт)                  */
/* ------------------------------------------------------------------ */

function countOf(result: unknown): number | null {
    if (Array.isArray(result)) return result.length;
    if (result && typeof result === 'object') {
        const r = result as Record<string, unknown>;
        for (const k of ['leads', 'properties', 'contracts', 'customers', 'items', 'results', 'units', 'viewings', 'campaigns', 'posts']) {
            if (Array.isArray(r[k])) return (r[k] as unknown[]).length;
        }
        if (typeof r.count === 'number') return r.count;
        if (typeof r.total === 'number') return r.total;
    }
    return null;
}

const NOUN: Record<string, string> = {
    list_leads: 'лид', list_properties: 'байр', list_contracts: 'гэрээ', get_customer_insights: 'харилцагч', compare_properties: 'байр',
};

/** Tool үр дүнг хэрэглэгчид харуулах нэг мөр товч болгоно. */
export function summarizeToolResult(tool: string, result: unknown): { ok: boolean; summary: string } {
    if (result && typeof result === 'object') {
        const r = result as Record<string, unknown>;
        if (typeof r.error === 'string') return { ok: false, summary: r.error.slice(0, 120) };
        if (r.requiresConfirmation) return { ok: true, summary: 'Баталгаажуулалт хүлээж байна' };
        if (typeof r.message === 'string') return { ok: true, summary: r.message.slice(0, 120) };
    }
    const n = countOf(result);
    if (n !== null) return { ok: true, summary: n === 0 ? 'Олдсонгүй' : `${n} ${NOUN[tool] || 'мөр'} олдлоо` };
    return { ok: true, summary: 'Уншлаа' };
}

/* ------------------------------------------------------------------ */
/* Loop                                                                 */
/* ------------------------------------------------------------------ */

export interface LoopOptions {
    model: string;
    system: Anthropic.TextBlockParam[];
    tools: Anthropic.Tool[];
    messages: Anthropic.MessageParam[];
    ctx: OrchestratorContext;
    /** Текстийг токеноор onEvent руу урсгах эсэх */
    streamText: boolean;
    /** Event-д тэмдэглэх агент (үндсэн туслахад undefined) */
    agentId?: AgentId;
    agentLabel: { id: string; name: string; emoji: string };
    maxRounds?: number;
    effort?: 'low' | 'medium' | 'high';
    maxTokens?: number;
    /** Дотоод tool (delegate г.м.) — буцаавал data tool гүйцэтгэхгүй. */
    customTools?: Record<string, (args: Record<string, unknown>) => Promise<unknown>>;
}

export interface LoopResult {
    model: string;
    text: string;
    data: unknown;
    chartConfig: unknown;
    toolsUsed: string[];
    traceTools: TraceTool[];
    pendingActions: PendingAction[];
    clarification: Clarification | null;
    rounds: number;
    usage: { input: number; output: number; cacheRead: number };
    stopReason: string | null;
    interruption?: RunInterruption;
}

export async function runLoop(o: LoopOptions): Promise<LoopResult> {
    const input = toResponseInput(o.messages);
    const instructions = o.system.map((block) => block.text).join('\n\n');
    const responseTools = toResponseTools(o.tools);
    const allowedNames = new Set(o.tools.map((t) => t.name));
    const mutationResults = new Map<string, Anthropic.ToolResultBlockParam>();
    const toolsUsed: string[] = [];
    const traceTools: TraceTool[] = [];
    const pendingActions: PendingAction[] = [];
    const usage = { input: 0, output: 0, cacheRead: 0 };
    let data: unknown = null;
    let chartConfig: unknown = null;
    let clarification: Clarification | null = null;
    /** Раунд бүрийн текст — tool дуудлагын өмнөх «одоо шалгая…» маягийн товч тайлбар ХАДГАЛАГДАНА (ChatGPT/Claude маяг). */
    const textChunks: string[] = [];
    let stopReason: string | null = null;
    let interruption: RunInterruption | undefined;
    let usedModel = o.model;
    let rounds = 0;
    const maxRounds = o.maxRounds ?? MAX_ROUNDS;
    const streaming = o.streamText && !!o.ctx.onEvent;
    const emit = o.ctx.onEvent;
    let needSeparator = false;

    for (rounds = 1; rounds <= maxRounds; rounds++) {
        try {
            // Client цуцалсан → цааш GPT/DB дуудахгүй; хугацаа хэтэрсэн → байгаа хариугаар дуусгана.
            o.ctx.signal?.throwIfAborted();
            if (rounds > 1 && o.ctx.deadlineAt && Date.now() > o.ctx.deadlineAt) {
                throw new DOMException('AI deadline reached', 'TimeoutError');
            }
            let first = true;
            const msg = await streamResponse({
                model: o.model, instructions, input, tools: responseTools,
                signal: o.ctx.signal, deadlineAt: o.ctx.deadlineAt,
                effort: o.effort, maxTokens: o.maxTokens,
                onText: streaming ? (delta) => {
                    if (!delta) return;
                    if (first && needSeparator) emit!({ type: 'token', text: '\n\n' });
                    first = false;
                    emit!({ type: 'token', text: delta });
                } : undefined,
            });
            usage.input += msg.usage?.input_tokens ?? 0;
            usedModel = msg.model || o.model;
            usage.output += msg.usage?.output_tokens ?? 0;
            usage.cacheRead += msg.usage?.input_tokens_details.cached_tokens ?? 0;
            stopReason = msg.status ?? null;
            const roundText = responseText(msg);
            if (roundText) { textChunks.push(roundText); needSeparator = true; }
            const toolUses = msg.output.filter((item) => item.type === 'function_call').map((item) => ({
                id: item.call_id, name: item.name, arguments: item.arguments,
            }));
            // Preserve encrypted reasoning and exact call IDs across every tool round.
            input.push(...msg.output.filter((item) => item.type === 'message' || item.type === 'reasoning' || item.type === 'function_call'));
            if (toolUses.length === 0) break;

            // Бичих үйлдлүүдийг дарааллаар гүйцэтгэнэ; тодруулга шаардвал бусад үйлдлийг хүлээлгэнэ.
            const execute = async (tu: typeof toolUses[number]): Promise<Anthropic.ToolResultBlockParam> => {
                o.ctx.signal?.throwIfAborted();
                if (o.ctx.deadlineAt && Date.now() >= o.ctx.deadlineAt) throw new DOMException('AI deadline reached', 'TimeoutError');
                let args: Record<string, unknown>;
                try {
                    const parsed: unknown = JSON.parse(tu.arguments);
                    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Invalid arguments');
                    args = parsed as Record<string, unknown>;
                } catch {
                    return { type: 'tool_result', tool_use_id: tu.id, content: JSON.stringify({ error: 'Tool аргумент буруу JSON object байна. Үйлдэл хийгдээгүй.' }), is_error: true };
                }
                if (!allowedNames.has(tu.name)) return { type: 'tool_result', tool_use_id: tu.id, content: JSON.stringify({ error: 'Энэ агентад зөвшөөрөөгүй үйлдэл.' }), is_error: true };
                const mutationKey = `${tu.name}:${JSON.stringify(args, (_key, value) => value && typeof value === 'object' && !Array.isArray(value) ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b))) : value)}`;
                const previous = mutationResults.get(mutationKey);
                if (previous) return { ...previous, tool_use_id: tu.id };
                const started = Date.now();
                toolsUsed.push(tu.name);

                // ask_user — тодруулга: loop-ийг зогсооно.
                if (tu.name === ASK_USER_TOOL.name) {
                    const options = Array.isArray(args.options) ? (args.options as unknown[]).map(String).filter(Boolean).slice(0, 5) : [];
                    clarification = { question: String(args.question || ''), options };
                    emit?.({ type: 'clarify', question: clarification.question, options });
                    return { type: 'tool_result', tool_use_id: tu.id, content: 'Асуулт хэрэглэгчид харуулагдлаа. Хариугаа энд дуусга.' };
                }

                emit?.({ type: 'tool_start', id: tu.id, tool: tu.name, args, agentId: o.agentId });

                // Давхар pending үйлдэл үүсгэхгүй.
                const dupKey = `${tu.name}:${JSON.stringify(args)}`;
                if (pendingActions.some((p) => `${p.tool}:${JSON.stringify(p.args)}` === dupKey)) {
                    emit?.({ type: 'tool_done', id: tu.id, tool: tu.name, ok: true, summary: 'Баталгаажуулалт хүлээж байна', latencyMs: 0, agentId: o.agentId });
                    return { type: 'tool_result', tool_use_id: tu.id, content: JSON.stringify({ status: 'awaiting_user_confirmation', note: 'Аль хэдийн баталгаажуулалт хүлээж байна. Дахин бүү дууд.' }) };
                }

                let result: unknown;
                let isError = false;
                try {
                    result = o.customTools?.[tu.name]
                        ? await o.customTools[tu.name](args)
                        // Эрсдэл багатай (AUTO) tool → картгүй шууд гүйцэтгэнэ (audit бичигдэнэ); бусад mutating → preview.
                        : await executeDataTool(tu.name, args, o.ctx.shopId, o.ctx.perms, o.ctx.userId, AUTO_SET.has(tu.name), o.ctx.userName || '');
                } catch (e) {
                    isError = true;
                    result = { error: e instanceof Error ? e.message : 'Tool алдаа' };
                    logger.error('[Orchestrator] tool failed', { tool: tu.name, error: result });
                }

                const r = result as { requiresConfirmation?: boolean; action?: { tool: string; args?: Record<string, unknown> }; label?: string; preview?: Record<string, unknown> } | null;
                let content: string;
                if (r && r.requiresConfirmation && r.action) {
                    pendingActions.push({
                        id: randomUUID(), tool: r.action.tool, args: r.action.args || {}, label: r.label || 'Үйлдэл', preview: r.preview || {},
                        agentId: o.agentLabel.id, agentName: o.agentLabel.name, emoji: o.agentLabel.emoji,
                    });
                    content = JSON.stringify({ status: 'awaiting_user_confirmation', label: r.label, preview: r.preview, note: 'Хэрэглэгч UI картаас батална. Энэ tool-ыг ДАХИН БҮҮ ДУУД; товч мэдэгд.' });
                } else {
                    content = JSON.stringify(result ?? null);
                    if (!o.customTools?.[tu.name]) {
                        data = result;
                        chartConfig = generateChartConfig(tu.name, args, result) || chartConfig;
                    }
                }
                const s = summarizeToolResult(tu.name, result);
                const latencyMs = Date.now() - started;
                traceTools.push({ tool: tu.name, agentId: o.agentId ?? 'main', ok: s.ok && !isError, latencyMs, summary: s.summary });
                emit?.({ type: 'tool_done', id: tu.id, tool: tu.name, ok: s.ok && !isError, summary: s.summary, latencyMs, agentId: o.agentId });
                // Хэт том үр дүнг таслана (контекст хамгаалалт, ~40k тэмдэгт).
                if (content.length > 40_000) content = content.slice(0, 40_000) + '…[тасалсан]';
                const output: Anthropic.ToolResultBlockParam = { type: 'tool_result', tool_use_id: tu.id, content, is_error: isError || !s.ok || undefined };
                if (MUTATING_TOOL_NAMES.includes(tu.name)) mutationResults.set(mutationKey, output);
                return output;
            };
            // Reads can run together; writes execute in model order to avoid racing dependent changes.
            const readsOnly = toolUses.every((tu) => !MUTATING_TOOL_NAMES.includes(tu.name) && !o.customTools?.[tu.name]);
            const results: Anthropic.ToolResultBlockParam[] = [];
            const question = toolUses.find((tu) => tu.name === ASK_USER_TOOL.name);
            if (question) results.push(await execute(question));
            else if (readsOnly) results.push(...await Promise.all(toolUses.map(execute)));
            else for (const tu of toolUses) results.push(await execute(tu));
            input.push(...results.map((r) => ({ type: 'function_call_output' as const, call_id: r.tool_use_id, output: String(r.content ?? '') })));


            if (clarification) break;
        } catch (error) {
            // A later provider/deadline failure does not undo earlier DB work or pending previews.
            if (!traceTools.length && !pendingActions.length) throw error;
            const { code, message } = describeOpenAIError(error);
            interruption = { code, message };
            stopReason = 'interrupted';
            logger.warn('[Orchestrator] returning partial results', { code, tools: traceTools.length });
            break;
        }
    }

    let finalText = textChunks.join('\n\n').trim();
    if (!interruption && rounds > maxRounds && (o.ctx.signal?.aborted || (o.ctx.deadlineAt && Date.now() >= o.ctx.deadlineAt - 2000))) {
        const { code, message } = describeOpenAIError(new DOMException('AI deadline reached', 'TimeoutError'));
        interruption = { code, message };
        stopReason = 'interrupted';
    }
    if (!interruption && rounds > maxRounds && !o.ctx.signal?.aborted && (!o.ctx.deadlineAt || Date.now() < o.ctx.deadlineAt - 2000)) {
        // Раундын хязгаар — цуглуулсан мэдээллээр эцсийн хариу бичүүлнэ (tool-гүй).
        try {
            const closing = await streamResponse({
                model: o.model, maxTokens: 2000, instructions, tools: [],
                input: [...input, { role: 'user', content: 'Tool дуудлагын хязгаарт хүрлээ. Цуглуулсан мэдээлэлдээ үндэслэн хийгдсэн болон хүлээгдэж буй ажлыг ялгаж монголоор товч бич.' }],
                signal: o.ctx.signal, deadlineAt: o.ctx.deadlineAt, effort: 'low',
            });
            const conclusion = responseText(closing);
            finalText = [finalText, conclusion].filter(Boolean).join('\n\n');
            if (streaming && conclusion) emit!({ type: 'token', text: (needSeparator ? '\n\n' : '') + conclusion });
            usage.input += closing.usage?.input_tokens ?? 0;
            usage.output += closing.usage?.output_tokens ?? 0;
            usage.cacheRead += closing.usage?.input_tokens_details.cached_tokens ?? 0;
        } catch (error) {
            const { code, message } = describeOpenAIError(error);
            interruption = { code, message };
            stopReason = 'interrupted';
        }
    }
    if (interruption) {
        const actions = traceTools.filter(t => MUTATING_TOOL_NAMES.includes(t.tool));
        finalText = [
            'Ажиллагаа бүрэн дууссангүй. Өмнө хийгдсэн үйлдлийг дахин ажиллуулахгүйгээр бүртгэлээ шалгаад үргэлжлүүлнэ үү.',
            ...actions.map(t => `- ${t.ok ? '✓' : '⚠'} ${t.summary}`),
            pendingActions.length ? `${pendingActions.length} үйлдэл гүйцэтгэгдээгүй, таны баталгаажуулалтыг хүлээж байна.` : '',
        ].filter(Boolean).join('\n');
        if (streaming) { emit!({ type: 'token_reset' }); emit!({ type: 'token', text: finalText }); }
    }
    if (!finalText.trim()) {
        if (pendingActions.length > 0) finalText = `${pendingActions.length} үйлдэл таны баталгаажуулалтыг хүлээж байна — доорх картаас зөвшөөрнө үү.`;
        else if (clarification) finalText = '';
        else if (data) finalText = 'Мэдээллийг цуглууллаа, гэвч дүгнэлт бичиж амжсангүй. Асуултаа арай тодорхой болгоод дахин илгээнэ үү.';
        else throw new Error('Empty model response');
    }

    return { model: usedModel, text: finalText, data, chartConfig, toolsUsed, traceTools, pendingActions, clarification, interruption, rounds: Math.min(rounds, maxRounds), usage, stopReason };
}

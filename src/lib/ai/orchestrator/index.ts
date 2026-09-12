/**
 * AI Orchestrator v3 — ГИБРИД (Claude)
 *
 * Нэг үндсэн туслах (claude-opus-5) хэрэглэгчийн эрхэд тохирсон БҮХ data tool-той
 * agentic loop ажиллуулж, хариугаа шууд stream-лэнэ. Нарийн олон домэйны шинжилгээнд
 * модель өөрөө `delegate_to_specialists`-ээр мэргэшсэн дэд агентуудыг (Sonnet) ЗЭРЭГ
 * ажиллуулж, үр дүнг нь өөрөө нэгтгэнэ. Planner/synthesizer дуудлага байхгүй.
 */

import { logger } from '@/lib/utils/logger';
import { MAIN_MODEL } from '@/lib/ai/claude/client';
import { dataToolsForPerms, ASK_USER_TOOL, buildDelegateTool, DELEGATE_TOOL_NAME } from '@/lib/ai/claude/tools';
import { getShopMemory, formatShopMemory } from '@/lib/ai/data-assistant/functions';
import { AGENTS, AGENT_LIST } from './agents';
import { runAgent } from './runAgent';
import { runLoop, buildHistory, buildUserContent } from './loop';
import { buildSystemBlocks } from './prompt';
import type { AgentBadge, AgentId, OrchestratorContext, OrchestratorResult, PendingAction, TraceStep } from './types';

const MAIN_BADGE: AgentBadge = { id: 'main', name: 'AI туслах', emoji: '✨', color: 'violet' };

export async function runOrchestrator(message: string, ctx: OrchestratorContext): Promise<OrchestratorResult> {
    const started = Date.now();

    // 0. Урт хугацааны shop memory → системийн мэдлэгт (best-effort).
    try {
        const memText = formatShopMemory(await getShopMemory(ctx.shopId));
        if (memText) ctx = { ...ctx, shopKnowledge: [ctx.shopKnowledge, memText].filter(Boolean).join('\n\n') };
    } catch { /* хүснэгт байхгүй бол алгасна */ }

    // 1. Tool-ууд: data (RBAC) + ask_user + delegate (super_admin биш бол admin агентыг жагсаалтаас хасна).
    const roster = AGENT_LIST.filter((a) => ctx.perms.role === 'super_admin' || !(a.adminToolNames?.length && a.readToolNames.length <= 1));
    const tools = [...dataToolsForPerms(ctx.perms), ASK_USER_TOOL, buildDelegateTool(roster)];

    const steps: TraceStep[] = [];
    const subResults: Array<{ agentId: AgentId; pendingActions: PendingAction[]; data: unknown; chartConfig: unknown }> = [];

    // 2. Дэд агентуудыг зэрэг ажиллуулах дотоод tool.
    const delegate = async (args: Record<string, unknown>) => {
        const tasks = (Array.isArray(args.tasks) ? args.tasks : []) as Array<{ agent?: string; task?: string }>;
        const valid = tasks
            .filter((t) => t && typeof t.agent === 'string' && AGENTS[t.agent as AgentId] && roster.some((r) => r.id === t.agent))
            .slice(0, 4);
        if (valid.length === 0) return { error: 'Хүчинтэй дэд агент/даалгавар алга. Өөрөө tool дуудаж үргэлжлүүл.' };
        if (ctx.deadlineAt && Date.now() > ctx.deadlineAt - 15_000) return { error: 'Хугацаа хүрэлцэхгүй тул дэд агент ажиллуулахгүй — өөрөө шууд tool дуудаж товч хариул.' };
        ctx.onEvent?.({ type: 'status', text: `${valid.length} мэргэжилтэн зэрэг ажиллаж байна…` });
        const results = await Promise.all(valid.map(async (t) => {
            const agent = AGENTS[t.agent as AgentId];
            const r = await runAgent(agent, String(t.task || message), { ...ctx, onEvent: ctx.onEvent });
            steps.push({ agentId: agent.id, agentName: agent.name, emoji: agent.emoji, color: agent.color, task: String(t.task || ''), toolsUsed: r.toolsUsed, latencyMs: r.latencyMs, tokens: r.tokens, ok: r.ok, error: r.error });
            subResults.push({ agentId: agent.id, pendingActions: r.pendingActions, data: r.data, chartConfig: r.chartConfig });
            return { agent: agent.id, name: agent.name, ok: r.ok, result: r.ok ? r.text : `(алдаа: ${r.error})`, pending_actions: r.pendingActions.map((p) => p.label) };
        }));
        return { results, note: 'Дээрх дүгнэлтүүдийг нэгтгэж хэрэглэгчид нэг цэгцтэй хариу бич. Дэд агентын санал болгосон үйлдлүүд аль хэдийн баталгаажуулалт хүлээж байна — дахин бүү дууд.' };
    };

    // 3. Үндсэн loop.
    const system = buildSystemBlocks(ctx);
    const messages = [...buildHistory(ctx.history), { role: 'user' as const, content: await buildUserContent(message, ctx.attachments) }];
    const r = await runLoop({
        model: MAIN_MODEL, system, tools, messages, ctx, streamText: true,
        agentLabel: { id: 'main', name: MAIN_BADGE.name, emoji: MAIN_BADGE.emoji },
        customTools: { [DELEGATE_TOOL_NAME]: delegate },
    });

    const pendingActions = [...r.pendingActions, ...subResults.flatMap((s) => s.pendingActions)];
    const agentsUsed: AgentBadge[] = [MAIN_BADGE, ...steps.filter((s) => s.ok).map((s) => ({ id: s.agentId, name: s.agentName, emoji: s.emoji, color: s.color }))];
    const totalTokens = r.usage.input + r.usage.output + steps.reduce((a, s) => a + s.tokens, 0);
    const withData = r.data ?? subResults.find((s) => s.data)?.data ?? null;
    const withChart = r.chartConfig ?? subResults.find((s) => s.chartConfig)?.chartConfig ?? null;

    logger.info('[Orchestrator] done', { rounds: r.rounds, tools: r.toolsUsed, steps: steps.map((s) => s.agentId), ms: Date.now() - started });

    return {
        text: r.text,
        data: withData,
        chartConfig: withChart,
        agentsUsed,
        pendingActions,
        clarification: r.clarification,
        trace: {
            model: MAIN_MODEL,
            rounds: r.rounds,
            tools: r.traceTools,
            steps,
            totalLatencyMs: Date.now() - started,
            totalTokens,
            inputTokens: r.usage.input,
            outputTokens: r.usage.output,
            cacheReadTokens: r.usage.cacheRead,
            summaryUsed: !!ctx.conversationSummary,
        },
    };
}

export * from './types';

/**
 * Дэд агент (specialist) — үндсэн туслах `delegate_to_specialists`-ээр дуудахад
 * тухайн агентын фокустай заавар + tool дэд олонлогоор Claude (FAST_MODEL) дээр
 * тусдаа loop ажиллуулна. Streaming текст байхгүй (эцсийн хариу үндсэн туслахад очно),
 * гэхдээ tool_start/tool_done/step_* event-үүд UI руу явна.
 */

import { logger } from '@/lib/utils/logger';
import { FAST_MODEL } from '@/lib/ai/claude/client';
import { dataToolsForPerms, pickTools } from '@/lib/ai/claude/tools';
import { buildSystemBlocks } from './prompt';
import { runLoop, buildHistory, buildUserContent } from './loop';
import type { AgentDefinition, AgentRunResult, OrchestratorContext } from './types';

export { buildHistory };
export { isAllowedAttachmentUrl } from './loop';

/** Агентад зөвшөөрөгдсөн tool-уудын нэрс (perms-ийг харгалзана). */
export function agentToolNames(agent: AgentDefinition, perms: OrchestratorContext['perms']): string[] {
    return [
        ...agent.readToolNames,
        ...(perms.canWrite ? agent.writeToolNames : []),
        ...(perms.canDelete ? agent.deleteToolNames || [] : []),
        ...(perms.role === 'super_admin' ? agent.adminToolNames || [] : []),
    ];
}

export async function runAgent(agent: AgentDefinition, task: string, ctx: OrchestratorContext): Promise<AgentRunResult> {
    const started = Date.now();
    ctx.onEvent?.({ type: 'step_start', agentId: agent.id, agentName: agent.name, task });
    try {
        const tools = pickTools(dataToolsForPerms(ctx.perms), agentToolNames(agent, ctx.perms));
        const system = buildSystemBlocks(ctx, { personaOverride: agent.buildInstruction(undefined), includeDomainNotes: true });
        const messages = [...buildHistory(ctx.history, 6), { role: 'user' as const, content: await buildUserContent(task, ctx.attachments) }];
        const r = await runLoop({
            model: FAST_MODEL, system, tools, messages, ctx, streamText: false, agentId: agent.id,
            agentLabel: { id: agent.id, name: agent.name, emoji: agent.emoji }, maxRounds: 6, effort: 'medium', maxTokens: 4000,
        });
        const latencyMs = Date.now() - started;
        ctx.onEvent?.({ type: 'step_done', agentId: agent.id, agentName: agent.name, ok: true, latencyMs, toolsUsed: r.toolsUsed });
        return { text: r.text, data: r.data, chartConfig: r.chartConfig, toolsUsed: r.toolsUsed, latencyMs, tokens: r.usage.input + r.usage.output, ok: true, pendingActions: r.pendingActions };
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        logger.error('[Orchestrator] sub-agent failed', { agent: agent.id, error: message });
        const latencyMs = Date.now() - started;
        ctx.onEvent?.({ type: 'step_done', agentId: agent.id, agentName: agent.name, ok: false, latencyMs, toolsUsed: [], error: message });
        return { text: '', data: null, chartConfig: null, toolsUsed: [], latencyMs, tokens: 0, ok: false, error: message, pendingActions: [] };
    }
}

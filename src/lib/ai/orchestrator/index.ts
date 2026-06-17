/**
 * AI Orchestrator — entry point
 *
 * 1. Planner хүсэлтийг шинжилж аль agent(ууд)-ыг дуудахыг шийднэ.
 * 2. Сонгогдсон agent-ууд дараалан гүйцэтгэнэ (өмнөх үр дүнг контекст болгож дамжуулна).
 * 3. Нэгээс олон agent ажилласан бол синтезатор хариуг нэгтгэнэ.
 * 4. Бүх алхмын ил тод мөшгилт (trace) болон ашигласан agent-уудыг буцаана.
 */

import { GoogleGenerativeAI } from '@google/generative-ai';
import { logger } from '@/lib/utils/logger';
import { AGENTS } from './agents';
import { runAgent } from './runAgent';
import { planRequest } from './planner';
import { withRetry } from './retry';
import type {
    AgentBadge, AgentRunResult, OrchestratorContext,
    OrchestratorResult, OrchestrationTrace, TraceStep, PendingAction,
} from './types';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
const SYNTH_MODEL = 'gemini-2.5-flash';

/** Олон agent-ийн хариуг нэг цэгцтэй монгол хариу болгон нэгтгэнэ. */
async function synthesize(
    message: string,
    parts: Array<{ name: string; emoji: string; text: string }>,
): Promise<{ text: string; latencyMs: number; tokens: number }> {
    const started = Date.now();
    const model = genAI.getGenerativeModel({
        model: SYNTH_MODEL,
        systemInstruction: `Та бол Vertmon Hub-ийн ОРЧЕСТРАТОР нэгтгэгч. Доорх мэргэжилтэн agent-уудын хариуг нэг цэгцтэй, давхардалгүй, монгол хариу болгон нэгтгэ.
ДҮРЭМ: монголоор; мөнгийг ₮ форматаар; хүснэгт/жагсаалтаар цэгцэл; шинэ мэдээлэл зохиохгүй, зөвхөн өгөгдсөн хариунуудыг ухаалгаар нэгтгэ.`,
        generationConfig: { temperature: 0.4, maxOutputTokens: 2048 },
    });

    const composed = parts.map((p) => `### ${p.emoji} ${p.name}\n${p.text}`).join('\n\n');
    const result = await withRetry(() => model.generateContent(
        `Хэрэглэгчийн асуулт: ${message}\n\nМэргэжилтнүүдийн хариу:\n${composed}\n\nДээрхийг нэгтгэн эцсийн хариу бэлдэнэ үү.`,
    ));
    return {
        text: result.response.text(),
        latencyMs: Date.now() - started,
        tokens: result.response?.usageMetadata?.totalTokenCount ?? 0,
    };
}

/**
 * Orchestrator-ийн үндсэн entry. Хүсэлтийг agent-уудад замчилж, нэгтгэж, мөшгилттэй буцаана.
 */
export async function runOrchestrator(
    message: string,
    ctx: OrchestratorContext,
): Promise<OrchestratorResult> {
    const orchestratorStart = Date.now();

    // 1. Plan
    const { plan, latencyMs: plannerLatencyMs, model: plannerModel } = await planRequest(message, ctx);
    logger.info('[Orchestrator] Plan', { steps: plan.steps.map((s) => s.agentId) });

    // 2. Execute steps sequentially; feed prior outputs as context to later steps
    const traceSteps: TraceStep[] = [];
    const runResults: Array<{ agentId: string; name: string; emoji: string; result: AgentRunResult }> = [];
    const priorOutputs: string[] = [];
    let totalTokens = 0;

    for (const step of plan.steps) {
        const agent = AGENTS[step.agentId];
        if (!agent) continue;

        const task = priorOutputs.length > 0
            ? `${step.task}\n\n[Өмнөх мэргэжилтнүүдийн олж тогтоосон зүйл — давхардуулахгүйгээр ашигла]:\n${priorOutputs.join('\n---\n')}`
            : step.task;

        const result = await runAgent(agent, task, ctx);
        totalTokens += result.tokens;
        runResults.push({ agentId: agent.id, name: agent.name, emoji: agent.emoji, result });
        if (result.ok && result.text) priorOutputs.push(`${agent.name}: ${result.text}`);

        traceSteps.push({
            agentId: agent.id,
            agentName: agent.name,
            emoji: agent.emoji,
            color: agent.color,
            task: step.task,
            toolsUsed: result.toolsUsed,
            latencyMs: result.latencyMs,
            tokens: result.tokens,
            ok: result.ok,
            error: result.error,
        });
    }

    // 3. Compose the final answer
    let finalText: string;
    let synthesisUsed = false;
    let synthesisLatencyMs = 0;

    const okResults = runResults.filter((r) => r.result.ok && r.result.text);
    if (okResults.length === 0) {
        finalText = 'Уучлаарай, хариу бэлдэх үед алдаа гарлаа. Дахин оролдоно уу.';
    } else if (okResults.length === 1) {
        finalText = okResults[0].result.text;
    } else {
        try {
            const synth = await synthesize(
                message,
                okResults.map((r) => ({ name: r.name, emoji: r.emoji, text: r.result.text })),
            );
            finalText = synth.text;
            synthesisUsed = true;
            synthesisLatencyMs = synth.latencyMs;
            totalTokens += synth.tokens;
        } catch (error) {
            logger.error('[Orchestrator] Synthesis failed, concatenating', {
                error: error instanceof Error ? error.message : 'unknown',
            });
            finalText = okResults.map((r) => `${r.emoji} **${r.name}**\n${r.result.text}`).join('\n\n');
        }
    }

    // 4. Pick first data/chart produced by a successful step (for visualization)
    const withChart = runResults.find((r) => r.result.ok && r.result.chartConfig);
    const withData = runResults.find((r) => r.result.ok && r.result.data);

    // Бүх алхмаас баталгаажуулалт хүлээж буй үйлдлүүдийг цуглуулна.
    const pendingActions: PendingAction[] = runResults.flatMap((r) => r.result.pendingActions || []);

    const agentsUsed: AgentBadge[] = runResults
        .filter((r) => r.result.ok)
        .map((r) => ({ id: r.agentId as AgentBadge['id'], name: r.name, emoji: r.emoji, color: AGENTS[r.agentId as AgentBadge['id']].color }));

    const trace: OrchestrationTrace = {
        plannerReasoning: plan.reasoning,
        plannerLatencyMs,
        plannerModel,
        steps: traceSteps,
        synthesisUsed,
        synthesisLatencyMs,
        totalLatencyMs: Date.now() - orchestratorStart,
        totalTokens,
    };

    return {
        text: finalText,
        data: withData?.result.data ?? null,
        chartConfig: withChart?.result.chartConfig ?? null,
        agentsUsed,
        trace,
        pendingActions,
    };
}

export * from './types';

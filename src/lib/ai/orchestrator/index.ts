/**
 * AI Orchestrator — entry point
 *
 * 1. Planner хүсэлтийг шинжилж аль agent(ууд)-ыг дуудахыг шийднэ.
 * 2. Сонгогдсон agent-ууд дараалан гүйцэтгэнэ (өмнөх үр дүнг контекст болгож дамжуулна).
 * 3. Нэгээс олон agent ажилласан бол синтезатор хариуг нэгтгэнэ.
 * 4. Бүх алхмын ил тод мөшгилт (trace) болон ашигласан agent-уудыг буцаана.
 */

import { GoogleGenerativeAI } from '@google/generative-ai';
import { GEMINI_FLASH } from '@/lib/ai/config/models';
import { logger } from '@/lib/utils/logger';
import { AGENTS } from './agents';
import { runAgent } from './runAgent';
import { planRequest } from './planner';
import { withRetry } from './retry';
import { getShopMemory, formatShopMemory } from '@/lib/ai/data-assistant/functions';
import type {
    AgentBadge, AgentRunResult, OrchestratorContext,
    OrchestratorResult, OrchestrationTrace, TraceStep, PendingAction,
} from './types';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
const SYNTH_MODEL = GEMINI_FLASH;

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

    // 0. Урт хугацааны shop memory-г контекстод нэмнэ (агентууд санана)
    try {
        const memText = formatShopMemory(await getShopMemory(ctx.shopId));
        if (memText) ctx = { ...ctx, shopKnowledge: [ctx.shopKnowledge, memText].filter(Boolean).join('\n\n') };
    } catch { /* memory багана/хүснэгт байхгүй бол алгасна */ }

    // 1. Plan
    const { plan, latencyMs: plannerLatencyMs, model: plannerModel } = await planRequest(message, ctx);
    logger.info('[Orchestrator] Plan', { steps: plan.steps.map((s) => s.agentId) });

    // 2. Agent-уудыг ЗЭРЭГЦЭЭ ажиллуулна.
    //
    // ЗАСВАР (2026-08-22): өмнө нь `for` гогцоогоор ДАРААЛАН ажиллуулж, өмнөх
    // алхмын хариуг дараагийнх руу дамжуулдаг байв. Гэвч planner нь ӨӨР ӨӨР
    // ДОМЭЙНЫ мэргэжилтнүүдийг (байр / CRM / санхүү) сонгодог тул тэдгээр нь
    // бие биенээсээ хамаардаггүй — нэгтгэлийг synthesizer аль хэдийн хийдэг.
    // Дарааллын үр дүнд planner + 3 agent (тус бүр 6 хүртэл tool round) +
    // synthesizer = 5+ дараалсан Gemini дуудлага болж, Vercel-ийн хугацааны
    // хязгаарт амархан унадаг байв. Одоо нийт хугацаа = ХАМГИЙН УДААН agent.
    const steps = plan.steps.filter((s) => AGENTS[s.agentId]);

    ctx.onProgress?.({
        type: 'planned',
        reasoning: plan.reasoning,
        agents: steps.map((s) => ({
            id: s.agentId,
            name: AGENTS[s.agentId].name,
            emoji: AGENTS[s.agentId].emoji,
        })),
    });

    const settled = await Promise.all(
        steps.map(async (step) => {
            const agent = AGENTS[step.agentId];
            const result = await runAgent(agent, step.task, ctx);
            // Agent бүр дуусмагц клиентэд шууд мэдэгдэнэ (зэрэгцээ дуусна).
            ctx.onProgress?.({
                type: 'agent_done',
                agentId: agent.id,
                name: agent.name,
                emoji: agent.emoji,
                ok: result.ok,
                latencyMs: result.latencyMs,
            });
            return result;
        }),
    );

    const traceSteps: TraceStep[] = [];
    const runResults: Array<{ agentId: string; name: string; emoji: string; result: AgentRunResult }> = [];
    let totalTokens = 0;

    steps.forEach((step, i) => {
        const agent = AGENTS[step.agentId];
        const result = settled[i];
        totalTokens += result.tokens;
        runResults.push({ agentId: agent.id, name: agent.name, emoji: agent.emoji, result });

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
    });

    // 3. Compose the final answer
    let finalText: string;
    let synthesisUsed = false;
    let synthesisLatencyMs = 0;

    const okResults = runResults.filter((r) => r.result.ok && r.result.text);
    if (steps.length === 0) {
        // Хэрэглэгчийн эрхэд тохирох agent олдсонгүй — «алдаа гарлаа» гэхийн
        // оронд шалтгааныг нь хэлнэ (planner.ts allowedAgentsFor-оор шүүдэг).
        finalText =
            'Таны эрхээр ажиллах AI мэргэжилтэн тохируулагдаагүй байна. ' +
            'Админаас модулийн эрхээ шалгуулна уу.';
    } else if (okResults.length === 0) {
        // Бүх agent унасан — шалтгааныг ялгаж ойлгомжтой мессеж өгнө.
        const rateLimited = runResults.some((r) => /429|rate.?limit|quota|overloaded|503/i.test(r.result.error || ''));
        finalText = rateLimited
            ? '⏳ AI систем түр ачаалалтай байна. 30 секунд орчим хүлээгээд дахин асуугаарай.'
            : 'Уучлаарай, хариу бэлдэх үед алдаа гарлаа. Дахин оролдоно уу.';
    } else if (okResults.length === 1) {
        finalText = okResults[0].result.text;
    } else {
        try {
            ctx.onProgress?.({ type: 'synthesizing' });
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
    // Зэрэгцээ ажилласан хоёр agent ижил үйлдлийг санал болговол (жишээ:
    // my-work ба crm-specialist хоёулаа нэг лийдэд дагалт товлох) хэрэглэгчид
    // ХОЁР ижил баталгаажуулалтын карт харагдана — tool+args-аар давхардлыг
    // арилгана.
    const seenActions = new Set<string>();
    const pendingActions: PendingAction[] = runResults
        .flatMap((r) => r.result.pendingActions || [])
        .filter((a) => {
            const key = `${a.tool}:${JSON.stringify(a.args, Object.keys(a.args || {}).sort())}`;
            if (seenActions.has(key)) return false;
            seenActions.add(key);
            return true;
        });

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

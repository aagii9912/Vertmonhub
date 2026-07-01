/**
 * AI Orchestrator — planner (замчилагч)
 *
 * Хэрэглэгчийн хүсэлтийг шинжилж, аль мэргэшсэн agent(ууд)-ыг ямар дарааллаар
 * дуудах төлөвлөгөөг (JSON) гаргана. Хямд, хурдан Gemini дуудалт.
 */

import { GoogleGenerativeAI, SchemaType } from '@google/generative-ai';
import { logger } from '@/lib/utils/logger';
import { AGENTS, AGENT_LIST } from './agents';
import { withRetry } from './retry';
import type { AgentId, OrchestrationPlan, OrchestratorContext } from './types';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
const PLANNER_MODEL = 'gemini-3.5-flash';
const MAX_STEPS = 3;

const VALID_IDS = new Set<string>(AGENT_LIST.map((a) => a.id));

function buildPlannerInstruction(): string {
    const roster = AGENT_LIST
        .map((a) => `- ${a.id}: ${a.name} ${a.emoji} — ${a.description}`)
        .join('\n');

    return `Та бол Vertmon Hub-ийн ОРЧЕСТРАТОР замчилагч. Хэрэглэгчийн хүсэлтийг доорх мэргэшсэн agent-уудад хуваарилах төлөвлөгөө гарга.

БОЛОМЖИТ AGENT-УУД:
${roster}

ДҮРЭМ:
1. Хамгийн цөөн agent-ээр зорилгод хүр. Энгийн асуултад 1 agent хангалттай.
2. Хүсэлт хэд хэдэн домэйн хамарвал (жишээ: "борлуулалт ба лийдийн дүр зураг") олон agent (хамгийн ихдээ ${MAX_STEPS}) сонго.
3. Маркетинг, стратеги, контент, ерөнхий/бүтээлч асуултад 'advisor'-ыг сонго.
4. Тодорхой домэйн (байр / лийд+харилцагч / гэрээ+санхүү) бол тухайн мэргэжилтнийг сонго.
5. step бүрд тухайн agent-д өгөх тодорхой дэд даалгаврыг (монголоор) бич.
6. reasoning талбарт сонголтоо 1 өгүүлбэрээр товч тайлбарла.
7. ЗӨВХӨН дээрх жагсаалтын agent id-г ашигла.`;
}

const PLAN_SCHEMA = {
    type: SchemaType.OBJECT,
    properties: {
        reasoning: { type: SchemaType.STRING, description: 'Сонголтын товч үндэслэл (монголоор)' },
        steps: {
            type: SchemaType.ARRAY,
            description: 'Гүйцэтгэх алхмууд (дарааллаар)',
            items: {
                type: SchemaType.OBJECT,
                properties: {
                    agentId: { type: SchemaType.STRING, description: 'Agent-ийн ID' },
                    task: { type: SchemaType.STRING, description: 'Тухайн agent-д өгөх дэд даалгавар' },
                },
                required: ['agentId', 'task'],
            },
        },
    },
    required: ['reasoning', 'steps'],
} as const;

/** Хүсэлтийг шинжилж гүйцэтгэлийн төлөвлөгөө гаргана. */
export async function planRequest(
    message: string,
    ctx: OrchestratorContext,
): Promise<{ plan: OrchestrationPlan; latencyMs: number; model: string }> {
    const started = Date.now();
    const fallback: OrchestrationPlan = {
        reasoning: 'Ерөнхий зөвлөх рүү шилжүүлэв (default).',
        steps: [{ agentId: 'advisor', task: message }],
    };

    try {
        const model = genAI.getGenerativeModel({
            model: PLANNER_MODEL,
            systemInstruction: buildPlannerInstruction(),
            generationConfig: {
                temperature: 0.1,
                maxOutputTokens: 1024,
                responseMimeType: 'application/json',
                responseSchema: PLAN_SCHEMA as any,
            },
        });

        const recent = (ctx.history || []).slice(-4)
            .map((m) => `${m.role === 'assistant' ? 'AI' : 'Хэрэглэгч'}: ${m.content}`).join('\n');
        const attachNote = (ctx.attachments && ctx.attachments.length)
            ? `\n[Хавсаргасан файл: ${ctx.attachments.map((a) => a.name || a.mimeType || 'файл').join(', ')}]`
            : '';
        const prompt = recent
            ? `Сүүлийн харилцаа:\n${recent}\n\nШинэ хүсэлт: ${message}${attachNote}`
            : `${message}${attachNote}`;

        const result = await withRetry(() => model.generateContent(prompt));
        const raw = JSON.parse(result.response.text()) as OrchestrationPlan;

        const steps = (raw.steps || [])
            .filter((s) => s && VALID_IDS.has(s.agentId))
            .slice(0, MAX_STEPS)
            .map((s) => ({ agentId: s.agentId as AgentId, task: (s.task || message).trim() }));

        if (steps.length === 0) {
            return { plan: fallback, latencyMs: Date.now() - started, model: PLANNER_MODEL };
        }

        return {
            plan: { reasoning: raw.reasoning || '', steps },
            latencyMs: Date.now() - started,
            model: PLANNER_MODEL,
        };
    } catch (error) {
        logger.error('[Orchestrator] Planner failed, using fallback', {
            error: error instanceof Error ? error.message : 'unknown',
        });
        return { plan: fallback, latencyMs: Date.now() - started, model: PLANNER_MODEL };
    }
}

export { AGENTS };

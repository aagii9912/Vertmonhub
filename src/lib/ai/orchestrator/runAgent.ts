/**
 * AI Orchestrator — generic agent runner
 *
 * Нэг agent-ийг Gemini дээр гүйцэтгэнэ: фокустай систем заавар + tool дэд олонлог
 * → function-calling давталт → tool гүйцэтгэл (data-assistant executeDataTool)
 * → эцсийн синтез. Latency, токен, ашигласан tool-уудыг мөшгилтөнд буцаана.
 */

import { GoogleGenerativeAI, Content } from '@google/generative-ai';
import { logger } from '@/lib/utils/logger';
import { readTools, writeTools } from '@/lib/ai/data-assistant/tools';
import { executeDataTool } from '@/lib/ai/data-assistant';
import { generateChartConfig } from '@/lib/ai/data-assistant/functions';
import type { AgentDefinition, AgentRunResult, OrchestratorContext } from './types';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
const AGENT_MODEL = 'gemini-2.5-flash';

/** Agent-ийн зөвшөөрөгдсөн tool тодорхойлолтуудыг бэлдэнэ (perms-ийг харгалзана). */
function resolveAgentTools(agent: AgentDefinition, canWrite: boolean) {
    const reads = readTools.filter((t: any) => agent.readToolNames.includes(t.name));
    const writes = canWrite
        ? writeTools.filter((t: any) => agent.writeToolNames.includes(t.name))
        : [];
    return [...reads, ...writes];
}

function tokensFrom(response: any): number {
    return response?.usageMetadata?.totalTokenCount ?? 0;
}

/**
 * Нэг agent-ийг даалгаврын дагуу гүйцэтгэнэ.
 */
export async function runAgent(
    agent: AgentDefinition,
    task: string,
    ctx: OrchestratorContext,
): Promise<AgentRunResult> {
    const started = Date.now();
    const toolsUsed: string[] = [];
    let tokens = 0;

    try {
        const tools = resolveAgentTools(agent, ctx.perms.canWrite);
        const model = genAI.getGenerativeModel({
            model: AGENT_MODEL,
            systemInstruction: agent.buildInstruction(ctx.shopKnowledge),
            ...(tools.length > 0 ? { tools: [{ functionDeclarations: tools }] } : {}),
            generationConfig: { temperature: agent.temperature, topP: 0.85, maxOutputTokens: 2048 },
        });

        const geminiHistory: Content[] = (ctx.history || [])
            .filter((m) => m.role && m.content)
            .map((m) => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] }));

        const chat = model.startChat({ history: geminiHistory });
        const result = await chat.sendMessage(task);
        tokens += tokensFrom(result.response);
        const functionCalls = result.response.functionCalls();

        if (functionCalls && functionCalls.length > 0) {
            const toolResponses = [];
            let data: any = null;
            let chartConfig: any = null;

            for (const fc of functionCalls) {
                toolsUsed.push(fc.name);
                const toolResult = await executeDataTool(fc.name, fc.args || {}, ctx.shopId, ctx.perms, ctx.userId);
                toolResponses.push({ functionResponse: { name: fc.name, response: { result: toolResult } } });
                data = toolResult;
                chartConfig = generateChartConfig(fc.name, fc.args || {}, toolResult) || chartConfig;
            }

            const synthesis = await chat.sendMessage(toolResponses.map((tr) => ({ functionResponse: tr.functionResponse })));
            tokens += tokensFrom(synthesis.response);

            return {
                text: synthesis.response.text(),
                data,
                chartConfig,
                toolsUsed,
                tokens,
                latencyMs: Date.now() - started,
                ok: true,
            };
        }

        return {
            text: result.response.text(),
            data: null,
            chartConfig: null,
            toolsUsed,
            tokens,
            latencyMs: Date.now() - started,
            ok: true,
        };
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        logger.error('[Orchestrator] Agent run failed', { agent: agent.id, error: message });
        return {
            text: `(${agent.name}-аас хариу авахад алдаа гарлаа: ${message})`,
            data: null,
            chartConfig: null,
            toolsUsed,
            tokens,
            latencyMs: Date.now() - started,
            ok: false,
            error: message,
        };
    }
}

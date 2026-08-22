/**
 * AI Orchestrator — generic agent runner
 *
 * Нэг agent-ийг Gemini дээр гүйцэтгэнэ: фокустай систем заавар + tool дэд олонлог
 * → function-calling давталт → tool гүйцэтгэл (data-assistant executeDataTool)
 * → эцсийн синтез. Latency, токен, ашигласан tool-уудыг мөшгилтөнд буцаана.
 */

import { GoogleGenerativeAI, Content } from '@google/generative-ai';
import { GEMINI_FLASH } from '@/lib/ai/config/models';
import { logger } from '@/lib/utils/logger';
import { readTools, writeTools, deleteTools, adminTools } from '@/lib/ai/data-assistant/tools';
import { executeDataTool } from '@/lib/ai/data-assistant';
import { generateChartConfig } from '@/lib/ai/data-assistant/functions';
import { randomUUID } from 'crypto';
import { withRetry } from './retry';
import type { AgentDefinition, AgentRunResult, OrchestratorContext, PendingAction } from './types';

/** Токен/зардлыг хязгаарлахын тулд агентад дамжуулах түүхийн дээд хэмжээ. */
const MAX_HISTORY = 10;

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
const AGENT_MODEL = GEMINI_FLASH;

/** Agent-ийн зөвшөөрөгдсөн tool тодорхойлолтуудыг бэлдэнэ (perms-ийг харгалзана). */
function resolveAgentTools(agent: AgentDefinition, perms: OrchestratorContext['perms']) {
    const reads = readTools.filter((t: any) => agent.readToolNames.includes(t.name));
    const writes = perms.canWrite
        ? writeTools.filter((t: any) => agent.writeToolNames.includes(t.name))
        : [];
    const deletes = perms.canDelete
        ? deleteTools.filter((t: any) => (agent.deleteToolNames || []).includes(t.name))
        : [];
    const admins = perms.role === 'super_admin'
        ? adminTools.filter((t: any) => (agent.adminToolNames || []).includes(t.name))
        : [];
    return [...reads, ...writes, ...deletes, ...admins];
}

function tokensFrom(response: any): number {
    return response?.usageMetadata?.totalTokenCount ?? 0;
}

/**
 * Gemini chat түүх бэлдэнэ: сүүлийн MAX_HISTORY мессеж, заавал 'user'-ээр эхэлнэ.
 * SDK-ийн validateChatHistory нь эхний мессеж 'user' биш бол startChat дээр ШУУД
 * шиддэг — slice() урт яриаг таслахдаа 'model'-оор эхлүүлбэл бүх хүсэлт 1ms-д
 * унадаг байсныг энэ trim засна.
 */
export function buildGeminiHistory(history?: { role: string; content: string }[]): Content[] {
    const mapped: Content[] = (history || [])
        .filter((m) => m.role && m.content)
        .slice(-MAX_HISTORY)
        .map((m) => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] }));
    while (mapped.length > 0 && mapped[0].role !== 'user') mapped.shift();
    return mapped;
}

/** Gemini inlineData-аар дамжуулж болох MIME (зураг + PDF). */
function isInlineSupported(mime?: string): boolean {
    if (!mime) return false;
    return mime.startsWith('image/') || mime === 'application/pdf';
}

/**
 * Хавсралтуудаас Gemini-д илгээх parts (текст даалгавар + inline зураг/PDF) бэлдэнэ.
 * Мөн файлын URL-ийг текстэд оруулж AI attach_file tool-д ашиглах боломжтой болгоно.
 */
async function buildMessageParts(task: string, attachments?: { url: string; name?: string; mimeType?: string }[]): Promise<any[]> {
    if (!attachments || attachments.length === 0) return [{ text: task }];

    const list = attachments.map((a, i) => `${i + 1}. ${a.name || 'файл'} — ${a.url}${a.mimeType ? ` (${a.mimeType})` : ''}`).join('\n');
    const note = `${task}\n\n[Хэрэглэгчийн хавсаргасан файлууд]:\n${list}\nХэрэв хэрэглэгч эдгээрийг бичлэгт хавсаргахыг хүсвэл attach_file tool-д file_url-ийг яг дээрх URL-ээс ав. Зураг/баримтыг шинжлэхийг хүсвэл агуулгад нь үндэслэн хариул.`;
    const parts: any[] = [{ text: note }];

    for (const att of attachments) {
        if (!isInlineSupported(att.mimeType)) continue;
        try {
            const res = await fetch(att.url);
            if (!res.ok) continue;
            const buf = await res.arrayBuffer();
            // Хэт том файлыг алгасна (~8MB)
            if (buf.byteLength > 8 * 1024 * 1024) continue;
            const base64 = Buffer.from(buf).toString('base64');
            parts.push({ inlineData: { data: base64, mimeType: att.mimeType } });
        } catch {
            // Татаж чадахгүй бол алгасна — URL текстэд хэвээр байгаа
        }
    }
    return parts;
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
    const pendingActions: PendingAction[] = [];
    let tokens = 0;

    try {
        const tools = resolveAgentTools(agent, ctx.perms);
        // Агентад одоогийн хэрэглэгчийн эрхийг ФАКТ болгож дамжуулна. Ингэснээр
        // (ялангуяа admin agent) хэрэглэгчээс "та super_admin мөн үү" гэж дахин
        // асуухаа болино — танд өгөгдсөн tool бүр энэ эрхээр аль хэдийн зөвшөөрөгдсөн.
        const userContext =
            `\n\n[ОДООГИЙН ХЭРЭГЛЭГЧ] Эрх (role): ${ctx.perms.role}` +
            (ctx.userName ? `, Нэр: ${ctx.userName}` : '') +
            `. Чамд энэ ярианд өгөгдсөн tool бүрийг систем энэ хэрэглэгчийн эрхээр аль хэдийн зөвшөөрсөн. ` +
            `Тиймээс хэрэглэгчээс эрх/эрхийн зэрэглэлээ (super_admin эсэх гэх мэт) НОТЛОХЫГ БҮҮ АСУУ — ` +
            `зөвхөн үйлдэлд шаардлагатай оролтыг (жишээ нь: имэйл хаяг, оноох дүр) асуу.` +
            `\n\n[TOOL ХЭРЭГЛЭЭ] Tool дуудлага хязгаартай тул ҮР АШИГТАЙ ажилла: хайлт хоосон буцвал ` +
            `богино түлхүүр үгээр (нэрийн эхний хэсэг г.м.) ДЭЭД ТАЛ НЬ 1-2 удаа дахин хайгаад, ` +
            `олдсон даруйд үндсэн үйлдлээ (шинэчлэх/үүсгэх г.м.) ШУУД хий. Ижил хайлтыг бүү давт.`;
        const model = genAI.getGenerativeModel({
            model: AGENT_MODEL,
            systemInstruction: agent.buildInstruction(ctx.shopKnowledge) + userContext,
            ...(tools.length > 0 ? { tools: [{ functionDeclarations: tools }] } : {}),
            generationConfig: { temperature: agent.temperature, topP: 0.85, maxOutputTokens: 2048 },
        });

        const chat = model.startChat({ history: buildGeminiHistory(ctx.history) });
        const messageParts = await buildMessageParts(task, ctx.attachments);

        // MULTI-ROUND function-calling давталт. "Шалгаад → шинэчлэх" маягийн даалгаварт
        // Gemini эхний раундад унших tool (list_contracts), үр дүнг нь хараад ДАРААГИЙН
        // раундад бичих tool (process_contract_action) дууддаг. Өмнө нь ганц раунд
        // дэмждэг байсан тул 2 дахь раундын бодит үйлдэл хэзээ ч хийгддэггүй байв.
        const MAX_TOOL_ROUNDS = 6;
        let data: any = null;
        let chartConfig: any = null;
        let response = await withRetry(() => chat.sendMessage(messageParts));
        tokens += tokensFrom(response.response);

        for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
            const functionCalls = response.response.functionCalls();
            if (!functionCalls || functionCalls.length === 0) break;

            const toolResponses: any[] = [];
            for (const fc of functionCalls) {
                toolsUsed.push(fc.name);

                // Model ижил confirm-үйлдлийг дахин дуудвал давхар pending үүсгэхгүй.
                const dupKey = `${fc.name}:${JSON.stringify(fc.args || {})}`;
                if (pendingActions.some((p) => `${p.tool}:${JSON.stringify(p.args)}` === dupKey)) {
                    toolResponses.push({ functionResponse: { name: fc.name, response: { result: { status: 'awaiting_user_confirmation', note: 'Аль хэдийн баталгаажуулалт хүлээж байна. Энэ tool-ыг ДАХИН БҮҮ ДУУД — хэрэглэгчид товч мэдэгд.' } } } });
                    continue;
                }

                // Mutating tool-уудыг confirm=false-ээр дуудна → preview буцаана (гүйцэтгэхгүй).
                const toolResult = await executeDataTool(fc.name, fc.args || {}, ctx.shopId, ctx.perms, ctx.userId, false, ctx.userName || '');

                // Баталгаажуулалт шаардсан үйлдлийг pending болгож цуглуулна.
                if (toolResult && toolResult.requiresConfirmation) {
                    pendingActions.push({
                        id: randomUUID(),
                        tool: toolResult.action.tool,
                        args: toolResult.action.args || {},
                        label: toolResult.label || 'Үйлдэл',
                        preview: toolResult.preview || {},
                        agentId: agent.id,
                        agentName: agent.name,
                        emoji: agent.emoji,
                    });
                    // Gemini-д "хэрэглэгчийн баталгаажуулалт хүлээж байна" гэж мэдэгдэнэ.
                    toolResponses.push({ functionResponse: { name: fc.name, response: { result: { status: 'awaiting_user_confirmation', label: toolResult.label, preview: toolResult.preview, note: 'Хэрэглэгч UI дээрх картаас батлана — энэ tool-ыг ДАХИН БҮҮ ДУУД, хэрэглэгчид "баталгаажуулалт хүлээж байна" гэж товч мэдэгд.' } } } });
                } else {
                    toolResponses.push({ functionResponse: { name: fc.name, response: { result: toolResult } } });
                    data = toolResult;
                    chartConfig = generateChartConfig(fc.name, fc.args || {}, toolResult) || chartConfig;
                }
            }

            // Tool-ийн үр дүнг Gemini руу буцааж дараагийн алхмыг (дахин tool эсвэл эцсийн
            // текст) авна. Түр ачаалалд (429/503) унасан ч үр дүн гартаа бол бүрэн унахгүй.
            try {
                response = await withRetry(() => chat.sendMessage(toolResponses.map((tr) => ({ functionResponse: tr.functionResponse }))));
                tokens += tokensFrom(response.response);
            } catch (roundError) {
                const msg = roundError instanceof Error ? roundError.message : 'Unknown error';
                logger.error('[Orchestrator] Tool-round call failed, returning partial result', { agent: agent.id, round, error: msg });
                if (data || pendingActions.length > 0) {
                    return {
                        text: pendingActions.length > 0
                            ? `${pendingActions.length} үйлдэл таны баталгаажуулалтыг хүлээж байна — доорх картаас зөвшөөрнө үү.`
                            : `${agent.emoji} ${agent.name} шаардлагатай мэдээллийг (${toolsUsed.join(', ')}) олж авлаа, гэвч AI түр ачаалалтай тул дэлгэрэнгүй тайлбар бэлдэж чадсангүй. Доорх өгөгдлийг шууд харна уу.`,
                        data,
                        chartConfig,
                        toolsUsed,
                        tokens,
                        latencyMs: Date.now() - started,
                        ok: true,
                        pendingActions,
                    };
                }
                throw roundError;
            }
        }

        // Раундын хязгаарт тулахад model tool дуудсаар үлдсэн бол — үлдсэн дуудлагад нь
        // "хязгаар хүрлээ" гэсэн functionResponse өгч, эцсийн ТЕКСТ хариугаа бичүүлнэ.
        // (Gemini functionCall-ийн дараа заавал functionResponse шаарддаг тул энгийн
        // текст мессеж илгээж болохгүй.)
        let leftover: any[] = [];
        try { leftover = response.response.functionCalls() || []; } catch { leftover = []; }
        if (leftover.length > 0) {
            try {
                const stopResponses = leftover.map((fc: any) => ({
                    functionResponse: {
                        name: fc.name,
                        response: { result: { error: 'Tool дуудлагын хязгаарт хүрлээ. Өөр tool БҮҮ дууд — одоо цуглуулсан мэдээлэлдээ үндэслэн хэрэглэгчид эцсийн хариугаа МОНГОЛООР товч бич. Хийж амжаагүй үйлдэл байвал юу хийх гэж байснаа хэл.' } },
                    },
                }));
                response = await withRetry(() => chat.sendMessage(stopResponses));
                tokens += tokensFrom(response.response);
            } catch { /* доорх fallback текст ажиллана */ }
        }

        // Эцсийн текстийг аюулгүй задлана — model эцсээ хүртэл function call буцаасан
        // бол text() шидэж болзошгүй тул fallback текст бэлдэнэ.
        let finalText = '';
        try { finalText = response.response.text(); } catch { finalText = ''; }
        if (!finalText.trim()) {
            if (pendingActions.length > 0) {
                finalText = `${pendingActions.length} үйлдэл таны баталгаажуулалтыг хүлээж байна — доорх картаас зөвшөөрнө үү.`;
            } else if (data) {
                finalText = `${agent.emoji} ${agent.name} мэдээлэл цуглуулсан боловч эцсийн хариугаа бэлдэж амжсангүй. Асуултаа арай тодорхой болгоод (жишээ нь гэрээний дугаар нэмээд) дахин илгээнэ үү.`;
            } else {
                throw new Error('Empty model response');
            }
        }

        return {
            text: finalText,
            data,
            chartConfig,
            toolsUsed,
            tokens,
            latencyMs: Date.now() - started,
            ok: true,
            pendingActions,
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
            pendingActions,
        };
    }
}

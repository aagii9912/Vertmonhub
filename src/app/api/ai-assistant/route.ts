import { NextResponse } from 'next/server';
import { runOrchestrator } from '@/lib/ai/orchestrator';
import { prepareAssistantRequest, persistAssistantExchange } from '@/lib/ai/orchestrator/http';
import { safeErrorResponse } from '@/lib/utils/safe-error';

export const maxDuration = 60;

/**
 * POST /api/ai-assistant — JSON хариу (нэг удаагийн).
 *
 * v2-т UI нь /api/ai-assistant/stream (SSE)-ийг ашигладаг; энэ route нь
 * streaming дэмжихгүй хэрэглэгч/скриптэд зориулж ХЭВЭЭР ажиллана. Хоёулаа
 * lib/ai/orchestrator/http.ts-ийн нэг шалгалт/хадгалалтыг хуваалцана.
 */
export async function POST(req: Request) {
    try {
        const prep = await prepareAssistantRequest(req);
        if ('error' in prep) return prep.error;

        const response = await runOrchestrator(prep.modelMessage, prep.ctx);
        const conversationId = await persistAssistantExchange(prep, response);

        return NextResponse.json({
            response: response.text,
            data: response.data,
            chartConfig: response.chartConfig,
            agentsUsed: response.agentsUsed,
            trace: response.trace,
            pendingActions: response.pendingActions,
            clarification: response.clarification,
            conversationId,
        });
    } catch (error) {
        return safeErrorResponse(error, 'AI туслахад алдаа гарлаа');
    }
}

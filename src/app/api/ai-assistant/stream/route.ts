import { runOrchestrator } from '@/lib/ai/orchestrator';
import { prepareAssistantRequest, persistAssistantExchange } from '@/lib/ai/orchestrator/http';
import type { OrchestratorEvent } from '@/lib/ai/orchestrator/types';

export const maxDuration = 60;
export const dynamic = 'force-dynamic';

/**
 * POST /api/ai-assistant/stream — Server-Sent Events.
 *
 * Хэрэглэгч 60 секунд хоосон хүлээхийн оронд алхам бүрийг (төлөвлөгөө → агент
 * бүр → tool дуудлага → нэгтгэл) бодит цагт, эцсийн хариуг токеноор харна.
 * Үйл явдлын хэлбэр: `data: {json}\n\n`; төгсгөл `done` (JSON route-тай ижил
 * payload) эсвэл `error`. 15с тутам `: ping` — proxy/idle таслалтаас сэргийлнэ.
 */
export async function POST(req: Request) {
    const prep = await prepareAssistantRequest(req);
    if ('error' in prep) return prep.error;
    // Хөгжүүлэлтийн mock: `x-ai-mock: ok|error` толгойтой хүсэлт Gemini-г дуудахгүй,
    // UI-н streaming/үйлдлийн урсгалыг бодит модельгүйгээр шалгана. Production-д ХЭЗЭЭ Ч ажиллахгүй.
    const mock = process.env.NODE_ENV !== 'production' ? req.headers.get('x-ai-mock') : null;

    const encoder = new TextEncoder();
    // Client холболт таслахад (Зогсоох / таб хаах) orchestrator-ийг зогсооно; Vercel
    // maxDuration (60с)-аас өмнө partial хариу өгөхийн тулд 50с-ийн deadline тавина.
    const abort = new AbortController();
    const onClientAbort = () => abort.abort();
    req.signal?.addEventListener('abort', onClientAbort);
    const deadlineAt = Date.now() + 50_000;

    const stream = new ReadableStream<Uint8Array>({
        cancel() {
            abort.abort();
        },
        async start(controller) {
            let closed = false;
            const push = (obj: unknown) => {
                if (closed) return;
                try { controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`)); } catch { closed = true; }
            };
            const ping = setInterval(() => { if (!closed) try { controller.enqueue(encoder.encode(': ping\n\n')); } catch { closed = true; } }, 15_000);

            try {
                push({ type: 'start', at: Date.now() });
                if (mock) {
                    await runMock(mock, push);
                    return;
                }
                const response = await runOrchestrator(prep.modelMessage, {
                    ...prep.ctx,
                    signal: abort.signal,
                    deadlineAt,
                    onEvent: (e: OrchestratorEvent) => push(e),
                });
                const conversationId = await persistAssistantExchange(prep, response);
                push({
                    type: 'done',
                    response: response.text,
                    data: response.data,
                    chartConfig: response.chartConfig,
                    agentsUsed: response.agentsUsed,
                    trace: response.trace,
                    pendingActions: response.pendingActions,
                    conversationId,
                });
            } catch (error) {
                const message = error instanceof Error ? error.message : 'AI туслахад алдаа гарлаа';
                const rateLimited = /429|rate.?limit|quota|overloaded|503/i.test(message);
                const denied = /403|denied access|PERMISSION_DENIED|API_KEY_INVALID/i.test(message);
                push({
                    type: 'error',
                    message: denied
                        ? 'AI үйлчилгээний түлхүүр/төслийн эрх хаагдсан байна (Google 403). Админ GEMINI_API_KEY-г шинэ төслийн түлхүүрээр солино уу.'
                        : rateLimited ? 'AI систем түр ачаалалтай байна — 30 секундын дараа дахин оролдоно уу.' : message,
                    retryable: !denied,
                });
            } finally {
                clearInterval(ping);
                closed = true;
                req.signal?.removeEventListener('abort', onClientAbort);
                try { controller.close(); } catch { /* аль хэдийн хаагдсан */ }
            }
        },
    });

    return new Response(stream, {
        headers: {
            'Content-Type': 'text/event-stream; charset=utf-8',
            'Cache-Control': 'no-cache, no-transform',
            Connection: 'keep-alive',
            'X-Accel-Buffering': 'no',
        },
    });
}

/* ---------- dev-only mock ---------- */
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function runMock(mode: string, push: (o: unknown) => void) {
    push({ type: 'plan', reasoning: 'Mock: CRM мэргэжилтэн + Санхүүгийн аналист', latencyMs: 420, steps: [
        { agentId: 'crm-specialist', agentName: 'CRM мэргэжилтэн', task: 'Лидийн мэдээлэл унших' },
        { agentId: 'finance-analyst', agentName: 'Санхүүгийн аналист', task: 'Төлбөрийн байдал' },
    ] });
    await sleep(500);
    push({ type: 'step_start', agentId: 'crm-specialist', agentName: 'CRM мэргэжилтэн', index: 0 });
    await sleep(400); push({ type: 'tool', agentId: 'crm-specialist', tool: 'get_lead_details' });
    await sleep(600); push({ type: 'tool', agentId: 'crm-specialist', tool: 'add_lead_note' });
    await sleep(500); push({ type: 'step_done', agentId: 'crm-specialist', agentName: 'CRM мэргэжилтэн', index: 0, ok: mode !== 'error', latencyMs: 1500, toolsUsed: ['get_lead_details', 'add_lead_note'], error: mode === 'error' ? 'mock error' : undefined });
    if (mode === 'error') { await sleep(200); throw new Error('Mock: [403 Forbidden] Your project has been denied access.'); }
    push({ type: 'step_start', agentId: 'finance-analyst', agentName: 'Санхүүгийн аналист', index: 1 });
    await sleep(400); push({ type: 'tool', agentId: 'finance-analyst', tool: 'get_contracts_summary' });
    await sleep(500); push({ type: 'step_done', agentId: 'finance-analyst', agentName: 'Санхүүгийн аналист', index: 1, ok: true, latencyMs: 900, toolsUsed: ['get_contracts_summary'] });
    push({ type: 'synthesis_start' });
    const text = '**Дүгнэлт (mock).** Лид 3 өрөө байр сонирхож, 2 удаа уулзсан. Сүүлийн яриа: 12-р давхраас дээш хүсэж байна.\n\n**Дараагийн алхам:** маргааш 10:00-д залгаж B-1204-ийн санал илгээх.\n\n| Үзүүлэлт | Утга |\n|---|---|\n| Уулзалт | 2 |\n| Сонирхол | 4/5 |';
    for (const piece of text.match(/[\s\S]{1,14}/g) || []) { push({ type: 'token', text: piece }); await sleep(35); }
    await sleep(200);
    push({ type: 'done', response: text, data: null, chartConfig: { type: 'bar', data: [{ name: 'Facebook', value: 64 }, { name: 'Instagram', value: 41 }, { name: 'Утас', value: 28 }] },
        agentsUsed: [{ id: 'crm-specialist', name: 'CRM мэргэжилтэн', emoji: '', color: 'sky' }, { id: 'finance-analyst', name: 'Санхүүгийн аналист', emoji: '', color: 'amber' }],
        trace: { plannerReasoning: 'mock', plannerLatencyMs: 420, plannerModel: 'mock', steps: [], synthesisUsed: true, synthesisLatencyMs: 800, totalLatencyMs: 4200, totalTokens: 0 },
        pendingActions: [{ id: 'mock-1', tool: 'add_lead_note', args: { note: 'Mock тэмдэглэл' }, label: 'Лидэд тэмдэглэл нэмэх', preview: { Лид: 'Б. Болд', Тэмдэглэл: 'Маргааш 10:00 залгах' }, agentId: 'crm-specialist', agentName: 'CRM мэргэжилтэн', emoji: '' }],
        conversationId: null });
}

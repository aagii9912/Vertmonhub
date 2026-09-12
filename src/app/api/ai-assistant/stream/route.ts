import { runOrchestrator } from '@/lib/ai/orchestrator';
import { prepareAssistantRequest, persistAssistantExchange } from '@/lib/ai/orchestrator/http';
import type { OrchestratorEvent } from '@/lib/ai/orchestrator/types';
import { describeClaudeError } from '@/lib/ai/claude/client';

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
                    clarification: response.clarification,
                    conversationId,
                });
            } catch (error) {
                const info = describeClaudeError(error);
                console.error('[ai-assistant/stream]', info.code, error instanceof Error ? error.message : error);
                push({ type: 'error', message: info.message, retryable: info.retryable, code: info.code });
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
    const text = '**Б. Болд** 3 өрөө байр сонирхож, 2 удаа уулзсан. Сүүлийн ярианд 12-р давхраас дээш хүсэж байгаагаа хэлсэн.\n\n| Үзүүлэлт | Утга |\n|---|---|\n| Уулзалт | 2 |\n| Сонирхол | 4/5 |\n| Төсөв | 380 сая₮ |\n\n**Дараагийн алхам:** маргааш 10:00-д залгаж B-1204-ийн саналыг илгээх.';
    await sleep(300);
    push({ type: 'tool_start', id: 't1', tool: 'get_lead_details', args: { customer_name: 'Болд' } });
    await sleep(700);
    push({ type: 'tool_done', id: 't1', tool: 'get_lead_details', ok: true, summary: '1 лид олдлоо', latencyMs: 700 });
    if (mode === 'error') { await sleep(200); throw Object.assign(new Error('mock'), { status: 529 }); }
    if (mode === 'delegate') {
        push({ type: 'tool_start', id: 't2', tool: 'delegate_to_specialists', args: {} });
        push({ type: 'status', text: '2 мэргэжилтэн зэрэг ажиллаж байна…' });
        push({ type: 'step_start', agentId: 'finance-analyst', agentName: 'Санхүүгийн аналист', task: 'Төлбөрийн байдал' });
        push({ type: 'step_start', agentId: 'marketing-specialist', agentName: 'Маркетинг мэргэжилтэн', task: 'Сувгийн гүйцэтгэл' });
        await sleep(400); push({ type: 'tool_start', id: 't3', tool: 'get_contracts_summary', args: {}, agentId: 'finance-analyst' });
        await sleep(500); push({ type: 'tool_done', id: 't3', tool: 'get_contracts_summary', ok: true, summary: 'Уншлаа', latencyMs: 500, agentId: 'finance-analyst' });
        push({ type: 'step_done', agentId: 'finance-analyst', agentName: 'Санхүүгийн аналист', ok: true, latencyMs: 900, toolsUsed: ['get_contracts_summary'] });
        await sleep(300); push({ type: 'step_done', agentId: 'marketing-specialist', agentName: 'Маркетинг мэргэжилтэн', ok: false, latencyMs: 1200, toolsUsed: [], error: 'mock' });
        push({ type: 'tool_done', id: 't2', tool: 'delegate_to_specialists', ok: true, summary: '2 агент', latencyMs: 1300 });
    }
    if (mode === 'clarify') {
        push({ type: 'clarify', question: 'Аль лидийг хэлж байна вэ?', options: ['Б. Болд (99112233)', 'Б. Болдбаатар (88001122)'] });
        push({ type: 'done', response: '', data: null, chartConfig: null, agentsUsed: [{ id: 'main', name: 'AI туслах', emoji: '✨', color: 'violet' }], trace: null, pendingActions: [], clarification: { question: 'Аль лидийг хэлж байна вэ?', options: ['Б. Болд (99112233)', 'Б. Болдбаатар (88001122)'] }, conversationId: null });
        return;
    }
    push({ type: 'tool_start', id: 't4', tool: 'add_lead_note', args: { note: 'Маргааш 10:00 залгах' } });
    await sleep(300);
    push({ type: 'tool_done', id: 't4', tool: 'add_lead_note', ok: true, summary: 'Баталгаажуулалт хүлээж байна', latencyMs: 300 });
    push({ type: 'tool_start', id: 't5', tool: 'schedule_viewing', args: {} });
    await sleep(300);
    push({ type: 'tool_done', id: 't5', tool: 'schedule_viewing', ok: true, summary: 'Баталгаажуулалт хүлээж байна', latencyMs: 300 });
    for (const piece of text.match(/[\s\S]{1,14}/g) || []) { push({ type: 'token', text: piece }); await sleep(30); }
    await sleep(150);
    push({ type: 'done', response: text, data: null, chartConfig: { type: 'bar', data: [{ name: 'Facebook', value: 64 }, { name: 'Instagram', value: 41 }, { name: 'Утас', value: 28 }] },
        agentsUsed: [{ id: 'main', name: 'AI туслах', emoji: '✨', color: 'violet' }],
        trace: { model: 'mock', rounds: 2, tools: [{ tool: 'get_lead_details', agentId: 'main', ok: true, latencyMs: 700, summary: '1 лид олдлоо' }], steps: [], totalLatencyMs: 3200, totalTokens: 0, inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, summaryUsed: false },
        pendingActions: [
            { id: 'mock-1', tool: 'add_lead_note', args: { note: 'Маргааш 10:00 залгах' }, label: 'Лидэд тэмдэглэл нэмэх', preview: { Лид: 'Б. Болд', Тэмдэглэл: 'Маргааш 10:00 залгах' }, agentId: 'main', agentName: 'AI туслах', emoji: '✨' },
            { id: 'mock-2', tool: 'schedule_viewing', args: { customer_name: 'Б. Болд' }, label: 'Уулзалт товлох', preview: { Лид: 'Б. Болд', Огноо: '2026-09-13 10:00', Байр: 'B-1204' }, agentId: 'main', agentName: 'AI туслах', emoji: '✨' },
        ],
        clarification: null,
        conversationId: null });
}

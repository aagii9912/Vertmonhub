import type { OrchestratorEvent } from '@/lib/ai/orchestrator/types';
import type { AssistantUiContext } from '@/lib/ai/orchestrator/http';

/**
 * /api/ai-assistant/stream (SSE) уншигч — fetch + ReadableStream.
 * EventSource POST дэмждэггүй тул гараар задална. Abort, timeout, алдааны
 * мессеж бүгд нэг газар.
 */

export interface StreamRequest {
    message: string;
    shopId?: string | null;
    conversationId?: string | null;
    history: Array<{ role: string; content: string }>;
    attachments?: Array<{ url: string; name: string; mimeType: string }>;
    context?: AssistantUiContext | null;
}

export interface StreamDone {
    response: string;
    data: unknown;
    chartConfig: unknown;
    agentsUsed: Array<{ id: string; name: string; emoji: string; color: string }>;
    trace: unknown;
    pendingActions: Array<{ id: string; tool: string; args: Record<string, unknown>; label: string; preview: Record<string, unknown>; agentId: string; agentName: string; emoji: string }>;
    clarification: { question: string; options: string[] } | null;
    conversationId: string | null;
}

export type StreamEvent = OrchestratorEvent | { type: 'start'; at: number } | ({ type: 'done' } & StreamDone) | { type: 'error'; message: string; retryable?: boolean; code?: string };

export interface StreamHandlers {
    onEvent: (e: StreamEvent) => void;
    signal?: AbortSignal;
    /** Нийт хүлээх дээд хугацаа (ms). Анхдагч 90с. */
    timeoutMs?: number;
}

export async function streamAssistant(req: StreamRequest, h: StreamHandlers): Promise<void> {
    const controller = new AbortController();
    const onAbort = () => controller.abort();
    h.signal?.addEventListener('abort', onAbort);
    const timer = setTimeout(() => controller.abort(new Error('timeout')), h.timeoutMs ?? 90_000);

    try {
        // Хөгжүүлэлтийн mock: localStorage.vertmonhub_ai_mock = 'ok'|'error'|'delegate'|'clarify' → сервер Claude дуудахгүй.
        let mock: string | null = null;
        try { mock = process.env.NODE_ENV !== 'production' ? localStorage.getItem('vertmonhub_ai_mock') : null; } catch { mock = null; }
        const res = await fetch('/api/ai-assistant/stream', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...(mock ? { 'x-ai-mock': mock } : {}) },
            body: JSON.stringify(req),
            signal: controller.signal,
        });
        if (!res.ok || !res.body) {
            const detail = await res.json().catch(() => null as { error?: string } | null);
            h.onEvent({ type: 'error', message: detail?.error || `Хүсэлт амжилтгүй (${res.status})`, retryable: res.status >= 500 || res.status === 429 });
            return;
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let gotDone = false;
        for (;;) {
            const { value, done } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            let idx: number;
            while ((idx = buffer.indexOf('\n\n')) >= 0) {
                const raw = buffer.slice(0, idx);
                buffer = buffer.slice(idx + 2);
                const line = raw.split('\n').find((l) => l.startsWith('data: '));
                if (!line) continue; // ping / comment
                try {
                    const ev = JSON.parse(line.slice(6)) as StreamEvent;
                    if (ev.type === 'done' || ev.type === 'error') gotDone = true;
                    h.onEvent(ev);
                } catch { /* эвдэрсэн мөр — алгасна */ }
            }
        }
        if (!gotDone) h.onEvent({ type: 'error', message: 'Холболт хариу дуусахаас өмнө тасарлаа.', retryable: true });
    } catch (e) {
        if (controller.signal.aborted) {
            const reason = (controller.signal.reason as Error | undefined)?.message;
            h.onEvent({ type: 'error', message: reason === 'timeout' ? 'AI хариу 90 секундэд амжсангүй — асуултаа арай тодорхой болгоод дахин оролдоно уу.' : 'Цуцлагдлаа', retryable: reason === 'timeout' });
        } else {
            h.onEvent({ type: 'error', message: e instanceof Error && e.message !== 'Failed to fetch' ? e.message : 'Сүлжээний алдаа — интернэт холболтоо шалгаад дахин оролдоно уу.', retryable: true });
        }
    } finally {
        clearTimeout(timer);
        h.signal?.removeEventListener('abort', onAbort);
    }
}

/** Баталгаажуулсан үйлдлийг гүйцэтгэнэ (RBAC серверт дахин шалгагдана). */
export async function approveAssistantAction(input: { shopId?: string | null; tool: string; args: Record<string, unknown>; conversationId?: string | null }): Promise<{ ok: boolean; message: string; result?: unknown }> {
    try {
        const res = await fetch('/api/ai-assistant/action', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(input),
        });
        const data = await res.json().catch(() => ({}));
        if (res.ok && data.success) return { ok: true, message: data.message || 'Гүйцэтгэгдлээ', result: data.result };
        return { ok: false, message: data.message || data.error || 'Алдаа гарлаа' };
    } catch {
        return { ok: false, message: 'Сүлжээний алдаа гарлаа' };
    }
}

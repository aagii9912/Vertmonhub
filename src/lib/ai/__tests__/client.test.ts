import { beforeEach, describe, expect, it, vi } from 'vitest';
import { streamAssistant, type StreamEvent } from '../client';

const request = { message: 'Ажил нэм', history: [] };
beforeEach(() => { vi.mocked(fetch).mockReset(); });

describe('AI stream interruption', () => {
    it('retains observed tool completion and never offers to replay a disconnected request', async () => {
        const events: StreamEvent[] = [];
        const event = { type: 'tool_done', id: 'call-1', tool: 'create_task', ok: true, summary: 'Ажил нэмэгдлээ', latencyMs: 1 };
        vi.mocked(fetch).mockResolvedValue(new Response(`data: ${JSON.stringify(event)}\n\n`, { headers: { 'Content-Type': 'text/event-stream' } }));
        await streamAssistant(request, { onEvent: event => events.push(event) });
        expect(events[0]).toEqual(event);
        expect(events[1]).toMatchObject({ type: 'error', retryable: false });
        expect(fetch).toHaveBeenCalledTimes(1);
    });

    it('does not offer replay after a network failure with unknown server outcome', async () => {
        const onEvent = vi.fn();
        vi.mocked(fetch).mockRejectedValue(new TypeError('Failed to fetch'));
        await streamAssistant(request, { onEvent });
        expect(onEvent).toHaveBeenCalledWith(expect.objectContaining({ type: 'error', retryable: false }));
        expect(fetch).toHaveBeenCalledTimes(1);
    });

    it('keeps a received partial result even if the transport fails immediately afterward', async () => {
        const onEvent = vi.fn();
        const done = { type: 'done', response: 'Ажил нэмэгдлээ.', interruption: { code: 'timeout', message: 'Хугацаа дууссан' }, pendingActions: [] };
        const read = vi.fn().mockResolvedValueOnce({ done: false, value: new TextEncoder().encode(`data: ${JSON.stringify(done)}\n\n`) })
            .mockRejectedValueOnce(new TypeError('Connection closed'));
        vi.mocked(fetch).mockResolvedValue({ ok: true, body: { getReader: () => ({ read }) } } as unknown as Response);
        await streamAssistant(request, { onEvent });
        expect(onEvent).toHaveBeenCalledExactlyOnceWith(done);
        expect(read).toHaveBeenCalledTimes(1);
    });
});

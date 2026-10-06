import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { AiChat } from '../AiChat';
import type { StreamHandlers } from '@/lib/ai/client';

const mocks = vi.hoisted(() => ({ stream: vi.fn(), approve: vi.fn(), invalidate: vi.fn(), allowed: true }));
vi.mock('@/lib/ai/client', () => ({ streamAssistant: mocks.stream, approveAssistantAction: mocks.approve }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ shop: { id: 'shop-1' }, user: { id: 'user-1' } }) }));
vi.mock('@tanstack/react-query', () => ({ useQueryClient: () => ({ invalidateQueries: mocks.invalidate }) }));
vi.mock('@/lib/ai/context', () => ({ useAiContext: () => null, suggestionsFor: () => [], contextLabel: () => '' }));
vi.mock('@/lib/ai/allowedTools', () => ({ isToolAllowed: () => mocks.allowed, addAllowedTool: vi.fn() }));
vi.mock('@/components/ai-assistant/OrchestrationTrace', () => ({ OrchestrationTrace: () => null }));
vi.mock('@/components/ai-assistant/MarkdownMessage', () => ({ MarkdownMessage: ({ content }: { content: string }) => <div>{content}</div> }));
vi.mock('../AiComposer', () => ({ AiComposer: ({ onSend }: { onSend: (text: string, attachments: []) => void }) => (
    <>
        <button onClick={() => onSend('Ажил нэм', [])}>Илгээх</button>
        {['тийм', 'бүгдийг батал', 'үгүй'].map((text) => <button key={text} onClick={() => onSend(text, [])}>{`Бичих: ${text}`}</button>)}
    </>
) }));

beforeEach(() => { vi.clearAllMocks(); mocks.allowed = true; mocks.invalidate.mockResolvedValue(undefined); });

describe('AI partial run UI', () => {
    it('keeps results and pending cards visible, refreshes data, and does not auto-approve after interruption', async () => {
        mocks.stream.mockImplementationOnce(async (_request: unknown, h: StreamHandlers) => h.onEvent({
            type: 'done', response: 'Ажил нэмэгдлээ.', data: { taskId: 'task-1' }, chartConfig: null, trace: null, agentsUsed: [], clarification: null, conversationId: 'conversation-1',
            interruption: { code: 'timeout', message: 'Хугацаа дууссан.' },
            pendingActions: [{ id: 'pending-1', tool: 'create_lead', args: {}, label: 'Лид үүсгэх', preview: {}, agentId: 'main', agentName: 'AI', emoji: '' }],
        }));
        render(<AiChat />);
        fireEvent.click(screen.getByRole('button', { name: 'Илгээх' }));
        expect(await screen.findByText('Ажил нэмэгдлээ.')).toBeVisible();
        expect(screen.getByText('Лид үүсгэх')).toBeVisible();
        expect(screen.getByRole('status')).toHaveTextContent('Хугацаа дууссан.');
        await waitFor(() => expect(mocks.invalidate).toHaveBeenCalled());
        expect(mocks.approve).not.toHaveBeenCalled();
        expect(screen.queryByRole('button', { name: 'Дахин оролдох' })).not.toBeInTheDocument();
    });

    it('refreshes after transport failure and disables replay when a tool already started', async () => {
        mocks.stream.mockImplementationOnce(async (_request: unknown, h: StreamHandlers) => {
            h.onEvent({ type: 'tool_start', id: 'task-1', tool: 'create_task', args: {} });
            h.onEvent({ type: 'error', message: 'Холболт тасарсан.', retryable: true });
        });
        render(<AiChat />);
        fireEvent.click(screen.getByRole('button', { name: 'Илгээх' }));
        expect(await screen.findByText('Холболт тасарсан.')).toBeVisible();
        await waitFor(() => expect(mocks.invalidate).toHaveBeenCalled());
        expect(screen.queryByRole('button', { name: 'Дахин оролдох' })).not.toBeInTheDocument();
        expect(mocks.stream).toHaveBeenCalledTimes(1);
    });
});

describe('typed approval of pending cards', () => {
    const card = (id: string, tool: string, label: string) => ({ id, tool, args: { id }, label, preview: {}, agentId: 'main', agentName: 'AI', emoji: '' });
    async function withCards(...cards: ReturnType<typeof card>[]) {
        mocks.allowed = false;
        mocks.stream.mockImplementationOnce(async (_request: unknown, h: StreamHandlers) => h.onEvent({
            type: 'done', response: 'Карт бэлэн.', data: null, chartConfig: null, trace: null, agentsUsed: [], clarification: null, conversationId: 'c-1', pendingActions: cards,
        }));
        render(<AiChat />);
        fireEvent.click(screen.getByRole('button', { name: 'Илгээх' }));
        expect(await screen.findByText('Карт бэлэн.')).toBeVisible();
    }
    const streamedTexts = () => mocks.stream.mock.calls.map(([request]) => (request as { message: string }).message);

    it('approves the only ordinary card through the action endpoint instead of asking the model', async () => {
        mocks.approve.mockResolvedValue({ ok: true, message: 'Шинэчиллээ.' });
        await withCards(card('a', 'update_lead', 'Лид засах: Болд'));
        fireEvent.click(screen.getByRole('button', { name: 'Бичих: тийм' }));
        await waitFor(() => expect(mocks.approve).toHaveBeenCalledWith({ shopId: 'shop-1', tool: 'update_lead', args: { id: 'a' }, conversationId: 'c-1' }));
        expect(streamedTexts()).not.toContain('тийм');
    });

    it('keeps money cards on the button and asks which card when several wait', async () => {
        await withCards(card('p', 'add_contract_payment', 'Төлбөр нэмэх'));
        fireEvent.click(screen.getByRole('button', { name: 'Бичих: тийм' }));
        expect(await screen.findByText(/карт дээрх «Зөвшөөрөх»/)).toBeVisible();
        expect(mocks.approve).not.toHaveBeenCalled();
    });

    it('needs «бүгдийг батал» for several cards and cancels them on «үгүй»', async () => {
        mocks.approve.mockResolvedValue({ ok: true, message: 'Болсон.' });
        await withCards(card('a', 'create_lead', 'Лид үүсгэх'), card('b', 'schedule_viewing', 'Уулзалт товлох'));
        fireEvent.click(screen.getByRole('button', { name: 'Бичих: тийм' }));
        expect(await screen.findByText(/Хэд хэдэн үйлдэл хүлээгдэж байна/)).toBeVisible();
        expect(mocks.approve).not.toHaveBeenCalled();
        fireEvent.click(screen.getByRole('button', { name: 'Бичих: бүгдийг батал' }));
        await waitFor(() => expect(mocks.approve).toHaveBeenCalledTimes(2));
    });

    it('cancels waiting cards on «үгүй» without executing them', async () => {
        await withCards(card('a', 'create_lead', 'Лид үүсгэх'));
        fireEvent.click(screen.getByRole('button', { name: 'Бичих: үгүй' }));
        expect(await screen.findByText('Үйлдлийг цуцаллаа.')).toBeVisible();
        expect(mocks.approve).not.toHaveBeenCalled();
        expect(streamedTexts()).not.toContain('үгүй');
    });
});

import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { AiChat } from '../AiChat';
import type { StreamHandlers } from '@/lib/ai/client';

const mocks = vi.hoisted(() => ({ stream: vi.fn(), approve: vi.fn(), invalidate: vi.fn() }));
vi.mock('@/lib/ai/client', () => ({ streamAssistant: mocks.stream, approveAssistantAction: mocks.approve }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ shop: { id: 'shop-1' }, user: { id: 'user-1' } }) }));
vi.mock('@tanstack/react-query', () => ({ useQueryClient: () => ({ invalidateQueries: mocks.invalidate }) }));
vi.mock('@/lib/ai/context', () => ({ useAiContext: () => null, suggestionsFor: () => [], contextLabel: () => '' }));
vi.mock('@/lib/ai/allowedTools', () => ({ isToolAllowed: () => true, addAllowedTool: vi.fn() }));
vi.mock('@/components/ai-assistant/OrchestrationTrace', () => ({ OrchestrationTrace: () => null }));
vi.mock('@/components/ai-assistant/MarkdownMessage', () => ({ MarkdownMessage: ({ content }: { content: string }) => <div>{content}</div> }));
vi.mock('../AiComposer', () => ({ AiComposer: ({ onSend }: { onSend: (text: string, attachments: []) => void }) => <button onClick={() => onSend('Ажил нэм', [])}>Илгээх</button> }));

beforeEach(() => { vi.clearAllMocks(); mocks.invalidate.mockResolvedValue(undefined); });

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

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type Anthropic from '@anthropic-ai/sdk';
import { runLoop, type LoopOptions } from '@/lib/ai/orchestrator/loop';
import { ASK_USER_TOOL, toClaudeTool } from '@/lib/ai/claude/tools';
import { streamMessage } from '../messages';

const mocks = vi.hoisted(() => ({ stream: vi.fn(), execute: vi.fn() }));
vi.mock('@/lib/ai/claude/client', async (importOriginal) => ({ ...await importOriginal<object>(), claude: () => ({ messages: { stream: mocks.stream } }) }));
vi.mock('@/lib/ai/data-assistant', () => ({ executeDataTool: mocks.execute }));
vi.mock('@/lib/ai/data-assistant/functions', () => ({ generateChartConfig: () => null }));

type Block = Anthropic.ContentBlock;
const call = (name: string, input: unknown = {}, id = 'call-1') => ({ type: 'tool_use', name, input, id }) as Block;
const answer = (text = 'Бүртгэлээ.') => ({ type: 'text', text, citations: null }) as Block;
const thinking = { type: 'thinking', thinking: '', signature: 'opaque-signature' } as Block;
const message = (content: Block[], stop_reason: Anthropic.StopReason = content.some((b) => b.type === 'tool_use') ? 'tool_use' : 'end_turn') => ({
    id: 'msg-1', type: 'message', role: 'assistant', model: 'claude-test', content, stop_reason,
    usage: { input_tokens: 13, output_tokens: 5, cache_read_input_tokens: 7, cache_creation_input_tokens: 0 },
}) as unknown as Anthropic.Message;
const requests: Anthropic.MessageStreamParams[] = [];
/** Fake MessageStream: replays one text delta, then resolves the final message. */
function fakeStream(final: Anthropic.Message) {
    let onText: ((delta: string) => void) | undefined;
    const stream = {
        on(event: string, cb: (delta: string) => void) { if (event === 'text') onText = cb; return stream; },
        async finalMessage() { onText?.('текст'); return final; },
    };
    return stream;
}
function rounds(...contents: Array<Block[] | Anthropic.Message>) {
    contents.forEach((c) => mocks.stream.mockImplementationOnce((params: Anthropic.MessageStreamParams) => {
        requests.push(structuredClone(params));
        return fakeStream(Array.isArray(c) ? message(c) : c);
    }));
}
const lastResults = (i: number) => {
    const last = requests[i].messages.at(-1)!;
    return Array.isArray(last.content) ? last.content.filter((b) => b.type === 'tool_result') : [];
};
function options(names = ['list_leads']): LoopOptions {
    return {
        model: 'claude-test', system: [{ type: 'text', text: 'Монгол хэлээр.' }],
        tools: names.map((name) => name === 'ask_user' ? ASK_USER_TOOL : toClaudeTool({ name, description: name })),
        messages: [{ role: 'user', content: 'Ажлыг хий.' }], streamText: true,
        ctx: { shopId: 'shop-1', userId: 'user-1', perms: { canWrite: true, canDelete: false, role: 'sales_manager' }, onEvent: vi.fn() },
        agentLabel: { id: 'main', name: 'AI', emoji: '' },
    };
}

beforeEach(() => { mocks.stream.mockReset(); mocks.execute.mockReset(); requests.length = 0; });

describe('Claude Messages orchestration', () => {
    it('keeps thinking blocks, tool IDs, tool results and real usage through streaming rounds', async () => {
        rounds([thinking, call('list_leads')], [answer('3 лид байна.')]);
        mocks.execute.mockResolvedValue({ leads: [1, 2, 3] });
        const o = options();
        const result = await runLoop(o);
        expect(result.text).toBe('3 лид байна.');
        expect(result.usage).toEqual({ input: 40, output: 10, cacheRead: 14 });
        expect(requests[0]).toMatchObject({ model: 'claude-test', thinking: { type: 'adaptive' }, output_config: { effort: 'medium' }, tool_choice: { type: 'auto' } });
        expect(requests[0]).not.toHaveProperty('temperature');
        expect(requests[1].messages[1]).toEqual({ role: 'assistant', content: [thinking, call('list_leads')] });
        expect(lastResults(1)).toEqual([{ type: 'tool_result', tool_use_id: 'call-1', content: '{"leads":[1,2,3]}' }]);
        expect(o.ctx.onEvent).toHaveBeenCalledWith({ type: 'token', text: 'текст' });
        expect(mocks.execute).toHaveBeenCalledWith('list_leads', {}, 'shop-1', o.ctx.perms, 'user-1', false, '');
    });

    it('returns every parallel tool result in one user message', async () => {
        rounds([call('list_leads', {}, 'a'), call('list_contracts', {}, 'b')], [answer()]);
        mocks.execute.mockResolvedValue({ leads: [] });
        await runLoop(options(['list_leads', 'list_contracts']));
        expect(lastResults(1).map((r) => r.tool_use_id)).toEqual(['a', 'b']);
    });

    it('preserves the confirmation gate for business writes', async () => {
        rounds([call('create_lead')], [answer('Зөвшөөрөл хүлээж байна.')]);
        mocks.execute.mockResolvedValue({ requiresConfirmation: true, action: { tool: 'create_lead', args: { customer_name: 'Болд' } }, label: 'Лид үүсгэх', preview: {} });
        const result = await runLoop(options(['create_lead']));
        expect(mocks.execute.mock.calls[0][5]).toBe(false);
        expect(result.pendingActions).toHaveLength(1);
        expect(JSON.stringify(requests[1].messages)).toContain('awaiting_user_confirmation');
    });

    it('does not repeat automatic writes even if arguments have different key ordering', async () => {
        rounds([call('create_task', { title: 'Залгах', note: 'Өнөөдөр' })], [call('create_task', { note: 'Өнөөдөр', title: 'Залгах' }, 'call-2')], [answer()]);
        mocks.execute.mockResolvedValue({ success: true, taskId: 'task-1' });
        await runLoop(options(['create_task']));
        expect(mocks.execute).toHaveBeenCalledTimes(1);
        expect(mocks.execute.mock.calls[0][5]).toBe(true);
        expect(lastResults(2)).toEqual([expect.objectContaining({ tool_use_id: 'call-2', content: '{"success":true,"taskId":"task-1"}' })]);
    });

    it('marks business errors as failed tools and does not retry the write', async () => {
        rounds([call('create_task')], [call('create_task', {}, 'call-2')], [answer('Хадгалагдсангүй.')]);
        mocks.execute.mockResolvedValue({ error: 'Хадгалалтын алдаа' });
        const result = await runLoop(options(['create_task']));
        expect(mocks.execute).toHaveBeenCalledTimes(1);
        expect(result.traceTools[0]).toMatchObject({ ok: false, summary: 'Хадгалалтын алдаа' });
    });

    it.each([['array', []], ['null', null], ['string', 'x']])('rejects malformed tool input: %s', async (_label, input) => {
        rounds([call('create_task', input)], [answer('Аргумент буруу.')]);
        await runLoop(options(['create_task']));
        expect(mocks.execute).not.toHaveBeenCalled();
        expect(lastResults(1)[0]).toMatchObject({ is_error: true });
    });

    it('rejects tools outside the current agent allowlist', async () => {
        rounds([call('delete_lead')], [answer('Эрхгүй.')]);
        await runLoop(options(['list_leads']));
        expect(mocks.execute).not.toHaveBeenCalled();
    });

    it('asks for missing details before executing other proposed actions', async () => {
        rounds([call('create_task'), call('ask_user', { question: 'Аль лид вэ?' }, 'question')]);
        const result = await runLoop(options(['create_task', 'ask_user']));
        expect(result.clarification?.question).toBe('Аль лид вэ?');
        expect(mocks.execute).not.toHaveBeenCalled();
    });

    it('stops before model/tool execution when cancelled', async () => {
        const o = options(); o.ctx.signal = AbortSignal.abort();
        await expect(runLoop(o)).rejects.toThrow();
        expect(mocks.stream).not.toHaveBeenCalled();
        expect(mocks.execute).not.toHaveBeenCalled();
    });

    it('never executes a tool call cut off by max_tokens', async () => {
        rounds(message([call('create_task')], 'max_tokens'));
        await expect(runLoop(options(['create_task']))).rejects.toThrow('max_tokens');
        expect(mocks.execute).not.toHaveBeenCalled();
    });

    it('treats a refusal as an error, not as an answer', async () => {
        rounds(message([answer('…')], 'refusal'));
        await expect(runLoop(options())).rejects.toThrow('refusal');
    });

    it('does not start a provider request after the deadline', async () => {
        await expect(streamMessage({ model: 'claude-test', system: [], messages: [], tools: [], deadlineAt: Date.now() - 1 })).rejects.toThrow('deadline');
        expect(mocks.stream).not.toHaveBeenCalled();
    });

    it('keeps tool definitions but forbids new calls in the closing round', async () => {
        rounds([call('list_leads')], [answer('Дүгнэлт.')]);
        mocks.execute.mockResolvedValue({ leads: [] });
        const o = options(); o.maxRounds = 1;
        const result = await runLoop(o);
        expect(requests[1]).toMatchObject({ tool_choice: { type: 'none' }, tools: o.tools });
        expect(result.text).toContain('Дүгнэлт.');
    });

    it('preserves completed writes, previews, trace and usage when a later provider round fails', async () => {
        rounds([call('create_task', { title: 'Залгах' }), call('create_lead', {}, 'lead-preview')]);
        mocks.stream.mockImplementationOnce(() => { throw new DOMException('AI deadline reached', 'TimeoutError'); });
        mocks.execute.mockResolvedValueOnce({ success: true, message: 'Ажил нэмэгдлээ.', taskId: 'task-1' })
            .mockResolvedValueOnce({ requiresConfirmation: true, action: { tool: 'create_lead', args: { customer_name: 'Болд' } }, label: 'Лид үүсгэх', preview: {} });
        const o = options(['create_task', 'create_lead']);
        const result = await runLoop(o);
        expect(result.interruption).toMatchObject({ code: 'timeout' });
        expect(result.data).toMatchObject({ taskId: 'task-1' });
        expect(result.pendingActions).toHaveLength(1);
        expect(result.traceTools).toHaveLength(2);
        expect(result.usage).toEqual({ input: 20, output: 5, cacheRead: 7 });
        expect(result.text).toContain('Ажил нэмэгдлээ.');
        expect(mocks.execute).toHaveBeenCalledTimes(2);
        expect(o.ctx.onEvent).toHaveBeenCalledWith({ type: 'token_reset' });
    });

    it('returns completed work and stops remaining writes when the deadline expires between tools', async () => {
        rounds([call('create_task'), call('log_call', {}, 'call-2')]);
        const o = options(['create_task', 'log_call']);
        mocks.execute.mockImplementationOnce(async () => {
            o.ctx.deadlineAt = Date.now() - 1;
            return { success: true, taskId: 'task-1' };
        });
        const result = await runLoop(o);
        expect(result.interruption).toMatchObject({ code: 'timeout' });
        expect(result.traceTools).toHaveLength(1);
        expect(result.data).toMatchObject({ taskId: 'task-1' });
        expect(mocks.execute).toHaveBeenCalledTimes(1);
        expect(mocks.stream).toHaveBeenCalledTimes(1);
    });

    it('marks the last allowed round partial when there is no time left to summarize its write', async () => {
        rounds([call('create_task')]);
        const o = options(['create_task']);
        o.maxRounds = 1;
        mocks.execute.mockImplementationOnce(async () => {
            o.ctx.deadlineAt = Date.now() - 1;
            return { success: true, taskId: 'task-1' };
        });
        const result = await runLoop(o);
        expect(result.interruption).toMatchObject({ code: 'timeout' });
        expect(result.data).toMatchObject({ taskId: 'task-1' });
        expect(mocks.stream).toHaveBeenCalledTimes(1);
    });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Response, ResponseCreateParamsStreaming } from 'openai/resources/responses/responses';
import { runLoop, type LoopOptions } from '@/lib/ai/orchestrator/loop';
import { ASK_USER_TOOL, toClaudeTool } from '@/lib/ai/claude/tools';
import { streamResponse, toResponseInput, toResponseTools } from '../responses';

const mocks = vi.hoisted(() => ({ create: vi.fn(), execute: vi.fn() }));
vi.mock('@/lib/ai/openai/client', async (importOriginal) => ({ ...await importOriginal<object>(), openai: () => ({ responses: { create: mocks.create } }) }));
vi.mock('@/lib/ai/data-assistant', () => ({ executeDataTool: mocks.execute }));
vi.mock('@/lib/ai/data-assistant/functions', () => ({ generateChartConfig: () => null }));

const call = (name: string, args = '{}', id = 'call-1') => ({ type: 'function_call', name, arguments: args, call_id: id, id: `fc-${id}`, status: 'completed' });
const answer = (text = 'Бүртгэлээ.') => ({ type: 'message', role: 'assistant', id: 'msg-1', status: 'completed', content: [{ type: 'output_text', text, annotations: [] }] });
const response = (output: unknown[]) => ({ status: 'completed', output, usage: { input_tokens: 20, output_tokens: 5, input_tokens_details: { cached_tokens: 7 } } } as unknown as Response);
const requests: ResponseCreateParamsStreaming[] = [];
function rounds(...outputs: unknown[][]) {
    outputs.forEach((output) => mocks.create.mockImplementationOnce(async (params: ResponseCreateParamsStreaming) => {
        requests.push(structuredClone(params));
        return (async function* () {
            yield { type: 'response.output_text.delta', delta: 'текст' };
            yield { type: 'response.completed', response: response(output) };
        })();
    }));
}
function options(names = ['list_leads']): LoopOptions {
    return {
        model: 'gpt-6-astra', system: [{ type: 'text', text: 'Монгол хэлээр.' }],
        tools: names.map((name) => name === 'ask_user' ? ASK_USER_TOOL : toClaudeTool({ name, description: name })),
        messages: [{ role: 'user', content: 'Ажлыг хий.' }], streamText: true,
        ctx: { shopId: 'shop-1', userId: 'user-1', perms: { canWrite: true, canDelete: false, role: 'sales_manager' }, onEvent: vi.fn() },
        agentLabel: { id: 'main', name: 'AI', emoji: '' },
    };
}

beforeEach(() => { mocks.create.mockReset(); mocks.execute.mockReset(); requests.length = 0; });

describe('GPT Responses orchestration', () => {
    it('keeps reasoning, call IDs, tool results and real usage through streaming rounds', async () => {
        const reasoning = { type: 'reasoning', id: 'rs-1', summary: [], encrypted_content: 'opaque-reasoning' };
        rounds([reasoning, call('list_leads')], [answer('3 лид байна.')]);
        mocks.execute.mockResolvedValue({ leads: [1, 2, 3] });
        const o = options();
        const result = await runLoop(o);
        expect(result.text).toBe('3 лид байна.');
        expect(result.usage).toEqual({ input: 40, output: 10, cacheRead: 14 });
        expect(requests[0]).toMatchObject({ model: 'gpt-6-astra', store: false, include: ['reasoning.encrypted_content'], reasoning: { effort: 'medium' } });
        expect(requests[1].input).toEqual(expect.arrayContaining([reasoning, expect.objectContaining({ type: 'function_call_output', call_id: 'call-1', output: '{"leads":[1,2,3]}' })]));
        expect(o.ctx.onEvent).toHaveBeenCalledWith({ type: 'token', text: 'текст' });
        expect(mocks.execute).toHaveBeenCalledWith('list_leads', {}, 'shop-1', o.ctx.perms, 'user-1', false, '');
    });

    it('preserves the confirmation gate for business writes', async () => {
        rounds([call('create_lead')], [answer('Зөвшөөрөл хүлээж байна.')]);
        mocks.execute.mockResolvedValue({ requiresConfirmation: true, action: { tool: 'create_lead', args: { customer_name: 'Болд' } }, label: 'Лид үүсгэх', preview: {} });
        const result = await runLoop(options(['create_lead']));
        expect(mocks.execute.mock.calls[0][5]).toBe(false);
        expect(result.pendingActions).toHaveLength(1);
        expect(JSON.stringify(requests[1].input)).toContain('awaiting_user_confirmation');
    });

    it('does not repeat automatic writes even if arguments have different key ordering', async () => {
        rounds([call('create_task', '{"title":"Залгах","note":"Өнөөдөр"}')], [call('create_task', '{"note":"Өнөөдөр", "title":"Залгах"}', 'call-2')], [answer()]);
        mocks.execute.mockResolvedValue({ success: true, taskId: 'task-1' });
        await runLoop(options(['create_task']));
        expect(mocks.execute).toHaveBeenCalledTimes(1);
        expect(mocks.execute.mock.calls[0][5]).toBe(true);
        expect(requests[2].input).toEqual(expect.arrayContaining([expect.objectContaining({ type: 'function_call_output', call_id: 'call-2', output: '{"success":true,"taskId":"task-1"}' })]));
    });

    it('marks business errors as failed tools and does not retry the write', async () => {
        rounds([call('create_task')], [call('create_task', '{}', 'call-2')], [answer('Хадгалагдсангүй.')]);
        mocks.execute.mockResolvedValue({ error: 'Хадгалалтын алдаа' });
        const result = await runLoop(options(['create_task']));
        expect(mocks.execute).toHaveBeenCalledTimes(1);
        expect(result.traceTools[0]).toMatchObject({ ok: false, summary: 'Хадгалалтын алдаа' });
    });

    it.each(['invalid json', '[]', 'null'])('rejects malformed function arguments: %s', async (args) => {
        rounds([call('create_task', args)], [answer('Аргумент буруу.')]);
        await runLoop(options(['create_task']));
        expect(mocks.execute).not.toHaveBeenCalled();
    });

    it('rejects tools outside the current agent allowlist', async () => {
        rounds([call('delete_lead')], [answer('Эрхгүй.')]);
        await runLoop(options(['list_leads']));
        expect(mocks.execute).not.toHaveBeenCalled();
    });

    it('asks for missing details before executing other proposed actions', async () => {
        rounds([call('create_task'), call('ask_user', '{"question":"Аль лид вэ?"}', 'question')]);
        const result = await runLoop(options(['create_task', 'ask_user']));
        expect(result.clarification?.question).toBe('Аль лид вэ?');
        expect(mocks.execute).not.toHaveBeenCalled();
    });

    it('stops before model/tool execution when cancelled', async () => {
        const o = options(); o.ctx.signal = AbortSignal.abort();
        await expect(runLoop(o)).rejects.toThrow();
        expect(mocks.create).not.toHaveBeenCalled();
        expect(mocks.execute).not.toHaveBeenCalled();
    });

    it('never executes function calls from a disconnected stream', async () => {
        mocks.create.mockResolvedValue((async function* () { yield { type: 'response.output_item.done', item: call('create_task') }; })());
        await expect(runLoop(options(['create_task']))).rejects.toThrow('before completion');
        expect(mocks.execute).not.toHaveBeenCalled();
    });

    it('does not start a provider request after the deadline', async () => {
        await expect(streamResponse({ model: 'gpt-6-astra', instructions: '', input: [], tools: [], deadlineAt: Date.now() - 1 })).rejects.toThrow('deadline');
        expect(mocks.create).not.toHaveBeenCalled();
    });

    it('preserves completed writes, previews, trace and usage when a later provider round fails', async () => {
        rounds([call('create_task', '{"title":"Залгах"}'), call('create_lead', '{}', 'lead-preview')]);
        mocks.create.mockRejectedValueOnce(new DOMException('AI deadline reached', 'TimeoutError'));
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
        rounds([call('create_task'), call('log_call', '{}', 'call-2')]);
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
        expect(mocks.create).toHaveBeenCalledTimes(1);
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
        expect(mocks.create).toHaveBeenCalledTimes(1);
    });
});

describe('OpenAI input compatibility', () => {
    it('preserves optional parameters and native image/PDF content', () => {
        const tools = toResponseTools([toClaudeTool({ name: 'find_lead', description: 'Find', parameters: { type: 'object', properties: { phone: { type: 'string' } } } })]);
        expect(tools[0]).toMatchObject({ type: 'function', name: 'find_lead', strict: false });
        expect(tools[0].parameters?.required).toBeUndefined();
        const input = toResponseInput([{ role: 'user', content: [
            { type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'image' } },
            { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: 'pdf' } },
            { type: 'text', text: 'Гэрээг унш.' },
        ] }]);
        expect(input[0]).toMatchObject({ content: [
            { type: 'input_image', image_url: 'data:image/png;base64,image' },
            { type: 'input_file', filename: 'attachment.pdf', file_data: 'data:application/pdf;base64,pdf' },
            { type: 'input_text', text: 'Гэрээг унш.' },
        ] });
    });
});

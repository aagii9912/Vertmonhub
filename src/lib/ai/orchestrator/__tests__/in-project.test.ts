import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ResponseCreateParamsStreaming } from 'openai/resources/responses/responses';

const mocks = vi.hoisted(() => ({ create: vi.fn(), execute: vi.fn() }));
vi.mock('@supabase/supabase-js', () => ({
    createClient: () => ({
        from: () => {
            const chain = { select: () => chain, eq: () => chain, order: () => chain, limit: () => chain, then: (resolve: (v: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(resolve) };
            return chain;
        },
    }),
}));
vi.mock('@/lib/ai/data-assistant', () => ({ executeDataTool: mocks.execute }));
vi.mock('@/lib/ai/openai/client', async importOriginal => ({
    ...await importOriginal<object>(),
    openai: () => ({ responses: { create: mocks.create } }),
}));

import { buildInProjectTool } from '../projects';
import { runOrchestrator } from '../index';
import { buildSystemBlocks } from '../prompt';
import type { OrchestratorContext } from '../types';

const projects = [
    { shopId: 'shop-mandala', name: 'Mandala Garden' },
    { shopId: 'shop-elysium', name: 'Elysium Residence' },
];
const ctx = {
    shopId: 'shop-mandala', userId: 'user-1', userName: 'Батаа', projects,
    perms: { role: 'sales_manager', canWrite: true, canDelete: false, modules: ['ai-assistant', 'properties', 'leads'] },
};

beforeEach(() => {
    mocks.create.mockReset();
    mocks.execute.mockReset();
});

describe('in_project', () => {
    it('is offered only when the user can reach another project', () => {
        expect(buildInProjectTool({ ...ctx, projects: [projects[0]] })).toBeNull();
        const built = buildInProjectTool(ctx)!;
        expect(built.tool.input_schema.properties).toMatchObject({ project: { enum: ['Elysium Residence'] } });
    });

    it('runs a data tool in the other project with that shop and labels the result', async () => {
        mocks.execute.mockResolvedValue([{ code: 'Б1-52', rooms: 2 }]);
        const result = await buildInProjectTool(ctx)!.run({ project: 'Elysium Residence', tool: 'list_properties', args: { rooms: 2 } });
        expect(mocks.execute).toHaveBeenCalledWith('list_properties', { rooms: 2 }, 'shop-elysium', ctx.perms, 'user-1', false, 'Батаа');
        expect(result).toEqual({ project: 'Elysium Residence', items: [{ code: 'Б1-52', rooms: 2 }] });
    });

    it('never reaches unknown projects, the current project or non-data tools', async () => {
        const { run } = buildInProjectTool(ctx)!;
        expect(await run({ project: 'Other LLC', tool: 'list_leads' })).toHaveProperty('error', expect.stringContaining('Elysium Residence'));
        expect(await run({ project: 'Mandala Garden', tool: 'list_leads' })).toHaveProperty('error');
        expect(await run({ project: 'shop-foreign', tool: 'list_leads' })).toHaveProperty('error');
        for (const tool of ['ask_user', 'delegate_to_specialists', 'in_project', 'toString']) {
            expect(await run({ project: 'Elysium Residence', tool })).toHaveProperty('error');
        }
        expect(mocks.execute).not.toHaveBeenCalled();
    });

    it('turns writes, including AUTO tools, into a card bound to the other project', async () => {
        mocks.execute.mockResolvedValue({ requiresConfirmation: true, action: { tool: 'log_call', args: { lead_id: 'l1' } }, label: 'Дуудлага бүртгэх', preview: {} });
        const result = await buildInProjectTool(ctx)!.run({ project: 'Elysium Residence', tool: 'log_call', args: { lead_id: 'l1', summary: 'Ярьсан' } });
        expect(mocks.execute).toHaveBeenCalledWith('log_call', { lead_id: 'l1', summary: 'Ярьсан' }, 'shop-elysium', ctx.perms, 'user-1', false, 'Батаа');
        expect(result).toMatchObject({ requiresConfirmation: true, shopId: 'shop-elysium', label: 'Elysium Residence: Дуудлага бүртгэх' });
    });

    it('lists the reachable projects for the model', () => {
        const volatile = buildSystemBlocks(ctx as OrchestratorContext).at(-1)!.text;
        expect(volatile).toContain('одоогийн «Mandala Garden»');
        expect(volatile).toContain('«Elysium Residence»');
        expect(buildSystemBlocks({ ...ctx, projects: [projects[0]] } as OrchestratorContext).at(-1)!.text).not.toContain('ТӨСЛҮҮД');
    });
});

function stream(output: unknown[], text?: string) {
    return (async function* () {
        if (text) yield { type: 'response.output_text.delta', delta: text };
        yield { type: 'response.completed', response: { model: 'test-model', status: 'completed', output, usage: { input_tokens: 1, output_tokens: 1, input_tokens_details: { cached_tokens: 0 } } } };
    })();
}

describe('cross-project confirmation cards', () => {
    it('keep the target shop so approval runs in that project', async () => {
        const requests: ResponseCreateParamsStreaming[] = [];
        mocks.execute.mockResolvedValue({ requiresConfirmation: true, action: { tool: 'update_lead', args: { lead_id: 'l1', budget_max: 1 } }, label: 'Лид засах: Болд', preview: {} });
        mocks.create.mockImplementationOnce(async (request: ResponseCreateParamsStreaming) => {
            requests.push(request);
            return stream([{ type: 'function_call', id: 'f1', call_id: 'c1', name: 'in_project', status: 'completed',
                arguments: JSON.stringify({ project: 'Elysium Residence', tool: 'update_lead', args: { customer_name: 'Болд', budget_max: 1 } }) }]);
        });
        mocks.create.mockImplementationOnce(async () => stream([{ type: 'message', role: 'assistant', id: 'm1', status: 'completed', content: [{ type: 'output_text', text: 'Карт бэлэн.', annotations: [] }] }], 'Карт бэлэн.'));

        const result = await runOrchestrator('Elysium-ийн Болдын төсвийг засаарай', ctx as OrchestratorContext);
        expect(requests[0].tools?.map(tool => 'name' in tool ? tool.name : '')).toContain('in_project');
        expect(result.pendingActions).toEqual([expect.objectContaining({ tool: 'update_lead', shopId: 'shop-elysium', label: 'Elysium Residence: Лид засах: Болд' })]);
    });
});

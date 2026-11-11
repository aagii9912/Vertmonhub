import { beforeEach, describe, expect, it, vi } from 'vitest';
import type Anthropic from '@anthropic-ai/sdk';

const mocks = vi.hoisted(() => ({ create: vi.fn(), execute: vi.fn(), managerName: vi.fn() }));
vi.mock('@supabase/supabase-js', () => ({
    createClient: () => ({
        from: () => {
            const chain = { select: () => chain, eq: () => chain, order: () => chain, limit: () => chain, then: (resolve: (v: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(resolve) };
            return chain;
        },
    }),
}));
vi.mock('@/lib/ai/data-assistant', () => ({ executeDataTool: mocks.execute }));
vi.mock('@/lib/ai/data-assistant/functions', () => ({ resolveSalesManagerName: mocks.managerName }));
vi.mock('@/lib/ai/claude/client', async importOriginal => ({
    ...await importOriginal<object>(),
    claude: () => ({ messages: { stream: mocks.create } }),
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
    // Elysium-д бүртгэлийн нэр өөр (төсөл бүрийн бүртгэл).
    mocks.managerName.mockReset().mockImplementation(async (_user: string, fallback: string, shopId: string) => (shopId === 'shop-elysium' ? 'Батаа.Дорж' : fallback));
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
        expect(mocks.execute).toHaveBeenCalledWith('list_properties', { rooms: 2 }, 'shop-elysium', ctx.perms, 'user-1', false, 'Батаа.Дорж');
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
        expect(mocks.execute).toHaveBeenCalledWith('log_call', { lead_id: 'l1', summary: 'Ярьсан' }, 'shop-elysium', ctx.perms, 'user-1', false, 'Батаа.Дорж');
        expect(result).toMatchObject({ requiresConfirmation: true, shopId: 'shop-elysium', label: 'Elysium Residence: Дуудлага бүртгэх' });
    });

    it('lists the reachable projects for the model', () => {
        const volatile = buildSystemBlocks(ctx as OrchestratorContext).at(-1)!.text;
        expect(volatile).toContain('одоогийн «Mandala Garden»');
        expect(volatile).toContain('«Elysium Residence»');
        expect(buildSystemBlocks({ ...ctx, projects: [projects[0]] } as OrchestratorContext).at(-1)!.text).not.toContain('ТӨСЛҮҮД');
    });
});

/** Fake MessageStream: replays the text delta, then resolves the final message. */
function stream(content: unknown[], text?: string) {
    let onText: ((delta: string) => void) | undefined;
    const s = {
        on(event: string, cb: (delta: string) => void) { if (event === 'text') onText = cb; return s; },
        async finalMessage() {
            if (text) onText?.(text);
            const stop_reason = content.some((b) => (b as { type: string }).type === 'tool_use') ? 'tool_use' : 'end_turn';
            return { model: 'test-model', role: 'assistant', content, stop_reason, usage: { input_tokens: 1, output_tokens: 1, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 } };
        },
    };
    return s;
}

describe('cross-project confirmation cards', () => {
    it('keep the target shop so approval runs in that project', async () => {
        const requests: Anthropic.MessageStreamParams[] = [];
        mocks.execute.mockResolvedValue({ requiresConfirmation: true, action: { tool: 'update_lead', args: { lead_id: 'l1', budget_max: 1 } }, label: 'Лид засах: Болд', preview: {} });
        mocks.create.mockImplementationOnce((request: Anthropic.MessageStreamParams) => {
            requests.push(request);
            return stream([{ type: 'tool_use', id: 'c1', name: 'in_project',
                input: { project: 'Elysium Residence', tool: 'update_lead', args: { customer_name: 'Болд', budget_max: 1 } } }]);
        });
        mocks.create.mockImplementationOnce(() => stream([{ type: 'text', text: 'Карт бэлэн.' }], 'Карт бэлэн.'));

        const result = await runOrchestrator('Elysium-ийн Болдын төсвийг засаарай', ctx as OrchestratorContext);
        expect(requests[0].tools?.map(tool => 'name' in tool ? tool.name : '')).toContain('in_project');
        expect(result.pendingActions).toEqual([expect.objectContaining({ tool: 'update_lead', shopId: 'shop-elysium', label: 'Elysium Residence: Лид засах: Болд' })]);
    });
});

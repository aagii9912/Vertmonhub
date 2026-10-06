import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ResponseCreateParamsStreaming } from 'openai/resources/responses/responses';
import { runOrchestrator } from '../index';
import type { OrchestratorContext, OrchestratorEvent } from '../types';

// Keep the orchestrator, RBAC executor and inventory reader real. Only the
// provider and database transport are replaced, so empty listing inventory
// cannot hide a broken handoff from the actual unit inventory to the model.
const mocks = vi.hoisted(() => ({ create: vi.fn(), from: vi.fn() }));
vi.mock('@supabase/supabase-js', () => ({ createClient: () => ({ from: mocks.from }) }));
vi.mock('@/lib/ai/openai/client', async importOriginal => ({
    ...await importOriginal<object>(),
    openai: () => ({ responses: { create: mocks.create } }),
}));

type Row = Record<string, unknown>;
let tables: Record<string, Row[]>;
let failedTable: string | undefined;
const requests: ResponseCreateParamsStreaming[] = [];

function unit(id: string, values: Row = {}): Row {
    return {
        id, shop_id: 'shop-1', project_id: 'project-1', category: 'residential',
        phase: '1', block: '201', floor: '4', code: '201-440', unit_number: '440',
        rooms: 2, sale_area: 58.6, status: 'available', ...values,
    };
}

function toolPayload(request: ResponseCreateParamsStreaming): unknown {
    if (!Array.isArray(request.input)) throw new Error('Expected Responses input items');
    const output = request.input.find(item => item.type === 'function_call_output');
    if (!output || output.type !== 'function_call_output' || typeof output.output !== 'string') {
        throw new Error('Expected a serialized inventory tool result');
    }
    return JSON.parse(output.output);
}

function answer(text: string) {
    return {
        type: 'message', role: 'assistant', id: 'message-1', status: 'completed',
        content: [{ type: 'output_text', text, annotations: [] }],
    };
}

function responseStream(output: unknown[], text?: string) {
    return (async function* () {
        if (text) yield { type: 'response.output_text.delta', delta: text };
        yield {
            type: 'response.completed',
            response: {
                model: 'test-model', status: 'completed', output,
                usage: { input_tokens: 20, output_tokens: 5, input_tokens_details: { cached_tokens: 0 } },
            },
        };
    })();
}

function propertyRounds(synthesize: (payload: unknown) => string) {
    mocks.create.mockImplementationOnce(async (request: ResponseCreateParamsStreaming) => {
        requests.push(structuredClone(request));
        return responseStream([{
            type: 'function_call', id: 'function-1', call_id: 'inventory-call',
            name: 'list_properties', arguments: '{"rooms":2,"status":"available"}', status: 'completed',
        }]);
    });
    mocks.create.mockImplementationOnce(async (request: ResponseCreateParamsStreaming) => {
        requests.push(structuredClone(request));
        const text = synthesize(toolPayload(request));
        return responseStream([answer(text)], text);
    });
}

function context(events: OrchestratorEvent[], modules = ['ai-assistant', 'properties']): OrchestratorContext {
    return {
        shopId: 'shop-1', userId: 'user-1', userName: 'Болд',
        perms: { role: 'sales_manager', canWrite: false, canDelete: false, modules },
        onEvent: event => { events.push(event); },
    };
}

beforeEach(() => {
    mocks.create.mockReset();
    mocks.from.mockReset();
    requests.length = 0;
    failedTable = undefined;
    tables = { properties: [], property_units: [], projects: [], erp_imports: [], ai_shop_memory: [] };
    mocks.from.mockImplementation((table: string) => {
        if (!(table in tables)) throw new Error(`Unexpected source: ${table}`);
        let rows = tables[table];
        let limit = Number.POSITIVE_INFINITY;
        const chain = {
            select: () => chain,
            eq: (field: string, value: unknown) => { rows = rows.filter(row => row[field] === value); return chain; },
            is: (field: string, value: unknown) => { rows = rows.filter(row => row[field] === value); return chain; },
            in: (field: string, values: unknown[]) => { rows = rows.filter(row => values.includes(row[field])); return chain; },
            lte: (field: string, value: string) => { rows = rows.filter(row => String(row[field]) <= value); return chain; },
            order: () => chain,
            range: (from: number, to: number) => { rows = rows.slice(from, to + 1); return chain; },
            limit: (value: number) => { limit = value; return chain; },
            then: (resolve: (value: unknown) => unknown) => Promise.resolve({
                data: failedTable === table ? null : rows.slice(0, limit),
                error: failedTable === table ? { message: 'Inventory database unavailable' } : null,
            }).then(resolve),
        };
        return chain;
    });
});

describe('simple property questions through the Responses orchestrator', () => {
    it.each(['2 өрөө байр байна уу?', '2uruu bair bnu'])('answers %s from available units when listings are empty', async message => {
        tables.property_units = [
            unit('available-two'),
            unit('sold-two', { status: 'sold' }),
            unit('reserved-two', { status: 'reserved' }),
            unit('available-three', { rooms: 3 }),
            unit('parking', { category: 'parking' }),
            unit('foreign', { shop_id: 'other-shop' }),
        ];
        propertyRounds(payload => {
            const first = Array.isArray(payload) ? payload[0] as Row | undefined : undefined;
            return first
                ? `Тийм, ${first.rooms} өрөө байр байна. ${first.block} блокийн ${first.unit_number} тоот, ${first.size_sqm} м². ${first.priceFormatted}.`
                : 'Одоогоор боломжтой 2 өрөө байр олдсонгүй.';
        });
        const events: OrchestratorEvent[] = [];
        const result = await runOrchestrator(message, context(events));

        expect(JSON.stringify(requests[0].input)).toContain(message);
        expect(result.text).toContain('Тийм, 2 өрөө байр байна.');
        expect(result.text).toContain('58.6 м²');
        expect(toolPayload(requests[1])).toEqual([expect.objectContaining({
            id: 'available-two', source: 'property_units', rooms: 2,
            code: '201-440', size_sqm: 58.6, status: 'available', price: null,
        })]);
        expect(result.data).toEqual(toolPayload(requests[1]));
        expect(result.trace).toMatchObject({ rounds: 2, tools: [{ tool: 'list_properties', ok: true, summary: '1 байр олдлоо' }], steps: [] });
        expect(result.pendingActions).toEqual([]);
        expect(result.clarification).toBeNull();
        expect(events).toContainEqual(expect.objectContaining({ type: 'tool_done', tool: 'list_properties', ok: true, summary: '1 байр олдлоо' }));
        expect(events).toContainEqual({ type: 'token', text: result.text });
        expect(mocks.create).toHaveBeenCalledTimes(2);
    });

    it('answers a project shop with no unit register from its latest ERP product export', async () => {
        // Elysium: байрны бүртгэл хоосон, үлдэгдэл зөвхөн ERP-ийн бүтээгдэхүүний экспортод.
        const columns = ['Код', 'Давхар', 'Загвар', 'Өрөөний тоо', 'Борлуулах талбай', 'Нийт борлуулах үнэ', 'Бүтээгдэхүүний төлөв', 'Бүтээгдэхүүний төрөл'];
        const product = (code: string, rooms: string, status: string) => Object.fromEntries(columns.map((column, i) =>
            [column, [code, '05', 'E2', rooms, '64.16', '365712000', status, 'Орон сууц'][i]]));
        tables.projects = [{ id: 'project-el', shop_id: 'shop-1', name: 'Elysium Residence', district: null }];
        tables.erp_imports = [{
            id: 'snapshot-1', shop_id: 'shop-1', source: 'Elysium ERP', report_date: '2026-10-01', columns,
            datasets: [{ name: 'Products', columns, keyColumns: ['Код'], rows: [
                product('Б1-52', '2', 'Худалдаанд'), product('Б1-53', '2', 'Гэрээ баталгаажсан'), product('Б1-54', '3', 'Худалдаанд'),
            ] }],
        }];
        propertyRounds(payload => {
            const first = Array.isArray(payload) ? payload[0] as Row | undefined : undefined;
            return first ? `Тийм, ${first.code} тоот ${first.rooms} өрөө байр байна (${first.priceFormatted}).` : 'Олдсонгүй.';
        });

        const result = await runOrchestrator('2uruu bair bnu', context([], ['ai-assistant', 'properties', 'erp-imports']));
        expect(toolPayload(requests[1])).toEqual([expect.objectContaining({
            source: 'erp_products', as_of: '2026-10-01', code: 'Б1-52', rooms: 2, status: 'available', price: 365712000,
        })]);
        expect(result.text).toContain('Тийм, Б1-52 тоот 2 өрөө байр байна');
        expect(result.trace.tools).toEqual([expect.objectContaining({ tool: 'list_properties', ok: true, summary: '1 байр олдлоо' })]);
    });

    it('reports no matching stock only after successfully reading inventory', async () => {
        tables.property_units = [unit('sold-two', { status: 'sold' }), unit('available-three', { rooms: 3 })];
        propertyRounds(() => 'Одоогоор боломжтой 2 өрөө байр олдсонгүй.');

        const result = await runOrchestrator('2 өрөө байр байна уу?', context([]));
        expect(result.data).toEqual([]);
        expect(toolPayload(requests[1])).toEqual([]);
        expect(result.text).toContain('2 өрөө байр олдсонгүй');
        expect(result.trace.tools).toEqual([expect.objectContaining({ tool: 'list_properties', ok: true, summary: 'Олдсонгүй' })]);
        expect(mocks.from).toHaveBeenCalledWith('property_units');
    });

    it('passes inventory read failure to the model as an error instead of empty stock', async () => {
        failedTable = 'property_units';
        propertyRounds(payload => payload && typeof payload === 'object' && 'error' in payload
            ? 'Байрны нөөцийг шалгаж чадсангүй. Дахин оролдоно уу.'
            : 'Одоогоор боломжтой 2 өрөө байр олдсонгүй.');

        const result = await runOrchestrator('2 өрөө байр байна уу?', context([]));
        expect(result.data).toEqual(expect.objectContaining({ error: expect.any(String) }));
        expect(toolPayload(requests[1])).toEqual(expect.objectContaining({ error: expect.any(String) }));
        expect(result.text).toContain('шалгаж чадсангүй');
        expect(result.trace.tools).toEqual([expect.objectContaining({ tool: 'list_properties', ok: false })]);
        expect(result.trace.tools[0].summary).not.toBe('Олдсонгүй');
    });

    it('does not query inventory when the user lacks property access', async () => {
        propertyRounds(() => 'Байрны мэдээлэл харах эрх танд алга.');

        const result = await runOrchestrator('2 өрөө байр байна уу?', context([], ['ai-assistant', 'leads']));
        expect(requests[0].tools?.map(tool => 'name' in tool ? tool.name : '')).not.toContain('list_properties');
        expect(mocks.from).not.toHaveBeenCalledWith('properties');
        expect(mocks.from).not.toHaveBeenCalledWith('property_units');
        expect(mocks.from).not.toHaveBeenCalledWith('erp_imports');
        expect(toolPayload(requests[1])).toEqual(expect.objectContaining({ error: expect.any(String) }));
        expect(result.trace.tools).toEqual([]);
        expect(result.text).toContain('эрх танд алга');
    });
});

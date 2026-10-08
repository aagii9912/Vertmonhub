import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { loadViewingPricingConditions, quoteViewingSelection } from '../pricing-store';
import type { PricingDraft } from '../pricing';
import type { ViewingUnitOption } from '@/lib/viewings/interests';

const shopId = 'shop', projectId = 'project';
const scope = { projectIds: [projectId], managerName: 'Бат' };
const unit: ViewingUnitOption = { id: 'unit', project_id: projectId, block: 'Б1', model: 'E6', area_sqm: 51.72,
    floor: 5, unit_number: '0501', code: 'Б1-0501', status: 'available' };
const inventory = { ...unit, floor: '05', sale_area: 51.72, updated_sale_area: 0, contracted_area: null, shop_id: shopId, category: 'residential' };
const rule = { block: 'Б1', model: 'E6', floor_min: 2, floor_max: 23, payment_condition: 'Баталсан нөхцөл', price_per_sqm: 3_000_000, advance_percent: 25 };
const draft: PricingDraft = { source: 'Тестийн баталсан үнэ', valid_from: '2026-10-01', valid_until: '2026-10-31', inventory_area_confirmed: true, rules: [rule] };
const config = (patch: Partial<PricingDraft> = {}) => ({ id: 'config', shop_id: shopId, version: 1, status: 'active', config: { ...draft, ...patch } });

function database({ projectName = 'Elysium Residence', pricing = null, missingProject = false, failingTable }: {
    projectName?: string; pricing?: ReturnType<typeof config> | null; missingProject?: boolean; failingTable?: string;
} = {}) {
    const tables: Record<string, Record<string, unknown>[]> = {
        projects: missingProject ? [] : [{ id: projectId, shop_id: shopId, name: projectName }],
        project_pricing_configs: pricing ? [pricing] : [], property_units: [inventory],
    };
    const calls: { table: string; filters: unknown[][] }[] = [];
    const db = { from(table: string) {
        const filters: unknown[][] = []; calls.push({ table, filters });
        const result = () => ({ data: (tables[table] ?? []).filter(row => filters.every(([field, value, within]) => within
            ? (value as unknown[]).includes(row[field as string]) : row[field as string] === value)),
        error: table === failingTable ? { message: 'Database unavailable' } : null });
        const chain = { select: () => chain, order: () => chain, limit: () => chain,
            eq: (field: string, value: unknown) => { filters.push([field, value]); return chain; },
            in: (field: string, value: unknown[]) => { filters.push([field, value, true]); return chain; },
            range: async () => result(),
            maybeSingle: async () => { const response = result(); return { ...response, data: response.data[0] ?? null }; },
        }; return chain;
    } } as unknown as SupabaseClient;
    return { db, calls };
}

const choices = async (db: SupabaseClient, units: readonly ViewingUnitOption[] = [unit]) =>
    loadViewingPricingConditions(db, shopId, scope, '2026-10-08', { projectId, units });

describe('viewing conditions server loader', () => {
    it('returns Elysium choices without an active monetary offer and checks the project belongs to the shop', async () => {
        const { db, calls } = database();
        expect(await choices(db)).toEqual({ conditions: ['10-30%', '30%'].map(payment_condition => ({
            block: 'Б1', model: 'E6', floor_min: 5, floor_max: 5, payment_condition,
        })), reason: 'Нөхцөлөө сонгож хадгалж болно. Үнэ, урьдчилгааны дүн батлагдаагүй.' });
        expect(calls[0]).toEqual({ table: 'projects', filters: [['shop_id', shopId], ['id', projectId]] });
        expect(calls.map(call => call.table)).toEqual(['projects', 'project_pricing_configs']);
    });

    it.each([{ valid_from: '2026-05-11', valid_until: '2026-08-31' }, { inventory_area_confirmed: false }])('keeps choices available when pricing is expired or unconfirmed: %j', async patch => {
        const result = await choices(database({ pricing: config(patch) }).db);
        expect(result.conditions.map(condition => condition.payment_condition)).toEqual(['10-30%', '30%']);
        expect(result.reason).toContain('Үнэ, урьдчилгааны дүн батлагдаагүй');
    });

    it('uses current approved configuration conditions without adding catalog fallback choices', async () => {
        expect(await choices(database({ pricing: config() }).db)).toEqual({ conditions: [{
            block: rule.block, model: rule.model, floor_min: rule.floor_min, floor_max: rule.floor_max, payment_condition: rule.payment_condition,
        }], reason: null });
    });

    it('loads scoped residential inventory when the caller has not supplied units', async () => {
        const { db, calls } = database();
        const result = await loadViewingPricingConditions(db, shopId, scope, '2026-10-08', { projectId });
        expect(result.conditions.map(condition => condition.payment_condition)).toEqual(['10-30%', '30%']);
        const query = calls.find(call => call.table === 'property_units');
        expect(query?.filters).toContainEqual(['shop_id', shopId]);
        expect(query?.filters).toContainEqual(['category', 'residential']);
        expect(query?.filters).toContainEqual(['project_id', [projectId], true]);
    });

    it('does not apply Elysium fallback to another verified project', async () => {
        expect(await choices(database({ projectName: 'Mandala Garden' }).db)).toMatchObject({ conditions: [] });
    });

    it.each([{ projectIds: [], managerName: 'Бат' }, { projectIds: ['foreign'], managerName: 'Бат' }])('refuses conditions without access to the selected project: %j', async deniedScope => {
        const { db, calls } = database();
        const result = await loadViewingPricingConditions(db, shopId, deniedScope, '2026-10-08', { projectId, units: [unit] });
        expect(result.conditions).toEqual([]);
        expect(calls).toEqual([]);
    });

    it('rejects an absent project and excludes caller-provided units from another project', async () => {
        expect(await choices(database({ missingProject: true }).db)).toEqual({ conditions: [], reason: 'Төсөл олдсонгүй' });
        expect(await choices(database().db, [{ ...unit, project_id: 'foreign' }])).toMatchObject({ conditions: [] });
    });

    it.each(['projects', 'project_pricing_configs'])('fails closed on a %s query error instead of returning fallback choices', async failingTable => {
        await expect(choices(database({ failingTable }).db)).rejects.toMatchObject({ status: 503 });
    });

    it('keeps a selected condition quote unavailable when there is no active pricing', async () => {
        const { db } = database();
        const condition = (await choices(db)).conditions[0].payment_condition;
        expect(await quoteViewingSelection(db, shopId, { block: unit.block, model: unit.model, area_sqm: unit.area_sqm,
            floor: unit.floor, payment_condition: condition }, scope, '2026-10-08'))
            .toEqual({ available: false, reason: 'Баталсан үнийн тохиргоо байхгүй', quote: null });
    });
});

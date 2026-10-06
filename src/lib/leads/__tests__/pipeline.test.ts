import { describe, expect, it } from 'vitest';
import { PIPELINE_STAGE_RULES, buildPipelineSummary, movePipelineLead, pipelineTotals, type PipelineLead } from '../pipeline';

const now = Date.parse('2026-10-05T04:00:00Z');
const daysAgo = (n: number) => new Date(now - n * 86_400_000).toISOString();
const lead = (status: string, extra: Partial<PipelineLead> = {}): PipelineLead => ({
    status, budget_min: null, budget_max: null, next_followup_at: null, stage_changed_at: daysAgo(0), created_at: daysAgo(30), ...extra,
});
const stage = (summary: ReturnType<typeof buildPipelineSummary>, status: string) => summary.stages.find(s => s.status === status);

describe('pipeline summary', () => {
    it('counts each stage with budget mid-point values, stalled and no-next-step leads', () => {
        const summary = buildPipelineSummary([
            lead('new', { budget_min: 100, budget_max: 300, stage_changed_at: daysAgo(3) }), // 3 хоног → зогссон, алхамгүй
            lead('new', { budget_max: 50, next_followup_at: daysAgo(-1), stage_changed_at: daysAgo(2) }),
            lead('negotiating', { budget_min: '1000', stage_changed_at: null, created_at: daysAgo(10) }), // created_at-аар 10 хоног
            lead('closed_won', { budget_min: 400, budget_max: 600, stage_changed_at: daysAgo(100) }), // хаагдсан: зогсдоггүй
            lead('closed_lost', { budget_min: 70 }),
            lead('archived'), // самбарт байхгүй төлөв
        ], now);

        expect(summary.stages.map(s => s.status)).toEqual(PIPELINE_STAGE_RULES.map(rule => rule.key));
        expect(stage(summary, 'new')).toEqual({ status: 'new', count: 2, value: 250, stalled: 1, noNextStep: 1 });
        expect(stage(summary, 'negotiating')).toEqual({ status: 'negotiating', count: 1, value: 1000, stalled: 1, noNextStep: 1 });
        expect(stage(summary, 'closed_won')).toEqual({ status: 'closed_won', count: 1, value: 500, stalled: 0, noNextStep: 0 });
        expect(stage(summary, 'contacted')).toEqual({ status: 'contacted', count: 0, value: 0, stalled: 0, noNextStep: 0 });
        expect(pipelineTotals(summary)).toEqual({
            total: 5, openValue: 1250, weightedForecast: 250 * 0.1 + 1000 * 0.8, wonValue: 500, stalled: 2, noNextStep: 2,
        });
    });

    it('moves a card between stages exactly like a recount, and back', () => {
        const others = [lead('new', { budget_min: 10 }), lead('contacted', { next_followup_at: daysAgo(-2) })];
        const before = lead('negotiating', { budget_min: 900, stage_changed_at: daysAgo(12) });
        const after = { ...before, status: 'closed_won', stage_changed_at: new Date(now).toISOString() };
        const original = buildPipelineSummary([...others, before], now);
        const snapshot = structuredClone(original);

        const moved = movePipelineLead(original, before, after, now);
        expect(moved).toEqual(buildPipelineSummary([...others, after], now));
        expect(movePipelineLead(moved, after, before, now)).toEqual(original);
        // Кэшийн хуучин объект өөрчлөгдөхгүй.
        expect(original).toEqual(snapshot);
    });

    it('never counts below zero when the server count was already stale', () => {
        const moved = movePipelineLead(buildPipelineSummary([], now), lead('new', { budget_min: 5 }), lead('contacted', { budget_min: 5 }), now);
        expect(stage(moved, 'new')).toEqual({ status: 'new', count: 0, value: 0, stalled: 0, noNextStep: 0 });
        expect(stage(moved, 'contacted')).toMatchObject({ count: 1, value: 5 });
    });
});

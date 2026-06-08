import { describe, it, expect } from 'vitest';
import { computeScore } from '@/lib/services/CustomerScoringService';

const now = new Date();
const daysAgo = (d: number) => new Date(now.getTime() - d * 86400000).toISOString();

describe('computeScore', () => {
    it('rates an engaged, recently-contacted lead with a high-interest viewing as a hot A-tier', () => {
        const result = computeScore({
            createdAt: daysAgo(20),
            lastContactAt: daysAgo(2),
            messageCount: 12,
            aiMemory: { budget: '300m', rooms: '2' },
            tags: ['interest:apartment', 'budget:300m'],
            leads: [{ status: 'negotiating', budget_max: 300_000_000, urgency: 'urgent' }],
            viewings: [{ status: 'completed', interest_level: 5 }],
        });

        expect(result.score).toBeGreaterThanOrEqual(70);
        expect(result.tier).toBe('A');
        expect(result.stage).toBe('negotiating');
        expect(result.temperature).toBe('hot');
    });

    it('marks a long-inactive prospect as dormant C-tier with a low score', () => {
        const result = computeScore({
            createdAt: daysAgo(200),
            lastContactAt: daysAgo(150),
            messageCount: 1,
            aiMemory: null,
            tags: [],
            leads: [],
            viewings: [],
        });

        expect(result.score).toBeLessThan(40);
        expect(result.tier).toBe('C');
        expect(result.stage).toBe('dormant');
        expect(result.temperature).toBe('dormant');
    });

    it('derives the won stage when any lead is closed_won', () => {
        const result = computeScore({
            createdAt: daysAgo(30),
            lastContactAt: daysAgo(5),
            messageCount: 4,
            leads: [{ status: 'closed_won' }],
            viewings: [{ status: 'completed', interest_level: 4 }],
        });

        expect(result.stage).toBe('won');
    });

    it('caps the score at 100', () => {
        const result = computeScore({
            createdAt: daysAgo(1),
            lastContactAt: daysAgo(1),
            messageCount: 100,
            aiMemory: { budget: 'x', rooms: 'y' },
            tags: ['budget:1b', 'stage:hot'],
            leads: [{ status: 'closed_won', budget_max: 1, urgency: 'urgent' }],
            viewings: [{ status: 'completed', interest_level: 5 }],
        });

        expect(result.score).toBeLessThanOrEqual(100);
    });

    it('treats a brand-new contact with no activity as a prospect', () => {
        const result = computeScore({
            createdAt: daysAgo(0),
            lastContactAt: null,
            messageCount: 0,
            leads: [],
            viewings: [],
        });

        expect(result.stage).toBe('prospect');
    });
});

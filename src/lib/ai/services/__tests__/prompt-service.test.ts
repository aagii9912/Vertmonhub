/**
 * PromptService unit tests
 * Token budget clamp ба динамик tool жагсаалт
 */

import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/utils/logger', () => ({
    logger: { info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn(), success: vi.fn() },
}));

import { clampSection, buildToolsSection, SECTION_CHAR_LIMITS } from '@/lib/ai/services/PromptService';

describe('clampSection', () => {
    it('leaves short content unchanged', () => {
        const content = 'богино агуулга';
        expect(clampSection(content, 100, 'test')).toBe(content);
    });

    it('truncates long content and appends a notice', () => {
        const content = 'x'.repeat(500);
        const result = clampSection(content, 100, 'тест хэсэг');
        expect(result.length).toBeLessThan(content.length);
        expect(result).toContain('тест хэсэг');
        expect(result.startsWith('x'.repeat(100))).toBe(true);
    });

    it('has sane default budgets', () => {
        expect(SECTION_CHAR_LIMITS.properties).toBeGreaterThan(0);
        expect(SECTION_CHAR_LIMITS.faqs).toBeGreaterThan(0);
        expect(SECTION_CHAR_LIMITS.knowledge).toBeGreaterThan(0);
    });
});

describe('buildToolsSection', () => {
    it('lists all tools when no filter provided', () => {
        const section = buildToolsSection();
        expect(section).toContain('search_properties');
        expect(section).toContain('append_customer_note');
        // 10 tool → 10 numbered lines
        expect(section.split('\n')).toHaveLength(10);
    });

    it('lists only enabled tools', () => {
        const section = buildToolsSection(['search_properties', 'calculate_loan']);
        expect(section).toContain('search_properties');
        expect(section).toContain('calculate_loan');
        expect(section).not.toContain('append_customer_note');
        expect(section.split('\n')).toHaveLength(2);
    });

    it('renumbers sequentially for the filtered subset', () => {
        const section = buildToolsSection(['schedule_viewing']);
        expect(section.startsWith('1. schedule_viewing')).toBe(true);
    });

    it('falls back to all tools for an empty list', () => {
        const section = buildToolsSection([]);
        expect(section.split('\n')).toHaveLength(10);
    });
});

import { describe, expect, it } from 'vitest';
import {
    DEFAULT_LEAD_CATEGORIES, LEAD_CATEGORY_NAME_MAX, LEAD_CATEGORY_TONE_KEYS, UNCATEGORIZED_LABEL,
    categoryNameKey, categoryOptionLabel, categoryTone, isUncategorizedInput, leadCategoryLabel, normalizeCategoryName,
} from '../labels';

describe('lead category vocabulary', () => {
    it('normalizes names and compares them case-insensitively', () => {
        expect(normalizeCategoryName('  Дилер   /  Агент ')).toBe('Дилер / Агент');
        expect(normalizeCategoryName('   ')).toBeNull();
        expect(normalizeCategoryName(5)).toBeNull();
        expect(categoryNameKey('ХӨРӨНГӨ  Оруулагч')).toBe(categoryNameKey('хөрөнгө оруулагч'));
    });

    it('treats blank, none and the uncategorized label as clearing', () => {
        for (const raw of [null, undefined, '', '  ', 'none', 'NONE', UNCATEGORIZED_LABEL, ' ангилалгүй ']) expect(isUncategorizedInput(raw)).toBe(true);
        for (const raw of ['Бартер', 0, false]) expect(isUncategorizedInput(raw)).toBe(false);
    });

    it('labels a lead category, the uncategorized state and archived options', () => {
        const categories = [{ id: 'a', name: 'Бартер', is_active: false }, { id: 'b', name: 'Хөрөнгө оруулагч', is_active: true }];
        expect(leadCategoryLabel(categories, null)).toBe(UNCATEGORIZED_LABEL);
        expect(leadCategoryLabel(categories, 'b')).toBe('Хөрөнгө оруулагч');
        expect(leadCategoryLabel(categories, 'a')).toBe('Бартер');
        expect(leadCategoryLabel(categories, 'a', { markArchived: true })).toBe('Бартер (архив)');
        expect(leadCategoryLabel(categories, 'missing')).toBe('—');
        expect(categoryOptionLabel(categories[1])).toBe('Хөрөнгө оруулагч');
    });

    it('keeps tones to the non-error status palette', () => {
        expect(LEAD_CATEGORY_TONE_KEYS).not.toContain('danger');
        expect(categoryTone('danger')).toBe('neutral');
        expect(categoryTone('success')).toBe('success');
        expect(categoryTone(null)).toBe('neutral');
    });

    it('ships a valid, unique suggested preset', () => {
        const keys = DEFAULT_LEAD_CATEGORIES.map((preset) => categoryNameKey(preset.name));
        expect(new Set(keys).size).toBe(DEFAULT_LEAD_CATEGORIES.length);
        for (const preset of DEFAULT_LEAD_CATEGORIES) {
            expect(preset.name.length).toBeLessThanOrEqual(LEAD_CATEGORY_NAME_MAX);
            expect(normalizeCategoryName(preset.name)).toBe(preset.name);
            expect(LEAD_CATEGORY_TONE_KEYS).toContain(preset.tone);
        }
        expect(DEFAULT_LEAD_CATEGORIES.map((preset) => preset.name)).toEqual([
            'Орон сууц худалдан авагч', 'Хөрөнгө оруулагч', 'Оффис / арилжааны талбай', 'Түрээслэгч', 'Бартер', 'Дилер / Агент',
        ]);
    });
});

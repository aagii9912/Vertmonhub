import { describe, expect, it } from 'vitest';
import { orSearchTerm } from '../search';

describe('orSearchTerm', () => {
    it('keeps ordinary names, phones and emails', () => {
        expect(orSearchTerm('  Г. Энхжин ')).toBe('Г. Энхжин');
        expect(orSearchTerm('9911 2233')).toBe('9911 2233');
        expect(orSearchTerm('bat@example.mn')).toBe('bat@example.mn');
    });

    it('drops characters that break an .or() filter or act as LIKE wildcards', () => {
        expect(orSearchTerm('Бат, Болд')).toBe('Бат Болд');
        expect(orSearchTerm('Болд (Мандала)')).toBe('Болд Мандала');
        expect(orSearchTerm('name.eq.x),id.neq.(0')).toBe('name.eq.x id.neq. 0');
        expect(orSearchTerm('50%_*\\')).toBe('50');
    });

    it('returns an empty term when nothing searchable is left', () => {
        expect(orSearchTerm(' ,() ')).toBe('');
    });
});

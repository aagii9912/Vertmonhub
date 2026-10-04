import { describe, expect, it } from 'vitest';
import { contractStatusLabel } from '../labels';

describe('contractStatusLabel', () => {
    it('labels every stored contract status, including transferred units', () => {
        expect(contractStatusLabel('active')).toBe('Идэвхтэй');
        expect(contractStatusLabel('closed')).toBe('Хаагдсан');
        expect(contractStatusLabel('cancelled')).toBe('Цуцалсан');
        expect(contractStatusLabel('transferred')).toBe('Тоот шилжсэн');
        expect(contractStatusLabel(null)).toBe('—');
    });
});

import { expect, it } from 'vitest';
import { dayHeading } from '../labels';

it('groups and labels meetings by Ulaanbaatar day across midnight and year boundaries', () => {
    expect(dayHeading(new Date('2026-09-28T18:00:00Z'), new Date('2026-09-28T10:00:00Z'))).toBe('Маргааш · Мягмар, 9-р сарын 29');
    expect(dayHeading(new Date('2026-12-31T18:00:00Z'), new Date('2026-09-28T10:00:00Z'))).toBe('2027 · Баасан, 1-р сарын 1');
});

import { afterEach, describe, expect, it } from 'vitest';
import { MetaSyncInput } from '../meta-spend';
import { META_SYNC_MAX_DAYS, metaSyncRange } from '../meta-sync-range';

const original = process.env.TZ;
afterEach(() => { process.env.TZ = original; });

describe.each(['UTC', 'Asia/Ulaanbaatar'])('metaSyncRange (TZ=%s)', tz => {
    it('keeps a range of up to 93 days as is', () => {
        process.env.TZ = tz;
        expect(metaSyncRange({ from: '2026-10-01', to: '2026-10-31' })).toEqual({ from: '2026-10-01', to: '2026-10-31', clamped: false });
        // Яг 93 өдөр (07-01 … 10-01) — хязгаар дотор.
        expect(metaSyncRange({ from: '2026-07-01', to: '2026-10-01' })).toEqual({ from: '2026-07-01', to: '2026-10-01', clamped: false });
    });

    it('limits a longer range to its last 93 days ending at the range end, which the server accepts', () => {
        process.env.TZ = tz;
        const year = metaSyncRange({ from: '2026-01-01', to: '2026-10-25' });
        expect(year).toEqual({ from: '2026-07-25', to: '2026-10-25', clamped: true });
        expect(Date.parse(year.to) - Date.parse(year.from)).toBe((META_SYNC_MAX_DAYS - 1) * 86_400_000);
        expect(MetaSyncInput.safeParse({ from: year.from, to: year.to }).success).toBe(true);
        expect(MetaSyncInput.safeParse({ from: '2026-07-24', to: '2026-10-25' }).success).toBe(false);
        // Сарын/жилийн хил, өндөр жил.
        expect(metaSyncRange({ from: '2027-01-01', to: '2028-03-01' })).toEqual({ from: '2027-11-30', to: '2028-03-01', clamped: true });
    });

    it('leaves an incomplete or reversed range to the server validation', () => {
        process.env.TZ = tz;
        expect(metaSyncRange({ from: '', to: '2026-10-25' })).toEqual({ from: '', to: '2026-10-25', clamped: false });
        expect(metaSyncRange({ from: '2026-10-25', to: '2026-10-01' })).toEqual({ from: '2026-10-25', to: '2026-10-01', clamped: false });
        expect(metaSyncRange({ from: '2026-01-01', to: '2026-02-30' })).toEqual({ from: '2026-01-01', to: '2026-02-30', clamped: false });
    });
});

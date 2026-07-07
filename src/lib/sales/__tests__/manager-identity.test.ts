import { describe, it, expect } from 'vitest';
import { matchRosterEntry, type RosterEntry } from '../manager-identity';

const UID = '11111111-1111-1111-1111-111111111111';
const OTHER_UID = '22222222-2222-2222-2222-222222222222';

const roster: RosterEntry[] = [
    { name: 'Батаа', user_id: UID, is_active: true },
    { name: 'Сараа', user_id: null, is_active: true },
    { name: 'Дорж', user_id: OTHER_UID, is_active: false },
];

describe('matchRosterEntry', () => {
    it('user_id таарц нэрийн таарцаас давамгайлна', () => {
        // fullName нь Сараа ч, user_id нь Батаагийн бүртгэлтэй таарна
        const entry = matchRosterEntry(roster, UID, 'Сараа');
        expect(entry?.name).toBe('Батаа');
    });

    it('user_id таараагүй бол нэрээр таарна', () => {
        const entry = matchRosterEntry(roster, 'unknown-uid', 'Сараа');
        expect(entry?.name).toBe('Сараа');
    });

    it('идэвхгүй бүртгэл ч user_id-гаар таарна (isManager шийдвэрийг дуудагч гаргана)', () => {
        const entry = matchRosterEntry(roster, OTHER_UID, null);
        expect(entry?.name).toBe('Дорж');
        expect(entry?.is_active).toBe(false);
    });

    it('юу ч таараагүй бол null', () => {
        expect(matchRosterEntry(roster, 'unknown-uid', 'Огт өөр нэр')).toBeNull();
        expect(matchRosterEntry(roster, 'unknown-uid', null)).toBeNull();
    });

    it('хоосон roster-т null', () => {
        expect(matchRosterEntry([], UID, 'Батаа')).toBeNull();
    });

    it('fullName null үед user_id-гаар л хайна', () => {
        const entry = matchRosterEntry(roster, UID, null);
        expect(entry?.name).toBe('Батаа');
    });
});

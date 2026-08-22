import { describe, it, expect } from 'vitest';
import { matchRosterEntry, normalizeName, stripInitials, type RosterEntry } from '../manager-identity';

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

// ============================================================
// Нэрийн нормчлол (2026-08-22 засвар)
// ============================================================
// Өмнө нь `r.name === fullName` гэсэн яг тэмдэгтийн харьцуулалт байсан тул
// «Б.Батбаяр» ≠ «Батбаяр» болж менежерийн самбар чимээгүйхэн хоосон буцдаг байв.

describe('normalizeName', () => {
    it('урд/хойд зай, давхар зай, том үсгийг цэгцэлнэ', () => {
        expect(normalizeName('  Батаа   Дорж ')).toBe('батаа дорж');
        expect(normalizeName('БАТАА')).toBe('батаа');
    });

    it('хоосон утгыг хоосон мөр болгоно', () => {
        expect(normalizeName(null)).toBe('');
        expect(normalizeName(undefined)).toBe('');
        expect(normalizeName('   ')).toBe('');
    });
});

describe('stripInitials', () => {
    it('эхний үеийн товчлолыг хасна', () => {
        expect(stripInitials('Б.Батбаяр')).toBe('батбаяр');
        expect(stripInitials('Б. Батбаяр')).toBe('батбаяр');
    });

    it('товчлолгүй нэрэнд хоосон буцаана (давхар таарцаас сэргийлнэ)', () => {
        expect(stripInitials('Батбаяр')).toBe('');
    });
});

describe('matchRosterEntry — нормчлол', () => {
    const r: RosterEntry[] = [
        { name: 'Батбаяр', user_id: null, is_active: true },
        { name: 'Сараа', user_id: null, is_active: true },
    ];

    it('зай/том үсгийн зөрүүг тэсвэрлэнэ', () => {
        expect(matchRosterEntry(r, 'x', '  батбаяр ')?.name).toBe('Батбаяр');
        expect(matchRosterEntry(r, 'x', 'БАТБАЯР')?.name).toBe('Батбаяр');
    });

    it('«Б.Батбаяр» → «Батбаяр» бүртгэлтэй таарна', () => {
        expect(matchRosterEntry(r, 'x', 'Б.Батбаяр')?.name).toBe('Батбаяр');
        expect(matchRosterEntry(r, 'x', 'Б. Батбаяр')?.name).toBe('Батбаяр');
    });

    it('товчлол хассан таарц ОЛОН бол аль нь ч сонгогдохгүй', () => {
        const dup: RosterEntry[] = [
            { name: 'Б.Батбаяр', user_id: null, is_active: true },
            { name: 'Д.Батбаяр', user_id: null, is_active: true },
        ];
        expect(matchRosterEntry(dup, 'x', 'Батбаяр')).toBeNull();
    });

    it('ижил нормчилсон нэртэй хоёр бүртгэлээс ИДЭВХТЭЙГ нь сонгоно', () => {
        const dup: RosterEntry[] = [
            { name: 'Батбаяр', user_id: null, is_active: false },
            { name: 'батбаяр ', user_id: null, is_active: true },
        ];
        expect(matchRosterEntry(dup, 'x', 'Батбаяр')?.is_active).toBe(true);
    });

    it('нэр байхгүй бол null', () => {
        expect(matchRosterEntry(r, 'x', null)).toBeNull();
    });
});

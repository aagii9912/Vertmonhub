import { describe, it, expect } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { matchRosterEntry, reportViewerRule, resolveManagerIdentity, resolveReportViewer, type RosterEntry } from '../manager-identity';

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

    it('ижил нэртэй өөр акаунтын менежерийг ашиглахгүй', () => {
        expect(matchRosterEntry(roster, 'new-user', 'Батаа')).toBeNull();
    });
    it('нэг акаунтад олон нэр холбогдсон үед эхний мөрийг дур мэдэн ашиглахгүй', () => {
        const ambiguous = [...roster, { name: 'Бат хоёр', user_id: UID, is_active: true }];
        expect(matchRosterEntry(ambiguous, UID, 'Сараа')).toBeNull();
    });
});

describe('resolveManagerIdentity', () => {
    function db(fullName: string, rosterError: unknown = null, entries = roster) {
        return {
            from(table: string) {
                const query = {
                    select: () => query,
                    eq: () => query,
                    maybeSingle: async () => ({ data: { full_name: fullName }, error: null }),
                    then: (resolve: (result: unknown) => unknown) => Promise.resolve({
                        data: table === 'sales_managers' ? entries : null, error: rosterError,
                    }).then(resolve),
                };
                return query;
            },
        } as unknown as SupabaseClient;
    }

    it('өөр акаунтын нэрийг personal тайлангийн fallback нэр болгохгүй', async () => {
        const identity = await resolveManagerIdentity(db('Батаа'), 'shop', 'new-user');
        expect(identity.managerName).toBeNull();
        expect(identity.isManager).toBe(false);
    });

    it('холбоогүй legacy нэрийн таарцыг хадгална', async () => {
        const identity = await resolveManagerIdentity(db('Сараа'), 'shop', 'new-user');
        expect(identity.managerName).toBe('Сараа');
        expect(identity.isManager).toBe(true);
    });

    it('roster унших алдаанд profile нэрээр attribution хийхгүй', async () => {
        const identity = await resolveManagerIdentity(db('Батаа', { message: 'unavailable' }), 'shop', UID);
        expect(identity.managerName).toBeNull();
        expect(identity.isManager).toBe(false);
    });
    it('давхар акаунтын холбоос personal тайлангийн profile нэр рүү унахгүй', async () => {
        const entries = [...roster, { name: 'Бат хоёр', user_id: UID, is_active: true }];
        const identity = await resolveManagerIdentity(db('Өөр нэр', null, entries), 'shop', UID);
        expect(identity.managerName).toBeNull();
        expect(identity.isManager).toBe(false);
    });
});

describe('reportViewerRule / resolveReportViewer', () => {
    const db = (fullName: string | null, entries = roster) => ({ from: (table: string) => {
        const query = {
            select: () => query, eq: () => query,
            maybeSingle: async () => ({ data: { full_name: fullName }, error: null }),
            then: (resolve: (result: unknown) => unknown) => Promise.resolve({ data: table === 'sales_managers' ? entries : null, error: null }).then(resolve),
        };
        return query;
    } }) as unknown as SupabaseClient;

    it('keeps managers personal, needs reports for the team view and never lets admin bypass modules', () => {
        expect(reportViewerRule({ role: 'sales_manager', modules: ['reports'], isManager: false })).toMatchObject({ personal: true, canViewTeam: false });
        expect(reportViewerRule({ role: 'viewer', modules: ['reports'], isManager: true })).toMatchObject({ personal: true, canViewTeam: false });
        expect(reportViewerRule({ role: 'admin', modules: ['dashboard'], isManager: true })).toMatchObject({ isAdmin: true, personal: false, canViewTeam: false });
        expect(reportViewerRule({ role: 'super_admin', modules: [], isManager: false })).toMatchObject({ personal: false, canViewTeam: true });
        expect(reportViewerRule({ role: 'marketing', modules: ['dashboard'], isManager: false })).toMatchObject({ personal: false, canViewTeam: false });
        expect(reportViewerRule({ role: null, isManager: false })).toMatchObject({ role: 'viewer', canViewTeam: false });
    });

    it('resolves the identity once and exposes the canonical name', async () => {
        const viewer = await resolveReportViewer(db('Өөр нэр'), 'shop', { userId: UID, role: 'viewer', modules: ['dashboard', 'reports'] });
        expect(viewer).toMatchObject({ personal: true, canViewTeam: false, managerName: 'Батаа', userId: UID });
        expect(await resolveReportViewer(db(null), 'shop', { userId: null, role: 'viewer', modules: ['reports'] }))
            .toMatchObject({ personal: false, canViewTeam: true, managerName: null, identity: null });
    });
});

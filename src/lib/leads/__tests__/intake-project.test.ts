// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { intakeProjectId, intakeProjectName, pageOrigin, requestOrigin } from '../intake-project';
import { ProjectScopeError } from '@/lib/sales/project-scope';

type Row = Record<string, unknown>;

const garden = '30000000-0000-4000-8000-000000000001';
const elysium = '30000000-0000-4000-8000-000000000002';
const shop = '20000000-0000-4000-8000-000000000001';
const otherShop = '20000000-0000-4000-8000-000000000002';

function fakeDb(rows: Row[], error: Error | null = null): SupabaseClient {
    return {
        from: () => {
            const filters: Array<(row: Row) => boolean> = [];
            let max = Infinity;
            const run = () => error ? { data: null, error } : { data: rows.filter(row => filters.every(f => f(row))).slice(0, max), error: null };
            const query = {
                select: () => query,
                eq: (key: string, value: unknown) => { filters.push(row => row[key] === value); return query; },
                order: () => query,
                limit: (n: number) => { max = n; return query; },
                maybeSingle: async () => { const result = run(); return { data: result.data?.[0] ?? null, error: result.error }; },
                then: (resolve: (value: ReturnType<typeof run>) => unknown, reject?: (reason: unknown) => unknown) => Promise.resolve(run()).then(resolve, reject),
            };
            return query;
        },
    } as unknown as SupabaseClient;
}

const projects: Row[] = [
    { id: garden, shop_id: shop, name: 'Mandala Garden' },
    { id: elysium, shop_id: otherShop, name: '  Elysium Residence ' },
];

beforeEach(() => {
    vi.stubEnv('LEAD_PROJECT_ID', '');
    vi.stubEnv('LEAD_PROJECT_ORIGINS', '');
});
afterEach(() => vi.unstubAllEnvs());

describe('intakeProjectId', () => {
    it('uses LEAD_PROJECT_ID and refuses a missing or malformed binding', () => {
        expect(() => intakeProjectId('https://www.vertmon.mn')).toThrow(ProjectScopeError);
        vi.stubEnv('LEAD_PROJECT_ID', 'not-a-uuid');
        expect(() => intakeProjectId('https://www.vertmon.mn')).toThrow('Лид хүлээн авах төсөл тохируулаагүй байна');
        vi.stubEnv('LEAD_PROJECT_ID', ` ${garden} `);
        expect(intakeProjectId('')).toBe(garden);
    });

    it('maps exact origins first and rejects unmapped or broken maps', () => {
        vi.stubEnv('LEAD_PROJECT_ID', garden);
        vi.stubEnv('LEAD_PROJECT_ORIGINS', JSON.stringify({ 'https://elysium.example': elysium }));
        expect(intakeProjectId('https://elysium.example')).toBe(elysium);
        expect(() => intakeProjectId('https://www.vertmon.mn')).toThrow('Энэ сайтын лид хүлээн авах төсөл тохируулаагүй байна');
        vi.stubEnv('LEAD_PROJECT_ORIGINS', JSON.stringify({ 'https://elysium.example/form': elysium }));
        expect(() => intakeProjectId('https://elysium.example')).toThrow('Лид хүлээн авах төслийн тохиргоо буруу байна');
        vi.stubEnv('LEAD_PROJECT_ORIGINS', '{broken');
        expect(() => intakeProjectId('https://elysium.example')).toThrow('Лид хүлээн авах төслийн тохиргоо буруу байна');
    });
});

describe('origins', () => {
    it('reads the POST Origin, then Referer, and ignores unparsable values', () => {
        expect(requestOrigin(new Headers({ origin: 'https://garden.example', referer: 'https://other.example/x' }))).toBe('https://garden.example');
        expect(requestOrigin(new Headers({ referer: 'https://garden.example/contact?quick=1' }))).toBe('https://garden.example');
        expect(requestOrigin(new Headers({ origin: 'null' }))).toBe('');
        expect(requestOrigin(new Headers())).toBe('');
    });

    it('derives the page origin the browser will send from host and proxy headers', () => {
        expect(pageOrigin(new Headers({ host: 'www.vertmon.mn', 'x-forwarded-proto': 'https' }))).toBe('https://www.vertmon.mn');
        expect(pageOrigin(new Headers({ host: 'internal:8080', 'x-forwarded-host': 'www.vertmon.mn, proxy', 'x-forwarded-proto': 'https,http' }))).toBe('https://www.vertmon.mn');
        expect(pageOrigin(new Headers({ host: 'localhost:3001' }))).toBe('http://localhost:3001');
        expect(pageOrigin(new Headers({ host: 'vertmon.mn' }))).toBe('https://vertmon.mn');
        expect(pageOrigin(new Headers())).toBe('');
    });
});

describe('intakeProjectName', () => {
    it('names the configured public project, matching the origin map', async () => {
        vi.stubEnv('LEAD_PROJECT_ID', garden);
        expect(await intakeProjectName(fakeDb(projects), 'https://www.vertmon.mn', null)).toBe('Mandala Garden');
        vi.stubEnv('LEAD_PROJECT_ORIGINS', JSON.stringify({ 'https://www.vertmon.mn': elysium }));
        expect(await intakeProjectName(fakeDb(projects), 'https://www.vertmon.mn', null)).toBe('Elysium Residence');
    });

    it("uses a signed-in staff member's single shop project before the site setting", async () => {
        vi.stubEnv('LEAD_PROJECT_ID', garden);
        expect(await intakeProjectName(fakeDb(projects), 'https://www.vertmon.mn', otherShop)).toBe('Elysium Residence');
        // Төсөлгүй (эсвэл олон төсөлтэй) shop бол POST шиг сайтын тохиргоо руу буцна.
        expect(await intakeProjectName(fakeDb(projects), 'https://www.vertmon.mn', 'shop-without-project')).toBe('Mandala Garden');
    });

    it('returns null for no project context so the page shows neutral branding', async () => {
        expect(await intakeProjectName(fakeDb(projects), 'https://www.vertmon.mn', null)).toBeNull();
        vi.stubEnv('LEAD_PROJECT_ID', '30000000-0000-4000-8000-0000000000ff');
        expect(await intakeProjectName(fakeDb(projects), 'https://www.vertmon.mn', null)).toBeNull();
        vi.stubEnv('LEAD_PROJECT_ID', garden);
        expect(await intakeProjectName(fakeDb(projects, new Error('db down')), 'https://www.vertmon.mn', null)).toBeNull();
        expect(await intakeProjectName(fakeDb([{ id: garden, shop_id: shop, name: '   ' }]), 'https://www.vertmon.mn', null)).toBeNull();
    });
});

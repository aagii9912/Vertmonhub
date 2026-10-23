// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

type Row = Record<string, unknown>;
const shopId = '00000000-0000-4000-8000-000000000001';
const userId = '00000000-0000-4000-8000-000000000002';
const otherId = '00000000-0000-4000-8000-000000000003';
const file = (owner: string, n: number) => `${shopId}/${owner}/00000000-0000-4000-8000-0000000000${String(n).padStart(2, '0')}.png`;

const state = vi.hoisted(() => ({
    role: 'sales_manager', modules: ['dashboard', 'reports'] as string[], canWrite: true, slides: [] as Row[], insertError: null as { code: string; message: string } | null,
}));

vi.mock('@/lib/utils/logger', () => ({ logger: { error: vi.fn() } }));
vi.mock('@/lib/auth/supabase-auth', () => ({ getUserShop: async () => ({ id: shopId }), getUserId: async () => userId }));
vi.mock('@/lib/auth/require-permission', () => {
    const { NextResponse } = require('next/server') as typeof import('next/server');
    const deny = (module: string, write = false) => {
        if (state.role === 'super_admin') return null;
        if (!state.modules.includes(module)) return NextResponse.json({ error: 'module' }, { status: 403 });
        if (write && !state.canWrite) return NextResponse.json({ error: 'write' }, { status: 403 });
        return null;
    };
    return {
        resolvePermissions: async () => ({ role: state.role, permissions: { modules: state.modules, canWrite: state.canWrite, canDelete: false } }),
        requireModule: async (module: string) => deny(module),
        requireModuleWrite: async (module: string) => deny(module, true),
        requireModuleDelete: async (module: string) => deny(module, true),
    };
});

/** In-memory PostgREST: eq (массив '{}' = хоосон), lt, order (meeting_date буурах → position), олон мөр insert. */
function table(name: string) {
    const filters: ((row: Row) => boolean)[] = [];
    const sorts: Array<[string, boolean]> = [];
    let insert: Row[] | null = null;
    let limit = Infinity;
    const rows = () => name === 'weekly_report_slides' ? state.slides : name === 'user_profiles' ? [{ id: userId, full_name: 'Номин' }] : [];
    const run = (): { data: Row[] | null; error: unknown } => {
        if (insert) {
            if (state.insertError) return { data: null, error: state.insertError };
            const created = insert.map((row, index) => ({ id: `00000000-0000-4000-8000-0000000009${String(state.slides.length + index).padStart(2, '0')}`, updated_at: '2026-10-21T00:00:00Z', ...row }));
            state.slides.push(...created);
            return { data: structuredClone(created), error: null };
        }
        const matched = rows().filter(row => filters.every(filter => filter(row)));
        matched.sort((a, b) => {
            for (const [key, ascending] of sorts) {
                const left = String(a[key] ?? ''); const right = String(b[key] ?? '');
                if (left !== right) return (left < right ? -1 : 1) * (ascending ? 1 : -1);
            }
            return 0;
        });
        return { data: structuredClone(matched.slice(0, limit)), error: null };
    };
    const builder: Record<string, unknown> = {
        select: () => builder,
        order: (key: string, options?: { ascending?: boolean }) => { sorts.push([key, options?.ascending !== false]); return builder; },
        limit: (n: number) => { limit = n; return builder; },
        eq: (key: string, value: unknown) => { filters.push(row => value === '{}' ? Array.isArray(row[key]) && (row[key] as unknown[]).length === 0 : row[key] === value); return builder; },
        lt: (key: string, value: string) => { filters.push(row => String(row[key]) < value); return builder; },
        insert: (value: Row | Row[]) => { insert = Array.isArray(value) ? value : [value]; return builder; },
        single: async () => { const { data, error } = run(); return { data: data?.[0] ?? null, error }; },
        maybeSingle: async () => { const { data, error } = run(); return { data: data?.[0] ?? null, error }; },
        then: (resolve: (value: unknown) => unknown) => Promise.resolve(run()).then(resolve),
    };
    return builder;
}
vi.mock('@/lib/supabase', () => ({ supabaseAdmin: () => ({ from: table }) }));

import { GET, POST } from './route';
import { POST as CREATE } from '../route';

const meetingDate = '2026-10-21';
const slide = (id: number, over: Row): Row => ({
    id: `00000000-0000-4000-8000-000000000${String(100 + id)}`, shop_id: shopId, meeting_date: '2026-10-14', part: 'sales', section: 'plan',
    title: '', note: '', image_paths: [], position: 0, author_id: otherId, author_name: 'Бат', created_at: '2026-10-13T00:00:00Z', updated_at: '2026-10-13T00:00:00Z', ...over,
});
const request = (method: string, url: string, body?: unknown) => new NextRequest(`http://localhost${url}`, { method, body: body === undefined ? undefined : JSON.stringify(body) });
const copy = (body: Row = { meetingDate, part: 'sales', section: 'plan' }) => POST(request('POST', '/api/dashboard/weekly-slides/copy', body));

beforeEach(() => {
    Object.assign(state, { role: 'sales_manager', modules: ['dashboard', 'reports'], canWrite: true, insertError: null, slides: [
        slide(1, { title: '10-р сарын бусад ажлын төлөвлөгөө', note: 'Showroom тохижуулах\nБорлуулалтын оффис', position: 0 }),
        slide(2, { title: 'Light box', note: 'Light box оффист авчрах', position: 1 }),
        slide(3, { title: 'Зурагтай', image_paths: [file(otherId, 1)], position: 2 }),
        slide(4, { meeting_date: '2026-10-07', title: 'Хуучин долоо хоног', position: 0 }),
        slide(5, { section: 'event', title: 'Өдөрлөг' }),
        slide(6, { part: 'marketing', section: 'other', title: 'Маркетинг' }),
    ] });
});

describe('copy text slides from the previous meeting', () => {
    it('previews the latest earlier meeting\'s text-only slides of the section', async () => {
        const res = await GET(request('GET', `/api/dashboard/weekly-slides/copy?meetingDate=${meetingDate}&part=sales&section=plan`));
        expect(res.status).toBe(200);
        const body = await res.json() as { from: string; slides: Row[] };
        expect(body.from).toBe('2026-10-14');
        expect(body.slides.map(row => row.title)).toEqual(['10-р сарын бусад ажлын төлөвлөгөө', 'Light box']);
        expect((await GET(request('GET', `/api/dashboard/weekly-slides/copy?meetingDate=2026-10-20&part=sales&section=plan`))).status).toBe(400);
        expect((await GET(request('GET', `/api/dashboard/weekly-slides/copy?meetingDate=${meetingDate}&part=sales&section=social`))).status).toBe(400);
        state.modules = ['dashboard'];
        expect((await GET(request('GET', `/api/dashboard/weekly-slides/copy?meetingDate=${meetingDate}&part=sales&section=plan`))).status).toBe(403);
    });

    it('copies text-only slides to this meeting under the copier, appended after existing ones, and never twice', async () => {
        state.slides.push(slide(7, { meeting_date: meetingDate, section: 'event', title: 'Энэ долоо хоногийн өдөрлөг', position: 4 }));
        const res = await copy();
        expect(res.status).toBe(201);
        const body = await res.json() as { copied: Row[]; skipped: number; from: string };
        expect(body).toMatchObject({ skipped: 0, from: '2026-10-14' });
        expect(body.copied.map(row => [row.title, row.note, row.position, row.author_id, row.author_name, row.image_paths])).toEqual([
            ['10-р сарын бусад ажлын төлөвлөгөө', 'Showroom тохижуулах\nБорлуулалтын оффис', 5, userId, 'Номин', []],
            ['Light box', 'Light box оффист авчрах', 6, userId, 'Номин', []],
        ]);
        expect(body.copied.every(row => row.shop_id === shopId && row.meeting_date === meetingDate && row.part === 'sales' && row.section === 'plan')).toBe(true);
        // Зурагтай слайд хуулагдахгүй; дахин дарахад давхардахгүй.
        expect(state.slides.filter(row => row.meeting_date === meetingDate && row.title === 'Зурагтай')).toHaveLength(0);
        const again = await (await copy()).json() as { copied: Row[]; skipped: number };
        expect(again).toMatchObject({ copied: [], skipped: 2 });
        expect(state.slides.filter(row => row.meeting_date === meetingDate)).toHaveLength(3);
    });

    it('needs write access on the part module and reports an empty previous meeting', async () => {
        state.canWrite = false;
        expect((await copy()).status).toBe(403);
        state.canWrite = true;
        expect((await copy({ meetingDate, part: 'sales', section: 'plan', shop_id: 'x' })).status).toBe(400);
        const empty = await copy({ meetingDate, part: 'sales', section: 'handover' });
        expect(empty.status).toBe(200);
        expect(await empty.json()).toEqual({ copied: [], skipped: 0, from: null });
    });
});

describe('meeting photo slides (W17)', () => {
    it('accepts 9 images and the construction section, and maps an old database CHECK to a clear 503', async () => {
        const imagePaths = Array.from({ length: 9 }, (_, index) => file(userId, index + 10));
        const res = await CREATE(request('POST', '/api/dashboard/weekly-slides', { meetingDate, part: 'sales', section: 'construction', imagePaths }));
        expect(res.status).toBe(201);
        expect((await CREATE(request('POST', '/api/dashboard/weekly-slides', { meetingDate, part: 'sales', section: 'construction', imagePaths: [...imagePaths, file(userId, 30)] }))).status).toBe(400);
        state.insertError = { code: '23514', message: 'new row violates check constraint "weekly_report_slides_image_paths_check"' };
        const old = await CREATE(request('POST', '/api/dashboard/weekly-slides', { meetingDate, part: 'sales', section: 'construction', imagePaths: imagePaths.slice(0, 7) }));
        expect(old.status).toBe(503);
        expect((await old.json()).error).toMatch(/9 хүртэл зураг/);
    });
});

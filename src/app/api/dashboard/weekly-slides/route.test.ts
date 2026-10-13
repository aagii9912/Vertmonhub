// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

type Row = Record<string, unknown>;
const shopId = '00000000-0000-4000-8000-000000000001';
const userId = '00000000-0000-4000-8000-000000000002';
const otherId = '00000000-0000-4000-8000-000000000003';
const file = (owner: string, n: number, ext = 'png') => `${shopId}/${owner}/00000000-0000-4000-8000-0000000000${String(n).padStart(2, '0')}.${ext}`;

const state = vi.hoisted(() => ({
    signedIn: true, member: true, role: 'marketing', modules: ['dashboard', 'marketing-roi'] as string[], canWrite: true, canDelete: false,
    slides: [] as Row[], uploads: [] as { path: string; type?: string }[], removed: [] as string[], stored: new Map<string, Blob>(),
}));

vi.mock('@/lib/utils/logger', () => ({ logger: { error: vi.fn() } }));
vi.mock('@/lib/auth/supabase-auth', () => ({
    getUserShop: async () => state.member ? { id: shopId } : null,
    getUserId: async () => state.signedIn ? userId : null,
    assertShopAccess: async (id: string) => state.member && id === shopId ? id : null,
}));
vi.mock('@/lib/auth/require-permission', () => {
    const { NextResponse } = require('next/server') as typeof import('next/server');
    const deny = (module: string, flag?: 'canWrite' | 'canDelete') => {
        if (!state.signedIn) return NextResponse.json({ error: 'auth' }, { status: 401 });
        if (state.role === 'super_admin') return null;
        if (!state.modules.includes(module)) return NextResponse.json({ error: 'module' }, { status: 403 });
        if (flag && !state[flag]) return NextResponse.json({ error: flag }, { status: 403 });
        return null;
    };
    return {
        resolvePermissions: async () => state.signedIn ? { role: state.role, permissions: { modules: state.modules, canWrite: state.canWrite, canDelete: state.canDelete } } : null,
        requireModule: async (module: string) => deny(module),
        requireModuleWrite: async (module: string) => deny(module, 'canWrite'),
        requireModuleDelete: async (module: string) => deny(module, 'canDelete'),
    };
});

/** Нэг хүснэгтийн энгийн in-memory PostgREST builder: eq/in/contains шүүлт, insert/update/delete. */
function table(name: string) {
    const filters: ((row: Row) => boolean)[] = [];
    let action: { kind: 'select' } | { kind: 'insert'; row: Row } | { kind: 'update'; patch: Row } | { kind: 'delete' } = { kind: 'select' };
    let limit = Infinity;
    const rows = () => name === 'weekly_report_slides' ? state.slides : name === 'user_profiles' ? [{ id: userId, full_name: 'Анужин' }] : [];
    const run = () => {
        if (action.kind === 'insert') {
            const row = { id: `00000000-0000-4000-8000-0000000009${String(state.slides.length).padStart(2, '0')}`, updated_at: '2026-10-13T00:00:00Z', ...action.row };
            state.slides.push(row);
            return [row];
        }
        const matched = rows().filter(row => filters.every(filter => filter(row)));
        if (action.kind === 'update') { const patch = action.patch; matched.forEach(row => Object.assign(row, patch)); return structuredClone(matched); }
        if (action.kind === 'delete') { state.slides = state.slides.filter(row => !matched.includes(row)); return matched; }
        // PostgREST шиг хуулбар буцаана — дуудагчийн өмнө уншсан мөр дараагийн update-ээр өөрчлөгдөхгүй.
        return structuredClone(matched.slice(0, limit));
    };
    const builder: Record<string, unknown> = {
        select: () => builder, order: () => builder,
        limit: (n: number) => { limit = n; return builder; },
        eq: (key: string, value: unknown) => { filters.push(row => row[key] === value); return builder; },
        in: (key: string, values: unknown[]) => { filters.push(row => values.includes(row[key])); return builder; },
        contains: (key: string, values: unknown[]) => { filters.push(row => values.every(value => (row[key] as unknown[]).includes(value))); return builder; },
        insert: (row: Row) => { action = { kind: 'insert', row }; return builder; },
        update: (patch: Row) => { action = { kind: 'update', patch }; return builder; },
        delete: () => { action = { kind: 'delete' }; return builder; },
        single: async () => ({ data: run()[0] ?? null, error: null }),
        maybeSingle: async () => ({ data: run()[0] ?? null, error: null }),
        then: (resolve: (value: unknown) => unknown) => Promise.resolve({ data: run(), error: null }).then(resolve),
    };
    return builder;
}
vi.mock('@/lib/supabase', () => ({ supabaseAdmin: () => ({
    from: table,
    storage: { from: () => ({
        upload: async (path: string, body: Uint8Array, options?: { contentType?: string }) => { state.uploads.push({ path, type: options?.contentType }); state.stored.set(path, new Blob([body as BlobPart], { type: options?.contentType })); return { error: null }; },
        download: async (path: string) => state.stored.has(path) ? { data: state.stored.get(path), error: null } : { data: null, error: { message: 'missing' } },
        remove: async (paths: string[]) => { state.removed.push(...paths); return { error: null }; },
    }) },
}) }));

import { GET, POST } from './route';
import { DELETE, PATCH } from './[id]/route';
import { GET as MEDIA_GET, POST as MEDIA_POST } from './media/route';

const meetingDate = '2026-10-14';
const json = (method: string, url: string, body?: unknown) => new NextRequest(`http://localhost${url}`, { method, body: body === undefined ? undefined : JSON.stringify(body) });
const params = (id: string) => ({ params: Promise.resolve({ id }) });
const slideRow = (overrides: Row): Row => ({ id: '00000000-0000-4000-8000-000000000101', shop_id: shopId, meeting_date: meetingDate, part: 'marketing', section: 'social', title: 'Постер', note: '',
    image_paths: [], position: 0, author_id: otherId, author_name: 'Бат', updated_at: '2026-10-13T00:00:00Z', ...overrides });
const PNG = Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64'));

beforeEach(() => {
    Object.assign(state, { signedIn: true, member: true, role: 'marketing', modules: ['dashboard', 'marketing-roi'], canWrite: true, canDelete: false, slides: [], uploads: [], removed: [], stored: new Map() });
});

describe('weekly report slides API', () => {
    it('lists only the parts the viewer may read and requires a Wednesday', async () => {
        state.slides = [slideRow({}), slideRow({ id: '00000000-0000-4000-8000-000000000102', part: 'sales', section: 'plan' })];
        const res = await GET(json('GET', `/api/dashboard/weekly-slides?meetingDate=${meetingDate}`));
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.parts).toEqual(['marketing']);
        expect(body.slides.map((slide: Row) => slide.part)).toEqual(['marketing']);
        expect((await GET(json('GET', '/api/dashboard/weekly-slides?meetingDate=2026-10-13'))).status).toBe(400);
        state.modules = ['dashboard'];
        expect((await GET(json('GET', `/api/dashboard/weekly-slides?meetingDate=${meetingDate}`))).status).toBe(403);
        state.signedIn = false;
        expect((await GET(json('GET', `/api/dashboard/weekly-slides?meetingDate=${meetingDate}`))).status).toBe(401);
    });

    it('creates with server-side shop and author, gated by the part module', async () => {
        const res = await POST(json('POST', '/api/dashboard/weekly-slides', { meetingDate, part: 'marketing', section: 'social', title: '  Онцлох орон сууц  ', imagePaths: [file(userId, 1)] }));
        expect(res.status).toBe(201);
        expect(state.slides[0]).toMatchObject({ shop_id: shopId, author_id: userId, author_name: 'Анужин', title: 'Онцлох орон сууц', position: 0, image_paths: [file(userId, 1)] });
        // Борлуулалтын хэсэгт reports эрхгүй хүн бичихгүй; маркетингийн сэдэв тухайн хэсэгт л.
        expect((await POST(json('POST', '/api/dashboard/weekly-slides', { meetingDate, part: 'sales', section: 'plan', title: 'x' }))).status).toBe(403);
        expect((await POST(json('POST', '/api/dashboard/weekly-slides', { meetingDate, part: 'marketing', section: 'handover', title: 'x' }))).status).toBe(400);
        // Body-оос shop, зохиогч авахгүй; өөр хүний upload хийсэн зургийг хавсаргахгүй.
        expect((await POST(json('POST', '/api/dashboard/weekly-slides', { meetingDate, part: 'marketing', section: 'social', title: 'x', shop_id: 'other' }))).status).toBe(400);
        expect((await POST(json('POST', '/api/dashboard/weekly-slides', { meetingDate, part: 'marketing', section: 'social', imagePaths: [file(otherId, 2)] }))).status).toBe(400);
        expect((await POST(json('POST', '/api/dashboard/weekly-slides', { meetingDate, part: 'marketing', section: 'social', imagePaths: ['../../etc/passwd.png'] }))).status).toBe(400);
        expect((await POST(json('POST', '/api/dashboard/weekly-slides', { meetingDate, part: 'marketing', section: 'social' }))).status).toBe(400);
        expect(state.slides).toHaveLength(1);
    });

    it('edits keep earlier images, reject foreign ones and delete removed files', async () => {
        state.slides = [slideRow({ image_paths: [file(otherId, 3), file(otherId, 4)] })];
        const id = state.slides[0].id as string;
        expect((await PATCH(json('PATCH', `/api/dashboard/weekly-slides/${id}`, { imagePaths: [file(otherId, 3), file(otherId, 5)] }), params(id))).status).toBe(409);
        const res = await PATCH(json('PATCH', `/api/dashboard/weekly-slides/${id}`, { imagePaths: [file(otherId, 3), file(userId, 6)], note: 'Дүгнэлт' }), params(id));
        expect(res.status).toBe(200);
        expect(state.slides[0]).toMatchObject({ image_paths: [file(otherId, 3), file(userId, 6)], note: 'Дүгнэлт' });
        expect(state.removed).toEqual([file(otherId, 4)]);
        expect((await PATCH(json('PATCH', '/api/dashboard/weekly-slides/not-a-uuid', { note: 'x' }), params('not-a-uuid'))).status).toBe(404);
    });

    it("deletes own slides with write access but others' only with delete access", async () => {
        state.slides = [slideRow({ image_paths: [file(otherId, 7)] }), slideRow({ id: '00000000-0000-4000-8000-000000000103', author_id: userId })];
        expect((await DELETE(json('DELETE', '/x'), params('00000000-0000-4000-8000-000000000101'))).status).toBe(403);
        expect((await DELETE(json('DELETE', '/x'), params('00000000-0000-4000-8000-000000000103'))).status).toBe(200);
        state.canDelete = true;
        expect((await DELETE(json('DELETE', '/x'), params('00000000-0000-4000-8000-000000000101'))).status).toBe(200);
        expect(state.slides).toEqual([]);
        expect(state.removed).toEqual([file(otherId, 7)]);
    });
});

describe('weekly report slide media', () => {
    const upload = (bytes: Uint8Array, part = 'marketing') => {
        const form = new FormData();
        form.append('part', part);
        form.append('file', new File([bytes as BlobPart], 'poster.png', { type: 'image/png' }));
        return MEDIA_POST(new NextRequest('http://localhost/api/dashboard/weekly-slides/media', { method: 'POST', body: form }));
    };
    const media = (path: string) => MEDIA_GET(new NextRequest(`http://localhost/api/dashboard/weekly-slides/media?path=${encodeURIComponent(path)}`));

    it('stores sniffed JPEG/PNG bytes under the shop and uploader, rejecting disguised files', async () => {
        const res = await upload(PNG);
        expect(res.status).toBe(201);
        expect(state.uploads[0].path).toMatch(new RegExp(`^${shopId}/${userId}/[0-9a-f-]{36}\\.png$`));
        expect(state.uploads[0].type).toBe('image/png');
        expect((await upload(new TextEncoder().encode('<svg onload="x"/>'))).status).toBe(400);
        expect((await upload(PNG, 'sales')).status).toBe(403);
        expect(state.uploads).toHaveLength(1);
    });

    it('serves files only to members with the module of the slide that uses them', async () => {
        const res = await upload(PNG);
        const { path } = await res.json() as { path: string };
        expect((await media(path)).status).toBe(200);
        const foreign = file(otherId, 8);
        state.stored.set(foreign, new Blob([PNG], { type: 'image/png' }));
        // Хадгалаагүй (хэн нэгний дөнгөж оруулсан) зургийг бусад нь харахгүй.
        expect((await media(foreign)).status).toBe(403);
        state.slides = [slideRow({ part: 'sales', section: 'event', image_paths: [foreign] })];
        expect((await media(foreign)).status).toBe(403);
        state.modules = ['dashboard', 'reports'];
        const ok = await media(foreign);
        expect(ok.status).toBe(200);
        expect(ok.headers.get('Cache-Control')).toBe('private, no-store');
        state.member = false;
        expect((await media(foreign)).status).toBe(404);
        expect((await media('../secret.png')).status).toBe(400);
    });
});

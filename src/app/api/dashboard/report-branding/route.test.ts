// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

type Row = Record<string, unknown>;
const shopId = '00000000-0000-4000-8000-000000000001';
const otherShop = '00000000-0000-4000-8000-000000000009';
const userId = '00000000-0000-4000-8000-000000000002';
const image = (n: number, shop = shopId) => `branding/${shop}/30000000-0000-4000-8000-00000000000${n}.png`;

const state = vi.hoisted(() => ({
    role: 'admin', modules: ['dashboard', 'settings'] as string[], canWrite: true, member: true,
    row: null as Row | null, missing: false, uploads: [] as Array<{ path: string; type?: string }>, removed: [] as string[], stored: new Map<string, Blob>(),
}));

vi.mock('@/lib/utils/logger', () => ({ logger: { error: vi.fn() } }));
vi.mock('@/lib/auth/supabase-auth', () => ({
    getUserShop: async () => state.member ? { id: shopId, name: 'Elysium Residence' } : null,
    getUserId: async () => userId,
    assertShopAccess: async (id: string) => state.member && id === shopId ? id : null,
}));
vi.mock('@/lib/auth/require-permission', () => {
    const { NextResponse } = require('next/server') as typeof import('next/server');
    const has = (module: string) => state.role === 'super_admin' || state.modules.includes(module);
    return {
        resolvePermissions: async () => ({ role: state.role, permissions: { modules: state.modules, canWrite: state.canWrite, canDelete: false } }),
        requireModule: async (module: string) => has(module) ? null : NextResponse.json({ error: 'module' }, { status: 403 }),
        requireAnyModule: async (modules: string[]) => modules.some(has) ? null : NextResponse.json({ error: 'module' }, { status: 403 }),
        requireModuleWrite: async (module: string) => has(module) && (state.canWrite || state.role === 'super_admin') ? null : NextResponse.json({ error: 'write' }, { status: 403 }),
        requireModuleDelete: async () => NextResponse.json({ error: 'delete' }, { status: 403 }),
    };
});
function table() {
    const filters: Array<[string, unknown]> = [];
    let write: { kind: 'insert' | 'update'; values: Row } | null = null;
    const result = () => {
        if (state.missing) return { data: null, error: { code: 'PGRST205', message: "Could not find the table 'public.report_branding' in the schema cache" } };
        if (write?.kind === 'insert') { state.row = { ...write.values }; return { data: { ...state.row }, error: null }; }
        const matches = !!state.row && filters.every(([key, value]) => state.row![key] === value);
        if (write?.kind === 'update' && matches) state.row = { ...state.row!, ...write.values };
        return { data: matches ? { ...state.row! } : null, error: null };
    };
    const query = {
        select: () => query,
        eq: (key: string, value: unknown) => { filters.push([key, value]); return query; },
        insert: (values: Row) => { write = { kind: 'insert', values }; return query; },
        update: (values: Row) => { write = { kind: 'update', values }; return query; },
        single: () => Promise.resolve(result()),
        maybeSingle: () => Promise.resolve(result()),
    };
    return query;
}
vi.mock('@/lib/supabase', () => ({ supabaseAdmin: () => ({
    from: table,
    storage: { from: () => ({
        upload: async (path: string, body: Uint8Array, options?: { contentType?: string }) => { state.uploads.push({ path, type: options?.contentType }); state.stored.set(path, new Blob([body as BlobPart], { type: options?.contentType })); return { error: null }; },
        download: async (path: string) => state.stored.has(path) ? { data: state.stored.get(path), error: null } : { data: null, error: { message: 'missing' } },
        exists: async (path: string) => (state.stored.has(path) ? { data: true, error: null } : { data: false, error: { message: 'Object not found' } }),
        remove: async (paths: string[]) => { state.removed.push(...paths); for (const path of paths) state.stored.delete(path); return { error: null }; },
    }) },
}) }));

import { GET, PUT } from './route';
import { GET as MEDIA_GET, POST as MEDIA_POST } from './media/route';

const PNG = Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64'));
const put = (body: unknown) => PUT(new NextRequest('http://localhost/api/dashboard/report-branding', { method: 'PUT', body: JSON.stringify(body) }));
const get = () => GET(new NextRequest('http://localhost/api/dashboard/report-branding'));
const body = (over: Row = {}) => ({ displayName: 'ЭЛИЗИУМ', footerText: 'ВЕРТМОН ПРОПЕРТИС', coverImagePath: image(1), logoPath: null, expectedUpdatedAt: null, ...over });
const upload = (bytes: Uint8Array) => {
    const form = new FormData();
    form.append('file', new File([bytes as BlobPart], 'cover.png', { type: 'image/png' }));
    return MEDIA_POST(new NextRequest('http://localhost/api/dashboard/report-branding/media', { method: 'POST', body: form }));
};
const media = (path: string) => MEDIA_GET(new NextRequest(`http://localhost/api/dashboard/report-branding/media?path=${encodeURIComponent(path)}`));

beforeEach(() => {
    Object.assign(state, { role: 'admin', modules: ['dashboard', 'settings'], canWrite: true, member: true, row: null, missing: false, uploads: [], removed: [], stored: new Map() });
});

describe('report branding API', () => {
    it('reads with reports or settings and answers null fields when nothing is saved', async () => {
        const res = await get();
        expect(res.status).toBe(200);
        expect(await res.json()).toEqual({ available: true, branding: { displayName: null, footerText: null, coverImagePath: null, logoPath: null, updatedAt: null } });
        state.modules = ['dashboard', 'reports'];
        expect((await get()).status).toBe(200);
        state.modules = ['dashboard', 'leads'];
        expect((await get()).status).toBe(403);
        Object.assign(state, { modules: ['settings'], missing: true });
        expect(await (await get()).json()).toMatchObject({ available: false, branding: { displayName: null } });
    });

    it('saves with settings write only, stamps the actor and the shop from the session, and removes replaced images', async () => {
        for (const n of [1, 2]) state.stored.set(image(n), new Blob([PNG], { type: 'image/png' }));
        state.modules = ['dashboard', 'reports'];
        expect((await put(body())).status).toBe(403);
        Object.assign(state, { modules: ['settings'], canWrite: false });
        expect((await put(body())).status).toBe(403);
        state.canWrite = true;
        const created = await put(body());
        expect(created.status).toBe(200);
        expect(state.row).toMatchObject({ shop_id: shopId, updated_by: userId, display_name: 'ЭЛИЗИУМ', cover_image_path: image(1) });
        const version = (await created.json()).branding.updatedAt as string;
        expect((await put(body({ coverImagePath: image(2), expectedUpdatedAt: '2020-01-01T00:00:00Z' }))).status).toBe(409);
        expect((await put(body({ coverImagePath: image(2), expectedUpdatedAt: version }))).status).toBe(200);
        expect(state.removed).toEqual([image(1)]);
    });

    it('a stale draft retried after a conflict never writes a deleted image or removes a colleague\'s new one', async () => {
        for (const n of [1, 2]) state.stored.set(image(n), new Blob([PNG], { type: 'image/png' }));
        const first = await (await put(body({ coverImagePath: null, logoPath: image(1) }))).json();
        const opened = first.branding.updatedAt as string;
        // B: лого image(2) болгож хадгална — image(1) storage-оос устна.
        const b = await put(body({ coverImagePath: null, logoPath: image(2), expectedUpdatedAt: opened }));
        expect(b.status).toBe(200);
        const fresh = (await b.json()).branding.updatedAt as string;
        expect(state.removed).toEqual([image(1)]);
        // A: хөл бичвэрээ засаад хуучин нооргоор (лого image(1)) хадгална — 409; шинэ хувилбараар давтвал 400.
        expect((await put(body({ footerText: 'A', coverImagePath: null, logoPath: image(1), expectedUpdatedAt: opened }))).status).toBe(409);
        const retry = await put(body({ footerText: 'A', coverImagePath: null, logoPath: image(1), expectedUpdatedAt: fresh }));
        expect(retry.status).toBe(400);
        expect((await retry.json()).error).toMatch(/олдсонгүй/);
        expect(state.row).toMatchObject({ logo_path: image(2), footer_text: 'ВЕРТМОН ПРОПЕРТИС' });
        expect(state.removed).toEqual([image(1)]);
        expect(state.stored.has(image(2))).toBe(true);
    });

    it('rejects unknown fields, another shop\'s image and answers a missing table with 503', async () => {
        expect((await put({ ...body(), shop_id: otherShop })).status).toBe(400);
        expect((await put(body({ coverImagePath: image(1, otherShop) }))).status).toBe(400);
        state.missing = true;
        const res = await put(body());
        expect(res.status).toBe(503);
        expect((await res.json()).error).toMatch(/идэвхжээгүй/);
    });
});

describe('report branding media', () => {
    it('stores sniffed images under the shop branding prefix for settings writers only', async () => {
        const res = await upload(PNG);
        expect(res.status).toBe(201);
        expect(state.uploads[0].path).toMatch(new RegExp(`^branding/${shopId}/[0-9a-f-]{36}\\.png$`));
        expect((await upload(new TextEncoder().encode('<svg onload="x"/>'))).status).toBe(400);
        state.modules = ['reports'];
        expect((await upload(PNG)).status).toBe(403);
        expect(state.uploads).toHaveLength(1);
    });

    it('serves branding images to members with reports or settings, never to other shops', async () => {
        state.stored.set(image(4), new Blob([PNG], { type: 'image/png' }));
        state.modules = ['reports'];
        const ok = await media(image(4));
        expect(ok.status).toBe(200);
        expect(ok.headers.get('Cache-Control')).toBe('private, no-store');
        state.modules = ['leads'];
        expect((await media(image(4))).status).toBe(403);
        state.modules = ['reports'];
        expect((await media(image(4, otherShop))).status).toBe(404);
        expect((await media(`${shopId}/${userId}/30000000-0000-4000-8000-000000000004.png`)).status).toBe(400);
        expect((await media(image(5))).status).toBe(404);
    });
});

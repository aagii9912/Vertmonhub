// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

const state = vi.hoisted(() => ({ denied: false, shop: { id: 'shop-1' } as { id: string } | null }));
vi.mock('@/lib/auth/require-permission', () => {
    const gate = async () => state.denied ? NextResponse.json({ error: 'Нэвтрэх шаардлагатай' }, { status: 401 }) : null;
    return { requireModule: gate, requireModuleWrite: gate, requireModuleDelete: gate, requireAnyModule: gate };
});
vi.mock('@/lib/auth/supabase-auth', () => ({ getUserShop: async () => state.shop }));
vi.mock('@/lib/utils/logger', () => ({ logger: { error: vi.fn() } }));

import { withRoute } from '../route';
import { ProjectScopeError } from '@/lib/sales/project-scope';

beforeEach(() => { state.denied = false; state.shop = { id: 'shop-1' }; });

describe('withRoute', () => {
    it('uses the request Next passes as-is, even when it is not this module\'s NextRequest class', async () => {
        const real = new NextRequest('https://app.example/api/things?x=1');
        // Production bundles hand over a NextRequest from another module instance: instanceof fails.
        const foreign = Object.assign(Object.create(Object.getPrototypeOf(Object.prototype)), {
            method: 'GET', url: real.url, nextUrl: real.nextUrl, headers: real.headers,
        }) as Request;
        expect(foreign instanceof NextRequest).toBe(false);
        let received: unknown;
        const GET = withRoute({ module: 'leads' }, async ({ request }) => { received = request; return NextResponse.json({ ok: true }); });
        expect((await GET(foreign)).status).toBe(200);
        expect(received).toBe(foreign);
    });

    it('wraps plain Request objects from tests and keeps gate, shop and error mapping', async () => {
        const GET = withRoute<{ id: string }>({ module: 'leads', error: 'Тусгай алдаа' }, async ({ request, shop, params }) => {
            if (params.id === 'scope') throw new ProjectScopeError(403, 'Хүрээнээс гадуур');
            if (params.id === 'boom') throw new Error('db down');
            return NextResponse.json({ path: request.nextUrl.pathname, shop: shop.id, id: params.id });
        });
        const call = (id: string) => GET(new Request('https://app.example/api/things'), { params: Promise.resolve({ id }) });
        expect(await (await call('a')).json()).toEqual({ path: '/api/things', shop: 'shop-1', id: 'a' });
        expect((await call('scope')).status).toBe(403);
        expect(await (await call('boom')).json()).toEqual({ error: 'Тусгай алдаа' });
        state.shop = null;
        expect((await call('a')).status).toBe(403);
        state.denied = true;
        expect((await call('a')).status).toBe(401);
    });
});

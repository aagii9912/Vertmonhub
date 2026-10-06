import { NextRequest, NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    getUser: vi.fn(),
    client: vi.fn(),
    rateLimit: vi.fn(),
    log: vi.fn(),
}));
vi.mock('@/lib/auth/supabase-auth', () => ({ createSupabaseMiddlewareClient: mocks.client }));
vi.mock('@/lib/utils/rate-limiter', () => ({ checkMiddlewareRateLimit: mocks.rateLimit }));
vi.mock('@/lib/utils/request-logger', () => ({ logApiRequest: mocks.log }));
import { proxy } from '@/proxy';

const ORIGIN = 'https://app.example';
const run = (path: string) => proxy(new NextRequest(`${ORIGIN}${path}`));
const loginRedirect = (requested: string) => `${ORIGIN}/auth/login?redirect_url=${encodeURIComponent(requested)}`;
/** NextResponse.next() marks the response with this header; a redirect does not. */
const passedThrough = (response: Response) => response.headers.get('x-middleware-next') === '1';

let sessionResponse: NextResponse;
beforeEach(() => {
    vi.clearAllMocks();
    sessionResponse = NextResponse.next();
    sessionResponse.headers.set('x-test-session', 'checked');
    mocks.client.mockImplementation(() => ({ supabase: { auth: { getUser: mocks.getUser } }, response: sessionResponse }));
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: null });
    mocks.rateLimit.mockResolvedValue({ allowed: true });
});

const signIn = () => mocks.getUser.mockResolvedValue({ data: { user: { id: 'user-a' } }, error: null });

describe('retired /admin/login', () => {
    it.each([
        '/admin/login',
        '/admin/login/',
        '/admin/login/sign-in',
        '/admin/login?redirect_url=https://evil.example',
    ])('redirects %s to the single login page, back to the admin overview', async (path) => {
        const response = await run(path);
        expect(response.status).toBe(307);
        expect(response.headers.get('location')).toBe(`${ORIGIN}/auth/login?redirect_url=%2Fadmin%2Fdashboard`);
        expect(mocks.client).not.toHaveBeenCalled();
    });

    it('redirects a signed-in visitor too (the page no longer exists)', async () => {
        signIn();
        const response = await run('/admin/login');
        expect(response.headers.get('location')).toBe(`${ORIGIN}/auth/login?redirect_url=%2Fadmin%2Fdashboard`);
    });

    it('treats look-alike admin paths as protected admin pages', async () => {
        const response = await run('/admin/login-history');
        expect(response.headers.get('location')).toBe(loginRedirect('/admin/login-history'));
        expect(mocks.getUser).toHaveBeenCalledTimes(1);
    });
});

describe('protected staff routes', () => {
    it.each([
        ['/marketing', '/marketing'],
        ['/marketing/budget', '/marketing/budget'],
        ['/marketing?tab=records', '/marketing?tab=records'],
        ['/marketing/social?fb_success=true&page_count=2', '/marketing/social?fb_success=true&page_count=2'],
    ])('sends a signed-out visitor from %s to login with the full return path', async (path, requested) => {
        const response = await run(path);
        expect(response.status).toBe(307);
        expect(response.headers.get('location')).toBe(loginRedirect(requested));
    });

    it.each([
        ['/dashboard', '/dashboard'],
        ['/dashboard?x=1', '/dashboard?x=1'],
        ['/dashboard/leads?status=new&page=2', '/dashboard/leads?status=new&page=2'],
        ['/admin/users', '/admin/users'],
        ['/admin', '/admin'],
    ])('keeps the query of %s in redirect_url', async (path, requested) => {
        const response = await run(path);
        expect(response.status).toBe(307);
        expect(response.headers.get('location')).toBe(loginRedirect(requested));
        expect(new URL(response.headers.get('location')!).searchParams.get('redirect_url')).toBe(requested);
    });

    it.each(['/marketing/budget', '/dashboard/leads', '/admin/users'])('lets a signed-in user through %s with the session response', async (path) => {
        signIn();
        const response = await run(path);
        expect(response).toBe(sessionResponse);
        expect(response.headers.get('location')).toBeNull();
    });

    it('fails closed when the auth service cannot be reached', async () => {
        mocks.getUser.mockRejectedValue(new Error('GoTrue down'));
        const response = await run('/marketing/budget');
        expect(response.headers.get('location')).toBe(loginRedirect('/marketing/budget'));
    });
});

describe('public routes are untouched', () => {
    it.each([
        '/',
        '/auth/login',
        '/auth/login?redirect_url=%2Fdashboard',
        '/auth/callback?code=test-code',
        '/privacy',
        '/terms',
        '/help',
        '/data-deletion',
    ])('%s passes through without an auth check', async (path) => {
        const response = await run(path);
        expect(passedThrough(response)).toBe(true);
        expect(response.headers.get('location')).toBeNull();
        expect(mocks.client).not.toHaveBeenCalled();
    });

    it('passes the Meta webhook through after the relaxed rate limit', async () => {
        const response = await run('/api/webhook');
        expect(passedThrough(response)).toBe(true);
        expect(mocks.rateLimit).toHaveBeenCalledWith(expect.any(NextRequest), 'webhook');
        expect(mocks.client).not.toHaveBeenCalled();
    });

    it('keeps the old register page redirect', async () => {
        const response = await run('/auth/register');
        expect(response.status).toBe(307);
        expect(response.headers.get('location')).toBe(`${ORIGIN}/auth/login`);
    });
});

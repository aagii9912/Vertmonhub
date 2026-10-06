import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

type SessionCookie = { name: string; value: string; options: Record<string, unknown> };
type CookieAdapter = { getAll(): { name: string; value: string }[]; setAll(cookies: SessionCookie[]): void };

const mocks = vi.hoisted(() => ({
    getUser: vi.fn(),
    client: vi.fn(),
    rateLimit: vi.fn(),
    log: vi.fn(),
}));
// The real getProxySession runs against a fake Supabase client: getUser() can rotate the session
// through the cookie adapter exactly as @supabase/ssr does when the access token has expired.
vi.mock('@supabase/ssr', () => ({ createServerClient: mocks.client }));
vi.mock('@/lib/supabase-env', () => ({ requireSupabaseAnon: () => ({ url: 'https://project.supabase.co', anonKey: 'anon-key' }) }));
vi.mock('@/lib/utils/rate-limiter', () => ({ checkMiddlewareRateLimit: mocks.rateLimit }));
vi.mock('@/lib/utils/request-logger', () => ({ logApiRequest: mocks.log }));
import { proxy } from '@/proxy';

const ORIGIN = 'https://app.example';
const TOKEN = 'sb-project-auth-token';
const run = (path: string, cookie?: string) =>
    proxy(new NextRequest(`${ORIGIN}${path}`, cookie ? { headers: { cookie } } : undefined));
const loginRedirect = (requested: string) => `${ORIGIN}/auth/login?redirect_url=${encodeURIComponent(requested)}`;
/** NextResponse.next() marks the response with this header; a redirect does not. */
const passedThrough = (response: Response) => response.headers.get('x-middleware-next') === '1';

let cookies: CookieAdapter;
beforeEach(() => {
    vi.clearAllMocks();
    mocks.client.mockImplementation((_url: string, _key: string, options: { cookies: CookieAdapter }) => {
        cookies = options.cookies;
        return { auth: { getUser: mocks.getUser } };
    });
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

    it.each(['/marketing/budget', '/dashboard/leads', '/admin/users'])('lets a signed-in user through %s', async (path) => {
        signIn();
        const response = await run(path);
        expect(passedThrough(response)).toBe(true);
        expect(response.headers.get('location')).toBeNull();
        // A session that did not need a refresh leaves the browser's cookies alone.
        expect(response.headers.get('set-cookie')).toBeNull();
    });

    it('fails closed when the auth service cannot be reached', async () => {
        mocks.getUser.mockRejectedValue(new Error('GoTrue down'));
        const response = await run('/marketing/budget');
        expect(response.headers.get('location')).toBe(loginRedirect('/marketing/budget'));
    });
});

describe('session refresh', () => {
    const options = { path: '/', sameSite: 'lax', httpOnly: false, maxAge: 400 * 24 * 60 * 60 };

    it('sends a refreshed session to the browser and to the page being rendered', async () => {
        mocks.getUser.mockImplementation(async () => {
            // Expired access token: Supabase spends the one-time refresh token and hands back new cookies.
            expect(cookies.getAll()).toEqual([{ name: TOKEN, value: 'expired' }]);
            cookies.setAll([{ name: TOKEN, value: 'rotated', options }]);
            return { data: { user: { id: 'user-a' } }, error: null };
        });
        const response = await run('/dashboard/leads?status=new', `${TOKEN}=expired`);

        expect(passedThrough(response)).toBe(true);
        expect(response.cookies.get(TOKEN)).toMatchObject({ value: 'rotated', path: '/', sameSite: 'lax' });
        // Server Components read the request cookies the proxy forwards, not the browser's old ones.
        expect(response.headers.get('x-middleware-override-headers')).toContain('cookie');
        expect(response.headers.get('x-middleware-request-cookie')).toBe(`${TOKEN}=rotated`);
    });

    it('clears a dead session in the browser while sending the visitor to login', async () => {
        mocks.getUser.mockImplementation(async () => {
            cookies.setAll([{ name: TOKEN, value: '', options: { ...options, maxAge: 0 } }]);
            return { data: { user: null }, error: { name: 'AuthApiError', message: 'Invalid Refresh Token: Already Used' } };
        });
        const response = await run('/dashboard', `${TOKEN}=revoked`);

        expect(response.headers.get('location')).toBe(loginRedirect('/dashboard'));
        expect(response.cookies.get(TOKEN)).toMatchObject({ value: '', maxAge: 0 });
    });

    it('keeps the cookies when the auth service is unreachable, so the session survives the outage', async () => {
        mocks.getUser.mockRejectedValue(new Error('GoTrue down'));
        const response = await run('/dashboard', `${TOKEN}=valid`);

        expect(response.headers.get('location')).toBe(loginRedirect('/dashboard'));
        expect(response.headers.get('set-cookie')).toBeNull();
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

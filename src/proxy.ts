import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getProxySession, type ProxySession } from '@/lib/auth/supabase-auth';
import { checkMiddlewareRateLimit } from '@/lib/utils/rate-limiter';
import { logApiRequest } from '@/lib/utils/request-logger';

// Protected routes requiring authentication
const protectedRoutes = ['/dashboard', '/admin', '/marketing'];

// Хуучин тусдаа админ нэвтрэх хуудас — устсан; нэг нэвтрэх хуудас руу шилжүүлнэ.
const retiredAdminLogin = '/admin/login';

// Public routes that bypass auth
const publicRoutes = [
    '/',
    '/auth/login',

    '/auth/callback',
    '/api/webhook',
    '/privacy',
    '/terms',
    '/data-deletion',
    '/help',
];

// AI routes with strict rate limits
const aiRoutes = ['/api/chat', '/api/ai', '/api/ai-assistant', '/api/ai-settings'];

// Webhook routes with relaxed limits
const webhookRoutes = ['/api/webhook'];

function matchesRoute(pathname: string, routes: string[]): boolean {
    return routes.some(route => pathname === route || pathname.startsWith(route + '/'));
}

export async function proxy(request: NextRequest) {
    const { pathname } = request.nextUrl;

    // Redirect old register page to login
    if (pathname === '/auth/register') {
        return NextResponse.redirect(new URL('/auth/login', request.url));
    }

    // Retired /admin/login (and sub-paths) → the single login page, back to the admin overview.
    if (matchesRoute(pathname, [retiredAdminLogin])) {
        const signInUrl = new URL('/auth/login', request.url);
        signInUrl.searchParams.set('redirect_url', '/admin/dashboard');
        return NextResponse.redirect(signInUrl);
    }

    // Log API requests
    if (pathname.startsWith('/api/')) {
        logApiRequest(request);
    }

    // Rate limiting for API routes
    if (pathname.startsWith('/api/')) {
        let routeType: 'strict' | 'standard' | 'webhook' = 'standard';

        if (matchesRoute(pathname, aiRoutes)) {
            routeType = 'strict';
        } else if (matchesRoute(pathname, webhookRoutes)) {
            routeType = 'webhook';
        }

        const rateLimit = await checkMiddlewareRateLimit(request, routeType);
        if (!rateLimit.allowed && rateLimit.response) {
            return rateLimit.response;
        }
    }

    // Allow public routes
    if (matchesRoute(pathname, publicRoutes)) {
        return NextResponse.next();
    }

    // Allow API auth routes
    if (pathname.startsWith('/api/auth/')) {
        return NextResponse.next();
    }

    // Check auth for protected routes
    if (matchesRoute(pathname, protectedRoutes)) {
        // Supabase session (GoTrue) — цорын ганц эх сурвалж. Хуучин `vertmon-session`
        // cookie шалгалт гарын үсэг баталгаажуулдаггүй (зөвхөн base64 decode) байсан тул
        // устгав — хуурамч cookie-оор хамгаалалттай хуудас руу орох боломжтой байв.
        let session: ProxySession | null = null;
        try {
            session = await getProxySession(request);
            if (session.user) {
                return session.next();
            }
        } catch {
            // Supabase auth check failed (GoTrue down)
        }

        // No valid session found — redirect to login, keeping the query so the page reopens as requested
        const signInUrl = new URL('/auth/login', request.url);
        signInUrl.searchParams.set('redirect_url', pathname + request.nextUrl.search);
        const redirect = NextResponse.redirect(signInUrl);
        return session ? session.carryCookies(redirect) : redirect;
    }

    return NextResponse.next();
}

export const config = {
    matcher: [
        '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|webmanifest)$).*)',
    ],
};

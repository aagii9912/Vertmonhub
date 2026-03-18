import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { createSupabaseMiddlewareClient } from '@/lib/auth/supabase-auth';
import { checkMiddlewareRateLimit } from '@/lib/utils/rate-limiter';
import { logApiRequest } from '@/lib/utils/request-logger';

// Protected routes requiring authentication
const protectedRoutes = ['/dashboard', '/setup', '/admin'];

// Public routes that bypass auth
const publicRoutes = [
    '/',
    '/auth/login',

    '/auth/callback',
    '/admin/login',
    '/api/webhook',
    '/api/payment/webhook',
    '/privacy',
    '/terms',
    '/help',
];

// AI routes with strict rate limits
const aiRoutes = ['/api/chat', '/api/ai', '/api/ai-assistant', '/api/ai-settings'];

// Webhook routes with relaxed limits
const webhookRoutes = ['/api/webhook', '/api/payment/webhook'];

function matchesRoute(pathname: string, routes: string[]): boolean {
    return routes.some(route => pathname === route || pathname.startsWith(route + '/'));
}

export async function middleware(request: NextRequest) {
    const { pathname } = request.nextUrl;

    // Redirect old register page to login
    if (pathname === '/auth/register') {
        return NextResponse.redirect(new URL('/auth/login', request.url));
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

        const rateLimit = checkMiddlewareRateLimit(request, routeType);
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
        // Check custom session cookie first (GoTrue bypass)
        const sessionCookie = request.cookies.get('vertmon-session');
        if (sessionCookie?.value) {
            // Cookie exists — let the app validate it
            return NextResponse.next();
        }

        // Fallback: check Supabase session
        try {
            const { supabase, response } = createSupabaseMiddlewareClient(request);
            const { data: { user } } = await supabase.auth.getUser();
            if (user) {
                return response;
            }
        } catch {
            // Supabase auth check failed (GoTrue down)
        }

        // No valid session found — redirect to login
        const signInUrl = new URL('/auth/login', request.url);
        signInUrl.searchParams.set('redirect_url', pathname);
        return NextResponse.redirect(signInUrl);
    }

    return NextResponse.next();
}

export const config = {
    matcher: [
        '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|webmanifest)$).*)',
    ],
};

/**
 * Supabase Auth Utilities for Vertmon Hub
 * Replaces Clerk authentication
 */

import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { cookies, headers } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/utils/logger';

/**
 * Create Supabase client for server components
 */
export async function createSupabaseServerClient() {
    const cookieStore = await cookies();

    return createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
            cookies: {
                getAll() {
                    return cookieStore.getAll();
                },
                setAll(cookiesToSet) {
                    try {
                        cookiesToSet.forEach(({ name, value, options }: { name: string; value: string; options?: unknown }) =>
                            cookieStore.set(name, value, options as Record<string, unknown>)
                        );
                    } catch {
                        // Ignore in Server Component
                    }
                },
            },
        }
    );
}

/**
 * Get authenticated user from server
 */
export async function getAuthUser() {
    const supabase = await createSupabaseServerClient();
    const { data: { user }, error } = await supabase.auth.getUser();

    if (error || !user) {
        return null;
    }

    return user;
}

/**
 * Get user ID (for API routes)
 */
export async function getUserId(): Promise<string | null> {
    const user = await getAuthUser();
    return user?.id ?? null;
}

/**
 * Auth helper for API routes - throws if not authenticated
 */
export async function requireAuth() {
    const user = await getAuthUser();
    if (!user) {
        throw new Error('Unauthorized');
    }
    return user;
}

/**
 * Create Supabase client for middleware
 */
export function createSupabaseMiddlewareClient(request: NextRequest) {
    let response = NextResponse.next({
        request: {
            headers: request.headers,
        },
    });

    const supabase = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
            cookies: {
                getAll() {
                    return request.cookies.getAll();
                },
                setAll(cookiesToSet) {
                    cookiesToSet.forEach(({ name, value }: { name: string; value: string }) =>
                        request.cookies.set(name, value)
                    );
                    response = NextResponse.next({
                        request: {
                            headers: request.headers,
                        },
                    });
                    cookiesToSet.forEach(({ name, value, options }: { name: string; value: string; options?: unknown }) =>
                        response.cookies.set(name, value, options as Record<string, unknown>)
                    );
                },
            },
        }
    );

    return { supabase, response };
}

// ============================================
// Legacy Compatibility (for existing API routes)
// These mirror the old clerk-auth.ts exports
// ============================================

/**
 * Create Supabase admin client (service role for server operations)
 */
export function supabaseAdmin() {
    return createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
        {
            auth: {
                autoRefreshToken: false,
                persistSession: false,
            },
        }
    );
}

/**
 * Get shop for authenticated user
 */
export async function getUserShop() {
    const userId = await getUserId();
    if (!userId) {
        return null;
    }

    // Check for x-shop-id in headers
    const headerList = await headers();
    const requestedShopId = headerList.get('x-shop-id');

    const supabase = supabaseAdmin();

    // Build query
    let query = supabase
        .from('shops')
        .select('id, name, owner_name, phone, facebook_page_id, facebook_page_name, is_active, setup_completed, created_at, bank_name, account_number, account_name')
        .eq('user_id', userId);

    // If specific shop requested, use it, otherwise get first
    if (requestedShopId) {
        query = query.eq('id', requestedShopId);
    }

    const { data: shops, error } = await query.limit(1);

    if (error) {
        logger.error('getUserShop Error:', { error });
        return null;
    }

    if (!shops || shops.length === 0) {
        return null;
    }

    return shops[0];
}

// Legacy aliases — re-export for backward compat during migration
/** @deprecated Use getUserId instead */
export const getClerkUser = getUserId;
/** @deprecated Use getUserShop instead */
export const getClerkUserShop = getUserShop;


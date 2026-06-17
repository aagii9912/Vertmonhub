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
        process.env.NEXT_PUBLIC_SUPABASE_URL!.trim(),
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!.trim(),
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
        process.env.NEXT_PUBLIC_SUPABASE_URL!.trim(),
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!.trim(),
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
        process.env.NEXT_PUBLIC_SUPABASE_URL!.trim(),
        process.env.SUPABASE_SERVICE_ROLE_KEY!.trim(),
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

    // Хэрэглэгчийн хандаж болох shop-уудыг цуглуулна: эзэмшсэн + гишүүн байгаа
    const [{ data: ownedRows }, { data: memberRows }] = await Promise.all([
        supabase.from('shops').select('id').eq('user_id', userId),
        supabase.from('shop_members').select('shop_id').eq('user_id', userId),
    ]);

    const ownedIds = (ownedRows || []).map(r => r.id);
    const memberIds = (memberRows || []).map(r => r.shop_id);
    const accessibleIds = new Set<string>([...ownedIds, ...memberIds]);

    // Зорилтот shop-ыг тодорхойлно: хүсэлтийн shop эсвэл эзэмшсэн/гишүүн эхнийх
    let targetId = requestedShopId || undefined;
    if (targetId && !accessibleIds.has(targetId)) {
        return null; // Энэ shop руу хандах эрхгүй
    }
    if (!targetId) {
        targetId = ownedIds[0] || memberIds[0];
    }
    if (!targetId) {
        return null;
    }

    const { data: shop, error } = await supabase
        .from('shops')
        .select('id, name, owner_name, phone, facebook_page_id, facebook_page_name, is_active, setup_completed, created_at, bank_name, account_number, account_name')
        .eq('id', targetId)
        .single();

    if (error) {
        logger.error('getUserShop Error:', { error });
        return null;
    }

    return shop;
}

// Legacy aliases — re-export for backward compat during migration
/** @deprecated Use getUserId instead */
export const getClerkUser = getUserId;
/** @deprecated Use getUserShop instead */
export const getClerkUserShop = getUserShop;


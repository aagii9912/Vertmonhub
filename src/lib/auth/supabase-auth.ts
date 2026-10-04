/**
 * Сервер талын Supabase Auth: session client (Server Component / Route Handler),
 * middleware client, хэрэглэгч ба shop-ийн хандалтын шалгалт.
 */

import { createServerClient } from '@supabase/ssr';
import type { User } from '@supabase/supabase-js';
import { cookies, headers } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/utils/logger';
import { supabaseAdmin } from '@/lib/supabase';
import { requireSupabaseAnon } from '@/lib/supabase-env';

// Service-role client-ийн нэг хэрэгжүүлэлт нь `@/lib/supabase`; auth helper-тэй хамт импортлогддог газруудад зориулж дамжуулна.
export { supabaseAdmin };

/**
 * Session (cookie) client — Server Components, Route Handlers, Server Actions.
 */
export async function createSupabaseServerClient() {
    const cookieStore = await cookies();
    const { url, anonKey } = requireSupabaseAnon();

    return createServerClient(
        url,
        anonKey,
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
 * Нэг хүсэлтийн доторх Supabase getUser-ийг дахин ашиглана: requireModule → getUserShop →
 * төслийн хүрээ тус бүр Auth руу дахин хандаж байсан (хүсэлт бүрт ~4 round trip).
 * Түлхүүр нь Next-ийн тухайн хүсэлтийн cookie store — хүсэлт бүрт шинэ объект тул
 * хэрэглэгч хооронд хуваалцагдахгүй. Зөвхөн олдсон хэрэглэгчийг санана: null/алдаа үед
 * дараагийн дуудлага (жишээ нь нэвтэрсний дараа) дахин шалгана.
 */
const requestUsers = new WeakMap<object, Promise<User | null>>();

/**
 * Get authenticated user from server
 */
export async function getAuthUser(): Promise<User | null> {
    const cookieStore = await cookies();
    const cached = requestUsers.get(cookieStore);
    if (cached) return cached;

    const pending = (async () => {
        const supabase = await createSupabaseServerClient();
        const { data: { user }, error } = await supabase.auth.getUser();
        return error || !user ? null : user;
    })();
    requestUsers.set(cookieStore, pending);
    try {
        const user = await pending;
        if (!user) requestUsers.delete(cookieStore);
        return user;
    } catch (error) {
        requestUsers.delete(cookieStore);
        throw error;
    }
}

/**
 * Get user ID (for API routes)
 */
export async function getUserId(): Promise<string | null> {
    const user = await getAuthUser();
    return user?.id ?? null;
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

    const { url, anonKey } = requireSupabaseAnon();
    const supabase = createServerClient(
        url,
        anonKey,
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

/**
 * Хэрэглэгчийн хандаж болох бүх төсөл (shop)-ийн id-г буцаана: эзэмшсэн + гишүүн.
 * Эзэмшсэн shop-ууд эхэнд (insertion order хадгалагдана).
 */
export async function getAccessibleShopIds(userId: string): Promise<Set<string>> {
    const supabase = supabaseAdmin();
    const [{ data: ownedRows }, { data: memberRows }] = await Promise.all([
        supabase.from('shops').select('id').eq('user_id', userId),
        supabase.from('shop_members').select('shop_id').eq('user_id', userId),
    ]);

    const ids = [
        ...((ownedRows || []).map(r => r.id)),
        ...((memberRows || []).map(r => r.shop_id)),
    ];
    return new Set<string>(ids);
}

/**
 * Зорилтот төсөл (shop)-д хэрэглэгч хандах эрхтэй эсэхийг шалгана.
 * shopId өгөгдөөгүй бол x-shop-id header-ээс, эс бөгөөс эхний хандах боломжтой
 * shop-ыг сонгоно. Зөвшөөрвөл зорилтот shopId, эс бөгөөс null буцаана.
 * ХЭРЭГЛЭЭ: client-аас ирсэн shop_id-г шууд итгэхгүйгээр гишүүнчлэлээр баталгаажуулах.
 */
export async function assertShopAccess(shopId?: string | null): Promise<string | null> {
    const userId = await getUserId();
    if (!userId) return null;

    const headerList = await headers();
    const requested = shopId || headerList.get('x-shop-id') || undefined;

    const accessibleIds = await getAccessibleShopIds(userId);
    if (requested) {
        return accessibleIds.has(requested) ? requested : null;
    }
    const first = accessibleIds.values().next().value;
    return first ?? null;
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

    // Хэрэглэгчийн хандаж болох shop-уудыг цуглуулна: эзэмшсэн + гишүүн байгаа
    const accessibleIds = await getAccessibleShopIds(userId);

    // Зорилтот shop-ыг тодорхойлно: хүсэлтийн shop эсвэл эзэмшсэн/гишүүн эхнийх
    let targetId = requestedShopId || undefined;
    if (targetId && !accessibleIds.has(targetId)) {
        return null; // Энэ shop руу хандах эрхгүй
    }
    if (!targetId) {
        targetId = accessibleIds.values().next().value;
    }
    if (!targetId) {
        return null;
    }

    const supabase = supabaseAdmin();
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

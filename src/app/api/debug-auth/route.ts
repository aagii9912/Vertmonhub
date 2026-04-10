/**
 * Debug Auth API - Development only
 * Returns auth diagnostic information
 */

import { NextResponse } from 'next/server';
import { getAuthUser, getAuthUserShop } from '@/lib/auth/auth';

export async function GET() {
    // H7 FIX: Only allow in development
    if (process.env.NODE_ENV === 'production') {
        return NextResponse.json({ error: 'Not available' }, { status: 404 });
    }

    try {
        const userId = await getAuthUser();
        const shop = await getAuthUserShop();

        return NextResponse.json({
            auth_status: {
                isAuthenticated: !!userId,
                user_id: userId,
            },
            shop_status: {
                shop_found: !!shop,
                shop_id: shop?.id,
                shop_name: shop?.name,
            },
        });
    } catch (error: unknown) {
        return NextResponse.json({ error: 'Auth check failed' }, { status: 500 });
    }
}

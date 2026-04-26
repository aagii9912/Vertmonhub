import { NextResponse } from 'next/server';
import { getUserId, supabaseAdmin } from '@/lib/auth/supabase-auth';

// POST /api/user/switch-shop - Switch active shop
export async function POST(request: Request) {
    try {
        const userId = await getUserId();

        if (!userId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await request.json();
        const { shopId } = body;

        if (!shopId) {
            return NextResponse.json({ error: 'Shop ID is required' }, { status: 400 });
        }

        const supabase = supabaseAdmin();

        // Verify the shop belongs to the user
        const { data: shop, error } = await supabase
            .from('shops')
            .select('*')
            .eq('id', shopId)
            .eq('user_id', userId)
            .single();

        if (error || !shop) {
            return NextResponse.json({ error: 'Shop not found or access denied' }, { status: 404 });
        }

        // The actual switching is handled client-side via localStorage + context
        // This endpoint just validates and returns the shop data
        return NextResponse.json({
            success: true,
            shop,
            message: `Switched to ${shop.name}`
        });
    } catch (error) {
        console.error('Switch shop error:', error);
        return NextResponse.json({ error: 'Failed to switch shop' }, { status: 500 });
    }
}

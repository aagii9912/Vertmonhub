import { NextResponse } from 'next/server';
import { getUserId, supabaseAdmin } from '@/lib/auth/supabase-auth';
import { requireModuleWrite } from '@/lib/auth/require-permission';
import { CreateShopSchema, validateBody } from '@/lib/validations/schemas';

// GET /api/user/shops - Get all shops for the current user
export async function GET() {
    try {
        const userId = await getUserId();

        if (!userId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const supabase = supabaseAdmin();

        // Хэрэглэгчийн хандаж болох shop-ууд: эзэмшсэн + гишүүнчлэлээр
        const { data: memberRows, error: memberError } = await supabase
            .from('shop_members')
            .select('shop_id')
            .eq('user_id', userId);
        if (memberError) throw memberError;
        const memberIds = (memberRows || []).map(r => r.shop_id);

        let query = supabase
            .from('shops')
            .select('id, name, owner_name, phone, facebook_page_id, facebook_page_name, is_active, setup_completed, created_at')
            .order('created_at', { ascending: true });

        if (memberIds.length > 0) {
            query = query.or(`user_id.eq.${userId},id.in.(${memberIds.join(',')})`);
        } else {
            query = query.eq('user_id', userId);
        }

        const { data: shops, error } = await query;

        if (error) throw error;

        return NextResponse.json({ shops: shops || [] }, { headers: { 'Cache-Control': 'private, no-store' } });
    } catch (error) {
        console.error('User shops API error:', error);
        return NextResponse.json({ error: 'Failed to fetch shops' }, { status: 500 });
    }
}

// POST /api/user/shops - Create a new shop for the current user
export async function POST(request: Request) {
    try {
        const denied = await requireModuleWrite('settings');
        if (denied) return denied;
        const userId = await getUserId();

        if (!userId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const validation = validateBody(CreateShopSchema, await request.json());
        if (!validation.success) return validation.response;
        const { name, owner_name, phone } = validation.data;

        const supabase = supabaseAdmin();

        const { data: shop, error } = await supabase
            .from('shops')
            .insert([{
                user_id: userId,
                name,
                owner_name: owner_name || null,
                phone: phone || null,
                is_active: true,
                setup_completed: false,
            }])
            .select()
            .single();

        if (error) throw error;

        return NextResponse.json({ shop });
    } catch (error) {
        console.error('Create shop error:', error);
        return NextResponse.json({ error: 'Failed to create shop' }, { status: 500 });
    }
}

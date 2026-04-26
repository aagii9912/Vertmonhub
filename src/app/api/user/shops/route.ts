import { NextResponse } from 'next/server';
import { getUserId, supabaseAdmin } from '@/lib/auth/supabase-auth';

// GET /api/user/shops - Get all shops for the current user
export async function GET() {
    try {
        const userId = await getUserId();

        if (!userId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const supabase = supabaseAdmin();

        const { data: shops, error } = await supabase
            .from('shops')
            .select('id, name, owner_name, phone, facebook_page_id, facebook_page_name, is_active, setup_completed, created_at')
            .eq('user_id', userId)
            .order('created_at', { ascending: true });

        if (error) throw error;

        return NextResponse.json({ shops: shops || [] });
    } catch (error) {
        console.error('User shops API error:', error);
        return NextResponse.json({ error: 'Failed to fetch shops' }, { status: 500 });
    }
}

// POST /api/user/shops - Create a new shop for the current user
export async function POST(request: Request) {
    try {
        const userId = await getUserId();

        if (!userId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await request.json();
        const { name, owner_name, phone } = body;

        if (!name) {
            return NextResponse.json({ error: 'Shop name is required' }, { status: 400 });
        }

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

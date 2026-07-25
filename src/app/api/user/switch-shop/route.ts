import { NextResponse } from 'next/server';
import { auditFor } from '@/lib/api/context';
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
            return NextResponse.json({ error: 'Төслийн ID шаардлагатай' }, { status: 400 });
        }

        const supabase = supabaseAdmin();

        // Shop-ыг авч, хэрэглэгч эзэн ЭСВЭЛ гишүүн эсэхийг шалгана
        const { data: shop, error } = await supabase
            .from('shops')
            .select('*')
            .eq('id', shopId)
            .single();

        if (error || !shop) {
            return NextResponse.json({ error: 'Төсөл олдсонгүй эсвэл хандах эрхгүй' }, { status: 404 });
        }

        let hasAccess = shop.user_id === userId;
        if (!hasAccess) {
            const { data: membership } = await supabase
                .from('shop_members')
                .select('id')
                .eq('shop_id', shopId)
                .eq('user_id', userId)
                .maybeSingle();
            hasAccess = !!membership;
        }

        if (!hasAccess) {
            return NextResponse.json({ error: 'Төсөл олдсонгүй эсвэл хандах эрхгүй' }, { status: 404 });
        }

        // The actual switching is handled client-side via localStorage + context
        // This endpoint just validates and returns the shop data
        await auditFor(request, shop.id, {
            entity: 'session', entityId: userId, action: 'switch_shop',
            summary: `«${shop.name}» төсөл рүү шилжлээ`,
            after: { shop_id: shop.id, shop_name: shop.name },
        }, 'ui');

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

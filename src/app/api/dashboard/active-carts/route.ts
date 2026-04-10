
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getAuthUserShop } from '@/lib/auth/auth';
import { logger } from '@/lib/utils/logger';

export async function GET() {
    try {
        const shop = await getAuthUserShop();

        if (!shop) {
            return new NextResponse('Unauthorized', { status: 401 });
        }

        const supabase = supabaseAdmin();

        // Fetch carts with customer details and items
        const { data: carts, error } = await supabase
            .from('carts')
            .select(`
                id,
                updated_at,
                created_at,
                customers (
                    id,
                    name,
                    facebook_id,
                    is_vip,
                    phone
                ),
                cart_items (
                    id,
                    quantity,
                    unit_price,
                    products (
                        name,
                        image_url
                    )
                )
            `)
            .eq('shop_id', shop.id)
            .order('updated_at', { ascending: false });

        if (error) {
            logger.error('Error fetching active carts:', { error: error });
            return new NextResponse('Internal Server Error', { status: 500 });
        }

        // Transform data for frontend
        const formattedCarts = carts.map((cart: any) => {
            const items = cart.cart_items || [];
            // Calculate totals manually to be safe
            const totalAmount = items.reduce((sum: number, item: any) => sum + (item.quantity * item.unit_price), 0);
            const itemCount = items.reduce((sum: number, item: any) => sum + item.quantity, 0);

            return {
                id: cart.customers?.id || cart.id, // Use customer ID as key if available
                cartId: cart.id,
                customer: {
                    id: cart.customers?.id,
                    name: cart.customers?.name || 'Guest',
                    facebookId: cart.customers?.facebook_id,
                    isVip: cart.customers?.is_vip
                },
                lastActive: cart.updated_at,
                itemCount,
                totalAmount,
                items: items.map((item: any) => ({
                    id: item.id,
                    name: item.products?.name || 'Unknown Product',
                    price: item.unit_price,
                    quantity: item.quantity,
                    image: item.products?.image_url
                }))
            };
        });

        return NextResponse.json({ carts: formattedCarts });

    } catch (error: unknown) {
        logger.error('API Error:', { error: error });
        return new NextResponse('Internal Server Error', { status: 500 });
    }
}

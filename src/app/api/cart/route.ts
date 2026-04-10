/**
 * Cart API Routes
 * GET - Get active cart for current shop's customer
 * POST - Add item to cart / Checkout
 * DELETE - Remove item from cart
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAuthUserShop } from '@/lib/auth/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { logger } from '@/lib/utils/logger';

// Type for joined product data in cart items
interface CartItemProduct {
    id: string;
    name: string;
    image_url?: string;
    stock: number;
    reserved_stock: number;
}

// Helper to safely extract product data from cart item join
function getProductData(products: unknown): CartItemProduct | null {
    if (!products) return null;
    // Supabase returns single relation as object, not array
    if (Array.isArray(products)) return products[0] as CartItemProduct || null;
    return products as CartItemProduct;
}

// GET - Get cart contents
export async function GET(request: NextRequest) {
    try {
        const shop = await getAuthUserShop();
        if (!shop) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { searchParams } = new URL(request.url);
        const customerId = searchParams.get('customer_id');

        if (!customerId) {
            return NextResponse.json({ error: 'customer_id is required' }, { status: 400 });
        }

        const supabase = supabaseAdmin();

        // Get or create cart
        const { data: cartId, error: cartError } = await supabase
            .rpc('get_or_create_cart', {
                p_shop_id: shop.id,
                p_customer_id: customerId
            });

        if (cartError) throw cartError;

        // Get cart items with product details
        const { data: items, error: itemsError } = await supabase
            .from('cart_items')
            .select(`
                id,
                product_id,
                variant_specs,
                quantity,
                unit_price,
                products (
                    id,
                    name,
                    image_url,
                    stock,
                    reserved_stock
                )
            `)
            .eq('cart_id', cartId);

        if (itemsError) throw itemsError;

        // Calculate total
        const { data: total, error: totalError } = await supabase
            .rpc('calculate_cart_total', { p_cart_id: cartId });

        if (totalError) {
            logger.warn('Cart total calc error:', { error: totalError.message });
        }

        return NextResponse.json({
            cart_id: cartId,
            items: items?.map(item => {
                const product = getProductData(item.products);
                return {
                    id: item.id,
                    product_id: item.product_id,
                    name: product?.name || 'Unknown',
                    image_url: product?.image_url,
                    variant_specs: item.variant_specs,
                    quantity: item.quantity,
                    unit_price: item.unit_price,
                    subtotal: item.unit_price * item.quantity
                };
            }) || [],
            total_amount: total || 0,
            item_count: items?.length || 0
        });

    } catch (error: unknown) {
        logger.error('Cart GET error:', { error: error });
        return NextResponse.json({ error: error instanceof Error ? error.message : 'Unknown error' }, { status: 500 });
    }
}

// POST - Add to cart or Checkout
export async function POST(request: NextRequest) {
    try {
        const shop = await getAuthUserShop();
        if (!shop) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await request.json();
        const { action, customer_id, product_id, quantity = 1, variant_specs = {}, notes } = body;

        if (!customer_id) {
            return NextResponse.json({ error: 'customer_id is required' }, { status: 400 });
        }

        const supabase = supabaseAdmin();

        // Get or create cart
        const { data: cartId, error: cartError } = await supabase
            .rpc('get_or_create_cart', {
                p_shop_id: shop.id,
                p_customer_id: customer_id
            });

        if (cartError) throw cartError;

        // CHECKOUT action
        if (action === 'checkout') {
            const { data: orderId, error: checkoutError } = await supabase
                .rpc('checkout_cart', {
                    p_cart_id: cartId,
                    p_notes: notes || 'AI Chat Checkout'
                });

            if (checkoutError) throw checkoutError;

            return NextResponse.json({
                success: true,
                action: 'checkout',
                order_id: orderId,
                message: `Захиалга #${orderId.substring(0, 8)} амжилттай үүслээ!`
            });
        }

        // ADD TO CART action (default)
        if (!product_id) {
            return NextResponse.json({ error: 'product_id is required for add_to_cart' }, { status: 400 });
        }

        // Get product details
        const { data: product, error: productError } = await supabase
            .from('products')
            .select('id, name, price, stock, reserved_stock, discount_percent')
            .eq('id', product_id)
            .eq('shop_id', shop.id)
            .single();

        if (productError || !product) {
            return NextResponse.json({ error: 'Product not found' }, { status: 404 });
        }

        // Check stock availability
        const availableStock = (product.stock || 0) - (product.reserved_stock || 0);
        if (availableStock < quantity) {
            return NextResponse.json({
                error: `Үлдэгдэл хүрэлцэхгүй байна. Боломжит: ${availableStock}`,
                available_stock: availableStock
            }, { status: 400 });
        }

        // Calculate price (with discount if applicable)
        const discountedPrice = product.discount_percent
            ? Math.round(product.price * (1 - product.discount_percent / 100))
            : product.price;

        // Check if product already in cart
        const { data: existingItem } = await supabase
            .from('cart_items')
            .select('id, quantity')
            .eq('cart_id', cartId)
            .eq('product_id', product_id)
            .eq('variant_specs', variant_specs)
            .single();

        if (existingItem) {
            // Update quantity
            const newQuantity = existingItem.quantity + quantity;

            // Check stock for new quantity
            if (availableStock < newQuantity) {
                return NextResponse.json({
                    error: `Нийт ${newQuantity} ширхэг авах боломжгүй. Боломжит: ${availableStock}`,
                    available_stock: availableStock
                }, { status: 400 });
            }

            await supabase
                .from('cart_items')
                .update({ quantity: newQuantity })
                .eq('id', existingItem.id);

            return NextResponse.json({
                success: true,
                action: 'updated',
                product_name: product.name,
                quantity: newQuantity,
                message: `${product.name} (${newQuantity}ш) сагсанд шинэчлэгдлээ`
            });
        }

        // Add new item to cart
        const { error: insertError } = await supabase
            .from('cart_items')
            .insert({
                cart_id: cartId,
                product_id: product_id,
                variant_specs: variant_specs,
                quantity: quantity,
                unit_price: discountedPrice
            });

        if (insertError) throw insertError;

        // Update cart updated_at
        await supabase
            .from('carts')
            .update({ updated_at: new Date().toISOString() })
            .eq('id', cartId);

        return NextResponse.json({
            success: true,
            action: 'added',
            product_name: product.name,
            quantity: quantity,
            unit_price: discountedPrice,
            message: `${product.name} (${quantity}ш) сагсанд нэмэгдлээ!`
        });

    } catch (error: unknown) {
        logger.error('Cart POST error:', { error: error });
        return NextResponse.json({ error: error instanceof Error ? error.message : 'Unknown error' }, { status: 500 });
    }
}

// DELETE - Remove item from cart
export async function DELETE(request: NextRequest) {
    try {
        const shop = await getAuthUserShop();
        if (!shop) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { searchParams } = new URL(request.url);
        const itemId = searchParams.get('item_id');
        const customerId = searchParams.get('customer_id');

        if (!itemId || !customerId) {
            return NextResponse.json({ error: 'item_id and customer_id are required' }, { status: 400 });
        }

        const supabase = supabaseAdmin();

        // Verify item belongs to customer's cart in this shop
        const { data: item, error: itemError } = await supabase
            .from('cart_items')
            .select(`
                id,
                products (name),
                carts!inner (shop_id, customer_id)
            `)
            .eq('id', itemId)
            .single();

        if (itemError || !item) {
            return NextResponse.json({ error: 'Item not found' }, { status: 404 });
        }

        // Type-safe cart data extraction (Supabase !inner returns object, not array)
        const cartData = item.carts as unknown;
        const cart = (Array.isArray(cartData) ? cartData[0] : cartData) as { shop_id: string; customer_id: string } | null;
        if (!cart || cart.shop_id !== shop.id || cart.customer_id !== customerId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
        }

        // Delete item
        await supabase
            .from('cart_items')
            .delete()
            .eq('id', itemId);

        // Type-safe product name extraction
        const product = getProductData(item.products);
        return NextResponse.json({
            success: true,
            message: `${product?.name || 'Бараа'} сагснаас хасагдлаа`
        });

    } catch (error: unknown) {
        logger.error('Cart DELETE error:', { error: error });
        return NextResponse.json({ error: error instanceof Error ? error.message : 'Unknown error' }, { status: 500 });
    }
}

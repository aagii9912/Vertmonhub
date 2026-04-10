import { NextRequest, NextResponse } from 'next/server';
import { getAuthUserShop } from '@/lib/auth/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { updateOrderStatusSchema, parseWithErrors, createOrderSchema } from '@/lib/validations';
import { sendOrderStatusNotification } from '@/lib/services/OrderNotificationService';
import { logger } from '@/lib/utils/logger';

// GET all orders
export async function GET() {
  try {
    const authShop = await getAuthUserShop();

    if (!authShop) {
      return NextResponse.json({ orders: [] });
    }

    const supabase = supabaseAdmin();
    const shopId = authShop.id;

    const { data: orders } = await supabase
      .from('orders')
      .select(`
        id,
        total_amount,
        status,
        notes,
        delivery_address,
        created_at,
        updated_at,
        customers (id, name, phone, address, facebook_id),
        order_items (id, quantity, unit_price, products (id, name, price))
      `)
      .eq('shop_id', shopId)
      .order('created_at', { ascending: false });

    return NextResponse.json({ orders: orders || [] });
  } catch (error: unknown) {
    logger.error('Orders API error:', { error });
    return NextResponse.json({ error: 'Failed to fetch orders' }, { status: 500 });
  }
}

// POST - Create manual order

export async function POST(request: NextRequest) {
  try {
    const authShop = await getAuthUserShop();
    if (!authShop) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();

    // Zod validation
    const validation = parseWithErrors(createOrderSchema, body);
    if (!validation.success) {
      return NextResponse.json({
        error: 'Validation failed',
        details: validation.errors
      }, { status: 400 });
    }

    const { customerId, items, notes, deliveryAddress } = validation.data;
    const supabase = supabaseAdmin();
    const shopId = authShop.id;

    // Calculate total amount
    const totalAmount = items.reduce((sum, item) => sum + (item.quantity * item.unitPrice), 0);

    // 1. Create Order
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .insert({
        shop_id: shopId,
        customer_id: customerId,
        status: 'pending',
        total_amount: totalAmount,
        notes: notes,
        delivery_address: deliveryAddress,
        created_at: new Date().toISOString()
      })
      .select()
      .single();

    if (orderError) {
      throw orderError;
    }

    // 2. Create Order Items and Reserve Stock
    for (const item of items) {
      const { error: itemError } = await supabase
        .from('order_items')
        .insert({
          order_id: order.id,
          product_id: item.productId,
          quantity: item.quantity,
          unit_price: item.unitPrice
        });

      if (itemError) throw itemError;

      // Reserve stock (using RPC or direct update)
      // Ideally we should use a transaction or RPC, but for now simple update
      const { data: product } = await supabase
        .from('products')
        .select('reserved_stock')
        .eq('id', item.productId)
        .single();

      if (product) {
        await supabase
          .from('products')
          .update({
            reserved_stock: (product.reserved_stock || 0) + item.quantity,
            updated_at: new Date().toISOString()
          })
          .eq('id', item.productId);
      }
    }

    return NextResponse.json({
      success: true,
      order: order,
      message: `Захиалга #${order.id.slice(0, 8)} амжилттай үүслээ`
    });

  } catch (error: unknown) {
    logger.error('Create order error:', { error });
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed to create order' }, { status: 500 });
  }
}


// PATCH - Update order status (with Zod validation)
export async function PATCH(request: NextRequest) {
  try {
    const authShop = await getAuthUserShop();

    if (!authShop) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();

    // Zod validation
    const validation = parseWithErrors(updateOrderStatusSchema, body);
    if (!validation.success) {
      return NextResponse.json({
        error: 'Validation failed',
        details: validation.errors
      }, { status: 400 });
    }

    const { orderId, status } = validation.data;

    const supabase = supabaseAdmin();
    const shopId = authShop.id;

    // Verify order belongs to shop
    const { data: order } = await supabase
      .from('orders')
      .select('id, shop_id, customer_id, total_amount')
      .eq('id', orderId)
      .eq('shop_id', shopId)
      .single();

    if (!order) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    }

    // Update order status
    const { data: updatedOrder, error } = await supabase
      .from('orders')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', orderId)
      .select()
      .single();

    if (error) throw error;

    // If delivered, update customer stats
    if (status === 'delivered' && order.customer_id) {
      await supabase.rpc('update_customer_stats_manual', {
        p_customer_id: order.customer_id,
        p_amount: order.total_amount
      });
    }

    // Send notification to customer via Facebook Messenger
    if (order.customer_id) {
      // Fire and forget - don't block the response
      sendOrderStatusNotification(order.customer_id, orderId, status, shopId)
        .catch(err => logger.error('Failed to send order notification:', { err }));
    }

    return NextResponse.json({
      success: true,
      order: updatedOrder,
      message: `Захиалга "${status}" болгож шинэчлэгдлээ`
    });
  } catch (error: unknown) {
    logger.error('Update order error:', { error });
    return NextResponse.json({ error: 'Failed to update order' }, { status: 500 });
  }
}


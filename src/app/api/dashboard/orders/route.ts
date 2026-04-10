import { NextResponse } from 'next/server';
import { getAuthUserShop } from '@/lib/auth/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { sendOrderStatusNotification } from '@/lib/services/OrderNotificationService';
import { logger } from '@/lib/utils/logger';
import { orderStatusSchema } from '@/lib/validations';
import { z } from 'zod';
import * as Sentry from '@sentry/nextjs';

export async function GET(request: Request) {
  try {
    const authShop = await getAuthUserShop();

    if (!authShop) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = supabaseAdmin();
    const shopId = authShop.id;

    const { searchParams } = new URL(request.url);
    const from = searchParams.get('from');
    const to = searchParams.get('to');

    let query = supabase
      .from('orders')
      .select(`
        *,
        customers (id, name, phone, address),
        order_items (id, quantity, unit_price, products (id, name))
      `)
      .eq('shop_id', shopId);

    if (from) {
      query = query.gte('created_at', from);
    }
    if (to) {
      query = query.lte('created_at', to);
    }

    const { data: orders, error } = await query.order('created_at', { ascending: false });

    if (error) throw error;

    return NextResponse.json({ orders: orders || [] });
  } catch (error: unknown) {
    Sentry.captureException(error, { tags: { route: 'dashboard/orders', method: 'GET' } });
    logger.error('Orders API error:', { error: error });
    return NextResponse.json({ error: 'Failed to fetch orders' }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const authShop = await getAuthUserShop();

    if (!authShop) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = supabaseAdmin();
    const shopId = authShop.id;

    const body = await request.json();

    // Validate input with Zod
    const updateSchema = z.object({
      id: z.string().uuid(),
      status: orderStatusSchema,
    });

    const parsed = updateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({
        error: 'Invalid input',
        details: parsed.error.issues.map(i => `${i.path.join('.')}: ${i.message}`),
      }, { status: 400 });
    }

    const { id, status } = parsed.data;

    // Verify order belongs to shop and get customer_id
    const { data: existingOrder } = await supabase
      .from('orders')
      .select('id, customer_id, status')
      .eq('id', id)
      .eq('shop_id', shopId)
      .single();

    if (!existingOrder) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    }

    const { data, error } = await supabase
      .from('orders')
      .update({ status })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    // Stock management based on status change
    const { deductStockForOrder, releaseStockForOrder } = await import('@/lib/services/StockService');

    if (status === 'confirmed' && existingOrder.status === 'pending') {
      // Confirmed: deduct stock and release reservation
      await deductStockForOrder(id);
    } else if (status === 'cancelled' && ['pending', 'confirmed'].includes(existingOrder.status)) {
      if (existingOrder.status === 'pending') {
        // Cancelled from pending: just release reserved stock
        await releaseStockForOrder(id);
      }
      // If cancelled from confirmed: stock already deducted, no reversal (manual adjustment needed)
    }

    // Send notification to customer via Facebook Messenger (non-blocking)
    if (existingOrder.customer_id && status !== existingOrder.status) {
      sendOrderStatusNotification(existingOrder.customer_id, id, status, shopId)
        .then((result) => {
          if (result.success) {
            logger.info(`Order ${id} status → ${status}: customer notified`);
          }
        })
        .catch((err) => {
          logger.warn(`Order notification failed (non-critical):`, { error: String(err) });
        });
    }

    return NextResponse.json({ order: data });
  } catch (error: unknown) {
    Sentry.captureException(error, { tags: { route: 'dashboard/orders', method: 'PATCH' } });
    logger.error('Order update error:', { error: error });
    return NextResponse.json({ error: 'Failed to update order' }, { status: 500 });
  }
}

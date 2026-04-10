import { NextResponse } from 'next/server';
import { getAuthUserShop } from '@/lib/auth/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { createProductSchema, updateProductSchema, parseWithErrors } from '@/lib/validations';
import { logger } from '@/lib/utils/logger';

export async function GET() {
  try {
    const authShop = await getAuthUserShop();

    if (!authShop) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = supabaseAdmin();
    const shopId = authShop.id;

    const { data: products, error } = await supabase
      .from('products')
      .select('id, shop_id, name, description, price, stock, reserved_stock, image_url, is_active, created_at, has_variants, type, colors, sizes, images, discount_percent, duration_minutes, available_days, start_time, end_time, max_bookings_per_day')
      .eq('shop_id', shopId)
      .order('created_at', { ascending: false });

    if (error) throw error;

    return NextResponse.json({ products: products || [] });
  } catch (error: unknown) {
    logger.error('Products API error:', { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ error: 'Failed to fetch products' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const authShop = await getAuthUserShop();

    if (!authShop) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();

    // Zod validation
    const validation = parseWithErrors(createProductSchema, body);
    if (!validation.success) {
      return NextResponse.json({
        error: 'Validation failed',
        details: validation.errors
      }, { status: 400 });
    }

    const supabase = supabaseAdmin();
    const shopId = authShop.id;
    const validData = validation.data;

    const { data, error } = await supabase
      .from('products')
      .insert([{
        shop_id: shopId,
        name: validData.name,
        description: validData.description,
        price: validData.price,
        stock: validData.stock,
        discount_percent: validData.discountPercent,
        is_active: validData.isActive,
        type: validData.type,
        colors: validData.colors,
        sizes: validData.sizes,
        images: validData.images,
        // Appointment-specific fields
        duration_minutes: validData.durationMinutes,
        available_days: validData.availableDays,
        start_time: validData.startTime,
        end_time: validData.endTime,
        max_bookings_per_day: validData.maxBookingsPerDay
      }])
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ product: data });
  } catch (error: unknown) {
    logger.error('Product create error:', { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ error: 'Failed to create product' }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const authShop = await getAuthUserShop();

    if (!authShop) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();

    // Zod validation
    const validation = parseWithErrors(updateProductSchema, body);
    if (!validation.success) {
      return NextResponse.json({
        error: 'Validation failed',
        details: validation.errors
      }, { status: 400 });
    }

    const supabase = supabaseAdmin();
    const shopId = authShop.id;
    const { id, ...validData } = validation.data;

    // Verify product belongs to shop
    const { data: existingProduct } = await supabase
      .from('products')
      .select('id')
      .eq('id', id)
      .eq('shop_id', shopId)
      .single();

    if (!existingProduct) {
      return NextResponse.json({ error: 'Product not found' }, { status: 404 });
    }

    // Map camelCase to snake_case for database
    const dbUpdates: Record<string, unknown> = {};
    if (validData.name !== undefined) dbUpdates.name = validData.name;
    if (validData.description !== undefined) dbUpdates.description = validData.description;
    if (validData.price !== undefined) dbUpdates.price = validData.price;
    if (validData.stock !== undefined) dbUpdates.stock = validData.stock;
    if (validData.discountPercent !== undefined) dbUpdates.discount_percent = validData.discountPercent;
    if (validData.isActive !== undefined) dbUpdates.is_active = validData.isActive;
    if (validData.type !== undefined) dbUpdates.type = validData.type;
    if (validData.colors !== undefined) dbUpdates.colors = validData.colors;
    if (validData.sizes !== undefined) dbUpdates.sizes = validData.sizes;
    if (validData.images !== undefined) dbUpdates.images = validData.images;
    // Appointment-specific fields
    if (validData.durationMinutes !== undefined) dbUpdates.duration_minutes = validData.durationMinutes;
    if (validData.availableDays !== undefined) dbUpdates.available_days = validData.availableDays;
    if (validData.startTime !== undefined) dbUpdates.start_time = validData.startTime;
    if (validData.endTime !== undefined) dbUpdates.end_time = validData.endTime;
    if (validData.maxBookingsPerDay !== undefined) dbUpdates.max_bookings_per_day = validData.maxBookingsPerDay;

    const { data, error } = await supabase
      .from('products')
      .update(dbUpdates)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ product: data });
  } catch (error: unknown) {
    logger.error('Product update error:', { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ error: 'Failed to update product' }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const authShop = await getAuthUserShop();

    if (!authShop) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = supabaseAdmin();
    const shopId = authShop.id;
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'Product ID required' }, { status: 400 });
    }

    // Verify product belongs to shop
    const { data: existingProduct } = await supabase
      .from('products')
      .select('id')
      .eq('id', id)
      .eq('shop_id', shopId)
      .single();

    if (!existingProduct) {
      return NextResponse.json({ error: 'Product not found' }, { status: 404 });
    }

    const { error } = await supabase
      .from('products')
      .delete()
      .eq('id', id);

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    logger.error('Product delete error:', { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ error: 'Failed to delete product' }, { status: 500 });
  }
}


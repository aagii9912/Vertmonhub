import { NextResponse, NextRequest } from 'next/server';
import { getUserShop } from '@/lib/auth/supabase-auth';
import { supabaseAdmin } from '@/lib/supabase';
import { logger } from '@/lib/utils/logger';

export async function GET(request: NextRequest) {
  try {
    const authShop = await getUserShop();

    logger.debug('[Customers API] authShop:', { shop: authShop ? { id: authShop.id, name: authShop.name } : null });

    if (!authShop) {
      logger.debug('[Customers API] No authShop found, returning empty array');
      return NextResponse.json({ customers: [] });
    }

    const supabase = supabaseAdmin();
    const shopId = authShop.id;

    // Get query params for filtering/searching
    const searchParams = request.nextUrl.searchParams;
    const search = searchParams.get('search');
    const tag = searchParams.get('tag');
    const sortBy = searchParams.get('sortBy') || 'created_at';
    const sortOrder = searchParams.get('sortOrder') === 'asc' ? true : false;

    let query = supabase
      .from('customers')
      .select('id, name, facebook_id, phone, email, address, notes, tags, message_count, last_contact_at, created_at')
      .eq('shop_id', shopId);

    // Search by name or phone
    if (search) {
      query = query.or(`name.ilike.%${search}%,phone.ilike.%${search}%`);
    }

    // Filter by tag - disabled until migration runs
    // if (tag) {
    //   query = query.contains('tags', [tag]);
    // }

    // Sort
    query = query.order(sortBy, { ascending: sortOrder, nullsFirst: false });

    const { data: customers, error } = await query;

    logger.debug('[Customers API] Query result', { count: customers?.length, error });

    if (error) throw error;

    return NextResponse.json({ customers: customers || [] });
  } catch (error) {
    console.error('Customers API error:', error);
    return NextResponse.json({ error: 'Failed to fetch customers' }, { status: 500 });
  }
}


// Update customer info
export async function PATCH(request: NextRequest) {
  try {
    const authShop = await getUserShop();

    if (!authShop) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = supabaseAdmin();
    const body = await request.json();
    const { id, name, phone, email, notes, tags } = body;

    if (!id) {
      return NextResponse.json({ error: 'Customer ID required' }, { status: 400 });
    }

    // Verify customer belongs to shop
    const { data: existingCustomer } = await supabase
      .from('customers')
      .select('id')
      .eq('id', id)
      .eq('shop_id', authShop.id)
      .single();

    if (!existingCustomer) {
      return NextResponse.json({ error: 'Customer not found' }, { status: 404 });
    }

    // Build update object (only include provided fields)
    const updateData: Record<string, any> = {};
    if (name !== undefined) updateData.name = name;
    if (phone !== undefined) updateData.phone = phone;
    if (email !== undefined) updateData.email = email;
    if (notes !== undefined) updateData.notes = notes;
    if (tags !== undefined) updateData.tags = tags;

    const { data: customer, error } = await supabase
      .from('customers')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ customer, message: 'Customer updated' });
  } catch (error) {
    console.error('Customer update error:', error);
    return NextResponse.json({ error: 'Failed to update customer' }, { status: 500 });
  }
}

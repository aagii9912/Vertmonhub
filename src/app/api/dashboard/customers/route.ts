import { NextResponse, NextRequest } from 'next/server';
import { getUserShop } from '@/lib/auth/supabase-auth';
import { requireWrite } from '@/lib/auth/require-permission';
import { supabaseAdmin } from '@/lib/supabase';
import { logger } from '@/lib/utils/logger';
import { CreateCustomerSchema, UpdateCustomerSchema, validateBody } from '@/lib/validations/schemas';
import { normalizePhone } from '@/lib/utils/phone';
import { recomputeCustomerScore } from '@/lib/services/CustomerScoringService';

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
    const stage = searchParams.get('stage');
    const tier = searchParams.get('tier');
    const requestedSort = searchParams.get('sortBy') || 'created_at';
    const sortOrder = searchParams.get('sortOrder') === 'asc' ? true : false;

    // Эрэмбэлэх баганыг хязгаарлана (дурын багана зөвшөөрөхгүй)
    const ALLOWED_SORT = ['created_at', 'last_contact_at', 'quality_score', 'message_count', 'name'];
    const sortBy = ALLOWED_SORT.includes(requestedSort) ? requestedSort : 'created_at';

    let query = supabase
      .from('customers')
      .select('id, name, facebook_id, phone, email, address, notes, tags, message_count, last_contact_at, created_at, quality_score, quality_tier, lifecycle_stage, score_breakdown, next_followup_at')
      .eq('shop_id', shopId);

    // Search by name or phone
    if (search) {
      query = query.or(`name.ilike.%${search}%,phone.ilike.%${search}%`);
    }

    // Filter by tag (tags JSONB багана migration-оор нэмэгдсэн)
    if (tag) {
      query = query.contains('tags', [tag]);
    }

    // Filter by lifecycle stage / quality tier
    if (stage) {
      query = query.eq('lifecycle_stage', stage);
    }
    if (tier) {
      query = query.eq('quality_tier', tier);
    }

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


// Manually create a new customer (sales manager entry)
export async function POST(request: NextRequest) {
  try {
    const denied = await requireWrite();
    if (denied) return denied;
    const authShop = await getUserShop();

    if (!authShop) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const validation = validateBody(CreateCustomerSchema, body);
    if (!validation.success) {
      return validation.response;
    }

    const supabase = supabaseAdmin();
    const { name, phone, email, address, notes, tags } = validation.data;

    const phoneNormalized = normalizePhone(phone);
    const cleanEmail = email || null;

    // Dedup: тухайн shop дотор ижил утас эсвэл и-мэйлтэй харилцагч байгаа эсэхийг шалгана
    if (phoneNormalized || cleanEmail) {
      const orParts: string[] = [];
      if (phoneNormalized) orParts.push(`phone_normalized.eq.${phoneNormalized}`);
      if (cleanEmail) orParts.push(`email.eq.${cleanEmail}`);

      const { data: dupe } = await supabase
        .from('customers')
        .select('id, name, phone, email')
        .eq('shop_id', authShop.id)
        .or(orParts.join(','))
        .limit(1)
        .maybeSingle();

      if (dupe) {
        return NextResponse.json({
          error: 'Ийм утас эсвэл и-мэйлтэй харилцагч аль хэдийн бүртгэлтэй байна',
          existing: dupe,
        }, { status: 409 });
      }
    }

    const baseTags = Array.isArray(tags) ? tags : [];
    const finalTags = baseTags.includes('source:manual')
      ? baseTags
      : ['source:manual', ...baseTags];

    const { data: customer, error } = await supabase
      .from('customers')
      .insert({
        shop_id: authShop.id,
        name,
        phone: phone || null,
        phone_normalized: phoneNormalized,
        email: cleanEmail,
        address: address || null,
        notes: notes || null,
        tags: finalTags,
      })
      .select()
      .single();

    if (error) {
      logger.error('[Customers POST] Insert failed:', { error });
      return NextResponse.json({ error: 'Failed to create customer' }, { status: 500 });
    }

    // Шинэ харилцагчийн чанарын оноог тооцоолно (амжилтгүй болсон ч insert хүчинтэй)
    try {
      await recomputeCustomerScore(customer.id);
    } catch (scoreErr) {
      logger.warn('[Customers POST] scoring failed', { error: scoreErr });
    }

    return NextResponse.json({ customer, message: 'Customer created' }, { status: 201 });
  } catch (error) {
    console.error('Customer create error:', error);
    return NextResponse.json({ error: 'Failed to create customer' }, { status: 500 });
  }
}

// Update customer info
export async function PATCH(request: NextRequest) {
  try {
    const denied = await requireWrite();
    if (denied) return denied;
    const authShop = await getUserShop();

    if (!authShop) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = supabaseAdmin();
    const body = await request.json();

    const validation = validateBody(UpdateCustomerSchema, body);
    if (!validation.success) {
      return validation.response;
    }
    const { id, name, phone, email, address, notes, tags } = validation.data;

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
    if (phone !== undefined) {
      updateData.phone = phone;
      updateData.phone_normalized = normalizePhone(phone);
    }
    if (email !== undefined) updateData.email = email || null;
    if (address !== undefined) updateData.address = address || null;
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

import { requireModule, requireModuleWrite } from '@/lib/auth/require-permission';
import { NextResponse, NextRequest } from 'next/server';
import { getUserShop } from '@/lib/auth/supabase-auth';
import { supabaseAdmin } from '@/lib/supabase';
import { logger } from '@/lib/utils/logger';
import { fetchAllRows } from '@/lib/utils/pagination';
import { CreatePropertySchema, validateBody } from '@/lib/validations/schemas';

export async function GET(request: NextRequest) {
  try {
    const denied = await requireModule('properties');
    if (denied) return denied;
    const authShop = await getUserShop();
    if (!authShop) {
      return NextResponse.json({ properties: [] });
    }

    const supabase = supabaseAdmin();
    const sp = request.nextUrl.searchParams;
    const type = sp.get('type');
    const status = sp.get('status');
    const district = sp.get('district');
    const search = sp.get('search');

    const buildQuery = () => {
      let q = supabase
        .from('properties')
        .select('*')
        .eq('shop_id', authShop.id)
        .is('deleted_at', null);

      if (type) q = q.eq('type', type);
      if (status) q = q.eq('status', status);
      if (district) q = q.ilike('district', `%${district}%`);
      if (search) {
        q = q.or(`name.ilike.%${search}%,address.ilike.%${search}%,district.ilike.%${search}%`);
      }
      return q.order('created_at', { ascending: false }).order('id');
    };

    const properties = await fetchAllRows<Record<string, unknown>>((from, to) => buildQuery().range(from, to));
    return NextResponse.json({ properties });
  } catch (error) {
    logger.error('[Properties GET] error:', { error });
    return NextResponse.json({ error: 'Failed to fetch properties' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const denied = await requireModuleWrite('properties');
    if (denied) return denied;
    const authShop = await getUserShop();
    if (!authShop) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const validation = validateBody(CreatePropertySchema, body);
    if (!validation.success) {
      return validation.response;
    }

    const supabase = supabaseAdmin();
    const insertPayload = {
      shop_id: authShop.id,
      ...validation.data,
    };

    const { data, error } = await supabase
      .from('properties')
      .insert(insertPayload)
      .select()
      .single();

    if (error) {
      logger.error('[Properties POST] insert error:', { error });
      return NextResponse.json({ error: 'Failed to create property' }, { status: 500 });
    }

    return NextResponse.json({ property: data, message: 'Property created' }, { status: 201 });
  } catch (error) {
    logger.error('[Properties POST] error:', { error });
    return NextResponse.json({ error: 'Failed to create property' }, { status: 500 });
  }
}

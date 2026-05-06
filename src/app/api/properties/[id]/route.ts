import { NextResponse, NextRequest } from 'next/server';
import { getUserShop } from '@/lib/auth/supabase-auth';
import { supabaseAdmin } from '@/lib/supabase';
import { logger } from '@/lib/utils/logger';
import { UpdatePropertySchema, validateBody } from '@/lib/validations/schemas';

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const authShop = await getUserShop();
    if (!authShop) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = supabaseAdmin();
    const { data, error } = await supabase
      .from('properties')
      .select('*')
      .eq('id', id)
      .eq('shop_id', authShop.id)
      .single();

    if (error || !data) {
      return NextResponse.json({ error: 'Property not found' }, { status: 404 });
    }

    return NextResponse.json({ property: data });
  } catch (error) {
    logger.error('[Properties [id] GET] error:', { error });
    return NextResponse.json({ error: 'Failed to fetch property' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const authShop = await getUserShop();
    if (!authShop) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const validation = validateBody(UpdatePropertySchema, body);
    if (!validation.success) {
      return validation.response;
    }

    const supabase = supabaseAdmin();

    const { data: existing } = await supabase
      .from('properties')
      .select('id')
      .eq('id', id)
      .eq('shop_id', authShop.id)
      .single();

    if (!existing) {
      return NextResponse.json({ error: 'Property not found' }, { status: 404 });
    }

    const { data, error } = await supabase
      .from('properties')
      .update({ ...validation.data, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      logger.error('[Properties [id] PATCH] update error:', { error });
      return NextResponse.json({ error: 'Failed to update property' }, { status: 500 });
    }

    return NextResponse.json({ property: data, message: 'Property updated' });
  } catch (error) {
    logger.error('[Properties [id] PATCH] error:', { error });
    return NextResponse.json({ error: 'Failed to update property' }, { status: 500 });
  }
}

export async function DELETE(_request: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const authShop = await getUserShop();
    if (!authShop) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = supabaseAdmin();

    const { data: existing } = await supabase
      .from('properties')
      .select('id')
      .eq('id', id)
      .eq('shop_id', authShop.id)
      .single();

    if (!existing) {
      return NextResponse.json({ error: 'Property not found' }, { status: 404 });
    }

    const { error } = await supabase
      .from('properties')
      .delete()
      .eq('id', id);

    if (error) {
      logger.error('[Properties [id] DELETE] error:', { error });
      return NextResponse.json({ error: 'Failed to delete property' }, { status: 500 });
    }

    return NextResponse.json({ message: 'Property deleted' });
  } catch (error) {
    logger.error('[Properties [id] DELETE] error:', { error });
    return NextResponse.json({ error: 'Failed to delete property' }, { status: 500 });
  }
}

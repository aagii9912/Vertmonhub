import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { logger } from '@/lib/utils/logger';
import { UpdatePropertySchema, validateBody } from '@/lib/validations/schemas';
import { withRoute } from '@/lib/api/route';

export const GET = withRoute<{ id: string }>({ module: 'properties' }, async ({ shop: authShop, params }) => {
  const { id } = await params;
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
});

export const PATCH = withRoute<{ id: string }>({ module: 'properties', access: 'write' }, async ({ request, shop: authShop, params }) => {
  const { id } = await params;
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
});

export const DELETE = withRoute<{ id: string }>({ module: 'properties', access: 'delete' }, async ({ shop: authShop, params }) => {
  const { id } = await params;
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

  // Soft-delete: deleted_at тэмдэглэж, идэвхгүй болгоно (AI search/жагсаалтаас хасагдана)
  const { error } = await supabase
    .from('properties')
    .update({ deleted_at: new Date().toISOString(), is_active: false })
    .eq('id', id);

  if (error) {
    logger.error('[Properties [id] DELETE] error:', { error });
    return NextResponse.json({ error: 'Failed to delete property' }, { status: 500 });
  }

  return NextResponse.json({ message: 'Property deleted' });
});

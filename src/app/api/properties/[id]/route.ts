import { NextResponse, NextRequest } from 'next/server';
import { auditFor } from '@/lib/api/context';
import { diffFields } from '@/lib/audit/log';
import { getUserShop } from '@/lib/auth/supabase-auth';
import { requireModuleWrite, requireModuleDelete } from '@/lib/auth/require-permission';
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
    const denied = await requireModuleWrite('properties');
    if (denied) return denied;
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

    await auditFor(request, authShop.id, {
      entity: 'property', entityId: id, action: 'update',
      summary: `${data?.name ?? id} үл хөдлөхийг шинэчлэв`,
      ...diffFields(existing as Record<string, unknown>, data as Record<string, unknown>),
    });

    return NextResponse.json({ property: data, message: 'Property updated' });
  } catch (error) {
    logger.error('[Properties [id] PATCH] error:', { error });
    return NextResponse.json({ error: 'Failed to update property' }, { status: 500 });
  }
}

export async function DELETE(_request: NextRequest, { params }: Params) {
  try {
    const denied = await requireModuleDelete('properties');
    if (denied) return denied;
    const { id } = await params;
    const authShop = await getUserShop();
    if (!authShop) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = supabaseAdmin();

    const { data: existing } = await supabase
      .from('properties')
      .select('*')
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

    await auditFor(_request, authShop.id, {
      entity: 'property', entityId: id, action: 'delete',
      summary: `${(existing as Record<string, unknown>)?.name ?? id} үл хөдлөхийг устгав`,
      before: existing as Record<string, unknown>, after: null,
    });

    return NextResponse.json({ message: 'Property deleted' });
  } catch (error) {
    logger.error('[Properties [id] DELETE] error:', { error });
    return NextResponse.json({ error: 'Failed to delete property' }, { status: 500 });
  }
}

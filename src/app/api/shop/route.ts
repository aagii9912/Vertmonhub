import { NextRequest, NextResponse } from 'next/server';
import { getClerkUser, supabaseAdmin } from '@/lib/auth/supabase-auth';
import { safeErrorResponse } from '@/lib/utils/safe-error';
import { CreateShopSchema, UpdateShopSchema, validateBody } from '@/lib/validations/schemas';

// GET - Get user's shop
export async function GET() {
  try {
    const userId = await getClerkUser();

    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = supabaseAdmin();

    const { data: shop, error } = await supabase
      .from('shops')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (error && error.code !== 'PGRST116') {
      throw error;
    }

    return NextResponse.json({ shop });
  } catch (error) {
    return safeErrorResponse(error, 'Shop мэдээлэл унших үед алдаа гарлаа');
  }
}

// POST - Create or update shop (upsert)
export async function POST(request: NextRequest) {
  try {
    const userId = await getClerkUser();

    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();

    // Validate input
    const validation = validateBody(CreateShopSchema, body);
    if (!validation.success) return validation.response;
    const { name, owner_name, phone } = validation.data;

    const supabase = supabaseAdmin();

    // Check if shop already exists
    const { data: existingShop } = await supabase
      .from('shops')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (existingShop) {
      // Update existing shop instead of returning error
      const { data: updatedShop, error } = await supabase
        .from('shops')
        .update({ name, owner_name, phone })
        .eq('id', existingShop.id)
        .select()
        .single();

      if (error) throw error;
      return NextResponse.json({ shop: updatedShop });
    }

    // No shop limit — internal company app, create freely

    // Create new shop
    const { data: shop, error } = await supabase
      .from('shops')
      .insert({
        name,
        owner_name,
        phone,
        user_id: userId,
        is_active: true,
        setup_completed: false
      })
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ shop });
  } catch (error) {
    return safeErrorResponse(error, 'Shop үүсгэх/шинэчлэх үед алдаа гарлаа');
  }
}

// PATCH - Update shop
export async function PATCH(request: NextRequest) {
  try {
    const userId = await getClerkUser();

    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const supabase = supabaseAdmin();

    // Get user's shop
    const { data: shop } = await supabase
      .from('shops')
      .select('id')
      .eq('user_id', userId)
      .single();

    if (!shop) {
      return NextResponse.json({ error: 'Shop not found' }, { status: 404 });
    }

    // Update shop
    const { data: updatedShop, error } = await supabase
      .from('shops')
      .update(body)
      .eq('id', shop.id)
      .select()
      .single();

    if (error) {
      console.error('Update shop DB error:', error);
      throw error;
    }

    return NextResponse.json({ shop: updatedShop });
  } catch (error) {
    return safeErrorResponse(error, 'Shop шинэчлэх үед алдаа гарлаа');
  }
}

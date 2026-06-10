import { NextRequest, NextResponse } from 'next/server';
import { getUserId, supabaseAdmin } from '@/lib/auth/supabase-auth';
import { safeErrorResponse } from '@/lib/utils/safe-error';
import { CreateShopSchema, UpdateShopSchema, validateBody } from '@/lib/validations/schemas';
import { encryptToken, decryptToken } from '@/lib/crypto/tokens';
import { subscribePageToApp } from '@/lib/facebook/marketing-api';

// GET - Get user's shop
export async function GET() {
  try {
    const userId = await getUserId();

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
    const userId = await getUserId();

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
    const userId = await getUserId();

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

    // Whitelist allowed fields to prevent mass assignment
    const ALLOWED_FIELDS = [
      'name', 'owner_name', 'phone', 'description',
      'ai_emotion', 'ai_instructions', 'custom_knowledge',
      'bank_name', 'account_number', 'account_name',
      'facebook_page_id', 'facebook_page_name', 'facebook_page_username', 'facebook_page_access_token',
      'facebook_ad_account_id', 'facebook_token_expires_at',
      'instagram_business_account_id', 'instagram_access_token', 'instagram_username', 'instagram_token_expires_at',
      'notify_on_lead', 'notify_on_viewing', 'notify_on_contact', 'notify_on_support',
    ];
    const safeBody: Record<string, unknown> = Object.fromEntries(
      Object.entries(body).filter(([key]) => ALLOWED_FIELDS.includes(key))
    );

    // token_expires_in (секунд) → expires_at (ISO). Сервер талын цагийг эх сурвалж
    // болгоно (page token-ууд effectively non-expiring ч user-token-ийн ~60 хоногийг
    // conservative дахин-холбох дохио болгон хадгална).
    if (typeof body.facebook_token_expires_in === 'number') {
      safeBody.facebook_token_expires_at = new Date(Date.now() + body.facebook_token_expires_in * 1000).toISOString();
    }
    if (typeof body.instagram_token_expires_in === 'number') {
      safeBody.instagram_token_expires_at = new Date(Date.now() + body.instagram_token_expires_in * 1000).toISOString();
    }

    if (Object.keys(safeBody).length === 0) {
      return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 });
    }

    // Auto-subscribe-д ашиглах PLAINTEXT утгуудыг encrypt хийхээс ӨМНӨ авна.
    const plainFbToken = typeof safeBody.facebook_page_access_token === 'string'
      ? (safeBody.facebook_page_access_token as string)
      : null;
    const fbPageIdFromBody = typeof safeBody.facebook_page_id === 'string'
      ? (safeBody.facebook_page_id as string)
      : null;

    // Encrypt tokens at rest (idempotent — давхар encrypt хийхгүй).
    if (typeof safeBody.facebook_page_access_token === 'string') {
      safeBody.facebook_page_access_token = encryptToken(safeBody.facebook_page_access_token as string);
    }
    if (typeof safeBody.instagram_access_token === 'string') {
      safeBody.instagram_access_token = encryptToken(safeBody.instagram_access_token as string);
    }

    // Update shop
    const { data: updatedShop, error } = await supabase
      .from('shops')
      .update(safeBody)
      .eq('id', shop.id)
      .select()
      .single();

    if (error) {
      console.error('Update shop DB error:', error);
      throw error;
    }

    // Page-ийг app webhook-д auto-subscribe (idempotent, блоклохгүй). Холболтын
    // талбар өөрчлөгдсөн үед л Graph-руу дуудна.
    let webhookSubscribed: boolean | undefined;
    const touchedConnection =
      'facebook_page_id' in safeBody ||
      'facebook_page_access_token' in safeBody ||
      'instagram_business_account_id' in safeBody;
    if (touchedConnection) {
      const pageId = fbPageIdFromBody || updatedShop?.facebook_page_id || null;
      let token = plainFbToken;
      if (!token && updatedShop?.facebook_page_access_token) {
        token = decryptToken(updatedShop.facebook_page_access_token);
      }
      if (pageId && token) {
        const sub = await subscribePageToApp(pageId, token);
        webhookSubscribed = sub.success;
      }
    }

    return NextResponse.json({ shop: updatedShop, webhookSubscribed });
  } catch (error) {
    return safeErrorResponse(error, 'Shop шинэчлэх үед алдаа гарлаа');
  }
}

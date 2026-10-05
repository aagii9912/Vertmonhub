import { NextRequest, NextResponse } from 'next/server';
import { getUserId, getUserShop, supabaseAdmin } from '@/lib/auth/supabase-auth';
import { requireModuleWrite, resolvePermissions } from '@/lib/auth/require-permission';
import { z } from 'zod';
import { safeErrorResponse } from '@/lib/utils/safe-error';
import { CreateShopSchema, validateBody } from '@/lib/validations/schemas';
import { encryptToken, decryptToken } from '@/lib/crypto/tokens';
import { subscribePageToApp } from '@/lib/facebook/marketing-api';

const optionalText = z.string().nullable().optional();
const optionalExpiry = z.number().nonnegative().max(315360000).nullable().optional();
const ShopPatchSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(), owner_name: optionalText, phone: optionalText,
  bank_name: optionalText, account_number: optionalText, account_name: optionalText,
  custom_knowledge: z.record(z.string(), z.string()).optional(),
  facebook_page_id: optionalText, facebook_page_name: optionalText, facebook_page_username: optionalText,
  // facebook_ad_account_id энд байхгүй: зарын дансыг зөвхөн /api/marketing/facebook/ads/accounts
  // (Meta-д эрх, нэг данс = нэг төсөл шалгалттай) сонгоно.
  facebook_page_access_token: optionalText,
  facebook_token_expires_at: optionalText, facebook_token_expires_in: optionalExpiry,
  facebook_user_access_token: optionalText, facebook_user_token_expires_at: optionalText,
  facebook_user_token_expires_in: optionalExpiry,
  instagram_business_account_id: optionalText, instagram_access_token: optionalText,
  instagram_username: optionalText, instagram_token_expires_at: optionalText,
  instagram_token_expires_in: optionalExpiry,
}).strict();

/** Dashboard AI туслахын байгууллагын мэдлэг (ai-settings эрх). */
const AI_FIELDS = new Set(['custom_knowledge']);

const COMMON_FIELDS = new Set(['id', 'name', 'owner_name', 'phone', 'is_active', 'setup_completed', 'created_at']);
const SETTINGS_FIELDS = new Set(['bank_name', 'account_number', 'account_name']);
function publicShop(shop: Record<string, unknown> | null, modules: Iterable<string>) {
  const allowed = new Set(modules);
  return shop && Object.fromEntries(Object.entries(shop).filter(([key]) => {
    if (key.endsWith('_access_token')) return false;
    if (COMMON_FIELDS.has(key)) return true;
    if (AI_FIELDS.has(key)) return allowed.has('ai-settings');
    if (key.startsWith('facebook_') || key.startsWith('instagram_')) return allowed.has('marketing-roi');
    return SETTINGS_FIELDS.has(key) && allowed.has('settings');
  }));
}

// GET - Get user's shop
export async function GET() {
  try {
    const access = await resolvePermissions();
    if (!access) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const modules = access.role === 'super_admin' ? ['settings', 'ai-settings', 'marketing-roi'] : access.permissions.modules;
    if (!modules.some(moduleName => ['settings', 'ai-settings', 'marketing-roi'].includes(moduleName))) {
      return NextResponse.json({ error: 'Энэ хэсэгт хандах эрх танд алга' }, { status: 403 });
    }
    const currentShop = await getUserShop();
    if (!currentShop) return NextResponse.json({ shop: null });

    const supabase = supabaseAdmin();

    const { data: shop, error } = await supabase
      .from('shops')
      .select('*')
      .eq('id', currentShop.id)
      .single();

    if (error && error.code !== 'PGRST116') {
      throw error;
    }

    return NextResponse.json({ shop: publicShop(shop, modules) });
  } catch (error) {
    return safeErrorResponse(error, 'Shop мэдээлэл унших үед алдаа гарлаа');
  }
}

// POST - Create or update shop (upsert)
export async function POST(request: NextRequest) {
  try {
    const denied = await requireModuleWrite('settings');
    if (denied) return denied;
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
      return NextResponse.json({ shop: publicShop(updatedShop, ['settings']) });
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

    return NextResponse.json({ shop: publicShop(shop, ['settings']) });
  } catch (error) {
    return safeErrorResponse(error, 'Shop үүсгэх/шинэчлэх үед алдаа гарлаа');
  }
}

// PATCH - Update shop
export async function PATCH(request: NextRequest) {
  try {
    const validation = validateBody(ShopPatchSchema, await request.json());
    if (!validation.success) return validation.response;
    const body = validation.data;
    const modules = new Set(Object.keys(body).map(key =>
      key.startsWith('facebook_') || key.startsWith('instagram_') ? 'marketing-roi'
        : AI_FIELDS.has(key) ? 'ai-settings' : 'settings'
    ));
    if (modules.size === 0) {
      return NextResponse.json({ error: 'Шинэчлэх талбар алга' }, { status: 400 });
    }
    for (const moduleName of modules) {
      const denied = await requireModuleWrite(moduleName);
      if (denied) return denied;
    }
    const shop = await getUserShop();
    const supabase = supabaseAdmin();

    if (!shop) {
      return NextResponse.json({ error: 'Төсөл олдсонгүй' }, { status: 404 });
    }

    const safeBody: Record<string, unknown> = Object.fromEntries(
      Object.entries(body).filter(([key]) => !key.endsWith('_expires_in'))
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
    if (typeof body.facebook_user_token_expires_in === 'number') {
      safeBody.facebook_user_token_expires_at = new Date(Date.now() + body.facebook_user_token_expires_in * 1000).toISOString();
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
    if (typeof safeBody.facebook_user_access_token === 'string') {
      safeBody.facebook_user_access_token = encryptToken(safeBody.facebook_user_access_token as string);
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
    let leadAdsSubscribed: boolean | undefined;
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
        leadAdsSubscribed = sub.leadgen;
      }
    }

    return NextResponse.json({ shop: publicShop(updatedShop, modules), webhookSubscribed, leadAdsSubscribed });
  } catch (error) {
    return safeErrorResponse(error, 'Shop шинэчлэх үед алдаа гарлаа');
  }
}

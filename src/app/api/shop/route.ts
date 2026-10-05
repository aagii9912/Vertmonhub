import { NextRequest, NextResponse } from 'next/server';
import { getUserId, getUserShop, supabaseAdmin } from '@/lib/auth/supabase-auth';
import { requireModuleWrite, resolvePermissions } from '@/lib/auth/require-permission';
import { z } from 'zod';
import { safeErrorResponse } from '@/lib/utils/safe-error';
import { CreateShopSchema, validateBody } from '@/lib/validations/schemas';

const optionalText = z.string().nullable().optional();
// Facebook/Instagram холболт (Page, токен) энд БАЙХГҮЙ: зөвхөн серверийн OAuth сонголтоор
// (/api/auth/facebook/pages, /api/auth/instagram/accounts) хадгалагдана — браузер токен илгээхгүй.
// Зарын данс: зөвхөн /api/marketing/facebook/ads/accounts.
const ShopPatchSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(), owner_name: optionalText, phone: optionalText,
  bank_name: optionalText, account_number: optionalText, account_name: optionalText,
  custom_knowledge: z.record(z.string(), z.string()).optional(),
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
    const modules = new Set(Object.keys(body).map(key => AI_FIELDS.has(key) ? 'ai-settings' : 'settings'));
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

    return NextResponse.json({ shop: publicShop(updatedShop, modules) });
  } catch (error) {
    return safeErrorResponse(error, 'Shop шинэчлэх үед алдаа гарлаа');
  }
}

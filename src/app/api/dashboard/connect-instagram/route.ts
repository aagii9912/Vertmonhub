import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth/auth';
import { getAccessibleShopIds } from '@/lib/auth/supabase-auth';
import { supabaseAdmin } from '@/lib/supabase';
import { logger } from '@/lib/utils/logger';
import { encryptToken, decryptToken } from '@/lib/crypto/tokens';

/**
 * POST /api/dashboard/connect-instagram
 * Auto-detect Instagram Business Account from the shop's connected Facebook Page.
 * No OAuth needed — uses existing Page Access Token.
 */
export async function POST(request: NextRequest) {
    try {
        const userId = await getAuthUser();
        if (!userId) {
            return NextResponse.json({ error: 'Нэвтрэх шаардлагатай' }, { status: 401 });
        }

        const shopId = request.headers.get('x-shop-id');
        if (!shopId) {
            return NextResponse.json({ error: 'Төслийн ID шаардлагатай' }, { status: 400 });
        }

        // Тухайн хэрэглэгч энэ төсөлд (shop) хандах эрхтэй эсэхийг баталгаажуулна
        const accessibleIds = await getAccessibleShopIds(userId);
        if (!accessibleIds.has(shopId)) {
            return NextResponse.json({ error: 'Энэ төсөлд хандах эрхгүй' }, { status: 403 });
        }

        const supabase = supabaseAdmin();

        // Get shop with existing Facebook Page token
        const { data: shop, error: shopError } = await supabase
            .from('shops')
            .select('id, name, facebook_page_id, facebook_page_access_token, facebook_token_expires_at, instagram_business_account_id')
            .eq('id', shopId)
            .single();

        if (shopError || !shop) {
            return NextResponse.json({ error: 'Төсөл олдсонгүй' }, { status: 404 });
        }

        if (!shop.facebook_page_id || !shop.facebook_page_access_token) {
            return NextResponse.json({ error: 'Facebook Page not connected. Connect Facebook first.' }, { status: 400 });
        }

        // Хадгалсан токен encrypt байж болзошгүй тул эхлээд decrypt.
        const pageToken = decryptToken(shop.facebook_page_access_token);
        if (!pageToken) {
            return NextResponse.json({ error: 'Facebook Page token decrypt хийж чадсангүй. Дахин холбоно уу.' }, { status: 400 });
        }

        // Query Graph API for linked Instagram Business Account
        const igUrl = `https://graph.facebook.com/v21.0/${shop.facebook_page_id}?fields=instagram_business_account{id,username,name,profile_picture_url}&access_token=${pageToken}`;

        const igResponse = await fetch(igUrl);
        const igData = await igResponse.json();

        if (igData.error) {
            logger.error('Failed to fetch IG account from Page', { error: igData.error });
            return NextResponse.json({ error: `Facebook API: ${igData.error.message}` }, { status: 400 });
        }

        if (!igData.instagram_business_account?.id) {
            return NextResponse.json({
                error: 'Instagram Business Account олдсонгүй. Facebook Page → Settings → Linked Accounts дээр Instagram холбосон эсэхийг шалгана уу.',
                debug: { pageId: shop.facebook_page_id }
            }, { status: 404 });
        }

        const igAccount = igData.instagram_business_account;

        // Save Instagram data to shop
        const { error: updateError } = await supabase
            .from('shops')
            .update({
                instagram_business_account_id: igAccount.id,
                instagram_username: igAccount.username || '',
                instagram_access_token: encryptToken(pageToken), // Page token works for IG too (encrypt-at-rest)
                instagram_token_expires_at: shop.facebook_token_expires_at ?? null,
            })
            .eq('id', shopId);

        if (updateError) {
            logger.error('Failed to save Instagram data', { error: updateError.message });
            return NextResponse.json({ error: `DB хадгалахад алдаа: ${updateError.message}` }, { status: 500 });
        }

        logger.success(`✅ Instagram auto-connected: @${igAccount.username} for shop ${shop.name}`);

        return NextResponse.json({
            success: true,
            instagram: {
                id: igAccount.id,
                username: igAccount.username,
                name: igAccount.name,
            }
        });

    } catch (err) {
        logger.error('Connect Instagram error', { error: err });
        return NextResponse.json({ error: 'Server error' }, { status: 500 });
    }
}

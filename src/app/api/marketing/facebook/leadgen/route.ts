import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { logger } from '@/lib/utils/logger';
import { verifyWebhookSignature } from '@/lib/utils/verify-webhook-signature';
import { logAttributionEvent } from '@/lib/marketing/attribution-events';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const GRAPH = 'https://graph.facebook.com/v21.0';

/**
 * GET — Facebook webhook баталгаажуулалт (Lead Ads-д бүртгүүлэхэд).
 */
export async function GET(request: NextRequest) {
    const sp = request.nextUrl.searchParams;
    const mode = sp.get('hub.mode');
    const token = sp.get('hub.verify_token');
    const challenge = sp.get('hub.challenge');

    const verifyToken = process.env.FACEBOOK_VERIFY_TOKEN;
    if (mode === 'subscribe' && verifyToken && token === verifyToken) {
        return new NextResponse(challenge || '', { status: 200 });
    }
    return NextResponse.json({ error: 'Verification failed' }, { status: 403 });
}

interface LeadFieldDatum { name: string; values: string[]; }

/** Facebook lead form field_data-г name/phone/email рүү буулгана. */
function mapFields(fieldData: LeadFieldDatum[]): { name: string | null; phone: string | null; email: string | null } {
    let name: string | null = null, phone: string | null = null, email: string | null = null;
    for (const f of fieldData || []) {
        const key = (f.name || '').toLowerCase();
        const val = f.values?.[0] || null;
        if (!val) continue;
        if (!name && /full_name|^name$|first_name/.test(key)) name = val;
        else if (!phone && /phone/.test(key)) phone = val;
        else if (!email && /email/.test(key)) email = val;
    }
    return { name, phone, email };
}

/**
 * POST — Facebook Lead Ads-ийн шинэ lead-ийг хүлээн авч `leads`-д оруулна (attribution-тай).
 */
export async function POST(request: NextRequest) {
    const raw = await request.text();

    // Гарын үсэг шалгах (APP_SECRET тохируулсан үед)
    const appSecret = process.env.FACEBOOK_APP_SECRET;
    if (appSecret) {
        const sig = request.headers.get('x-hub-signature-256');
        if (!verifyWebhookSignature(raw, sig, appSecret)) {
            return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
        }
    }

    try {
        const body = JSON.parse(raw);
        const supabase = supabaseAdmin();
        let ingested = 0;

        for (const entry of body.entry || []) {
            const pageId = entry.id;
            for (const change of entry.changes || []) {
                if (change.field !== 'leadgen') continue;
                const v = change.value || {};
                const leadgenId = v.leadgen_id;
                if (!leadgenId) continue;

                // Page-аар shop + token шийдэх
                const { data: shop } = await supabase
                    .from('shops')
                    .select('id, facebook_page_access_token')
                    .eq('facebook_page_id', v.page_id || pageId)
                    .single();
                if (!shop?.facebook_page_access_token) continue;

                // Lead-ийн дэлгэрэнгүйг Graph-аас татах
                const res = await fetch(
                    `${GRAPH}/${leadgenId}?fields=field_data,campaign_id,adset_id,ad_id&access_token=${shop.facebook_page_access_token}`
                );
                if (!res.ok) {
                    logger.warn('[Leadgen] fetch failed', { leadgenId, status: res.status });
                    continue;
                }
                const lead = await res.json();
                const { name, phone, email } = mapFields(lead.field_data || []);

                const campaignId = lead.campaign_id || v.campaign_id || null;
                const { data: inserted } = await supabase.from('leads').insert([{
                    shop_id: shop.id,
                    name: name || 'Facebook lead',
                    phone,
                    email,
                    source: 'facebook_ads',
                    facebook_campaign_id: campaignId,
                    facebook_adset_id: lead.adset_id || v.adset_id || null,
                    facebook_ad_id: lead.ad_id || v.ad_id || null,
                }]).select('id').single();

                await logAttributionEvent({
                    shopId: shop.id,
                    leadId: inserted?.id,
                    eventType: 'lead',
                    source: 'facebook_ads',
                    facebook_campaign_id: campaignId,
                });
                ingested++;
            }
        }

        logger.info('[Leadgen] ingested', { ingested });
        return NextResponse.json({ success: true, ingested });
    } catch (error) {
        logger.error('[Leadgen] error', { error });
        // Meta-д 200 буцааж дахин илгээхээс сэргийлнэ (best-effort)
        return NextResponse.json({ success: false });
    }
}

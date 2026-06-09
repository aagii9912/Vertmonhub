import { supabaseAdmin } from '@/lib/supabase';
import { logger } from '@/lib/utils/logger';

/**
 * Lead-ийн attribution үйл явдал бичих (multi-touch суурь). Best-effort —
 * алдаа гарвал үндсэн урсгалыг тасалдуулахгүй.
 */
export async function logAttributionEvent(params: {
    shopId: string;
    leadId?: string | null;
    eventType: 'lead' | 'qualified' | 'won' | 'lost' | 'touch';
    source?: string | null;
    fbclid?: string | null;
    utm_source?: string | null;
    utm_medium?: string | null;
    utm_campaign?: string | null;
    facebook_campaign_id?: string | null;
    value?: number | null;
    meta?: Record<string, unknown>;
}): Promise<void> {
    try {
        const supabase = supabaseAdmin();
        await supabase.from('lead_attribution_events').insert({
            shop_id: params.shopId,
            lead_id: params.leadId || null,
            event_type: params.eventType,
            source: params.source || null,
            fbclid: params.fbclid || null,
            utm_source: params.utm_source || null,
            utm_medium: params.utm_medium || null,
            utm_campaign: params.utm_campaign || null,
            facebook_campaign_id: params.facebook_campaign_id || null,
            value: params.value ?? null,
            meta: params.meta || {},
        });
    } catch (error) {
        logger.warn('[Attribution Event] log failed', { eventType: params.eventType, error });
    }
}

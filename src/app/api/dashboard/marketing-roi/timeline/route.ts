import { NextResponse } from 'next/server';
import { getUserShop } from '@/lib/auth/supabase-auth';
import { supabaseAdmin } from '@/lib/supabase';
import { logger } from '@/lib/utils/logger';

/**
 * GET /api/dashboard/marketing-roi/timeline
 * Маркетингийн нөлөөллийн сар бүрийн цуваа (сүүлийн 6 сар):
 *   - leads     — үүссэн лийдийн тоо (leads.created_at)
 *   - meetings  — товлосон уулзалтын тоо (property_viewings.scheduled_at)
 *   - activity  — идэвхжүүлэлтийн тоо (нийтэлсэн пост + эхэлсэн кампанит ажил)
 *   - spend     — зарын зардал (ad_campaigns, эхэлсэн сард нь хамааруулна)
 * Идэвхжүүлэлт лид/уулзалтад хэрхэн нөлөөлж буйг харьцуулах графикт ашиглана.
 */

const MONTHS_BACK = 6;

/** created_at маягийн огноог 'YYYY-MM' түлхүүр болгоно. */
function monthKey(value: string | null): string | null {
    if (!value) return null;
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return null;
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export async function GET() {
    try {
        const authShop = await getUserShop();
        if (!authShop) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const supabase = supabaseAdmin();
        const shopId = authShop.id;

        // Цонхны эхлэл: одоогоос N-1 сарын өмнөх сарын 1-ний өдөр.
        const now = new Date();
        const windowStart = new Date(now.getFullYear(), now.getMonth() - (MONTHS_BACK - 1), 1);
        const startISO = windowStart.toISOString();

        const [{ data: leads }, { data: viewings }, { data: posts }, { data: adCampaigns }, { data: mktCampaigns }] =
            await Promise.all([
                supabase
                    .from('leads')
                    .select('created_at')
                    .eq('shop_id', shopId)
                    .is('deleted_at', null)
                    .gte('created_at', startISO),
                supabase
                    .from('property_viewings')
                    .select('scheduled_at')
                    .eq('shop_id', shopId)
                    .gte('scheduled_at', startISO),
                supabase
                    .from('social_posts')
                    .select('published_at, status')
                    .eq('shop_id', shopId)
                    .eq('status', 'published')
                    .gte('published_at', startISO),
                supabase
                    .from('ad_campaigns')
                    .select('spend, start_date, created_at')
                    .eq('shop_id', shopId),
                supabase
                    .from('marketing_campaigns')
                    .select('start_date, created_at')
                    .eq('shop_id', shopId),
            ]);

        // Сүүлийн N сарын хоосон bucket-уудыг бэлдэнэ (өгөгдөлгүй сар 0-ээр харагдана).
        const buckets = new Map<
            string,
            { month: string; label: string; leads: number; meetings: number; activity: number; spend: number }
        >();
        for (let i = 0; i < MONTHS_BACK; i++) {
            const d = new Date(now.getFullYear(), now.getMonth() - (MONTHS_BACK - 1) + i, 1);
            const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
            buckets.set(key, {
                month: key,
                label: `${d.getMonth() + 1}-р сар`,
                leads: 0,
                meetings: 0,
                activity: 0,
                spend: 0,
            });
        }

        const bump = (
            key: string | null,
            field: 'leads' | 'meetings' | 'activity',
            amount = 1,
        ) => {
            if (!key) return;
            const bucket = buckets.get(key);
            if (bucket) bucket[field] += amount;
        };

        for (const l of leads || []) bump(monthKey(l.created_at), 'leads');
        for (const v of viewings || []) bump(monthKey(v.scheduled_at), 'meetings');
        for (const p of posts || []) bump(monthKey(p.published_at), 'activity');
        for (const c of mktCampaigns || []) bump(monthKey(c.start_date || c.created_at), 'activity');

        // Зарын зардлыг кампанит ажлын эхэлсэн сард нь хамааруулна (сар тутмын
        // задаргаа Meta-с ирдэггүй тул ойролцоо хуваарилалт).
        for (const c of adCampaigns || []) {
            const key = monthKey(c.start_date || c.created_at);
            if (!key) continue;
            const bucket = buckets.get(key);
            if (bucket) {
                bucket.spend += Number(c.spend) || 0;
                bucket.activity += 1;
            }
        }

        return NextResponse.json({ months: Array.from(buckets.values()) });
    } catch (error) {
        logger.error('[Marketing timeline] error', { error });
        return NextResponse.json({ error: 'Цуваа татахад алдаа гарлаа' }, { status: 500 });
    }
}

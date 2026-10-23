import type { SupabaseClient } from '@supabase/supabase-js';
import { shiftDate, ubDateStart } from '@/lib/sales/activity';
import { ubDateStr } from '@/lib/utils/date';
import { fetchAllRows } from '@/lib/utils/pagination';
import { buildMeetingDetails, meetingDetailWeeks, type MeetingDetailsReport } from './meeting-details';
import { isMissingSchemaError } from './sales-activity-load';

const ID_CHUNK = 100;

/**
 * Уулзалт бүрийн «Сэжим (хаанаас ирсэн)» нэр: `property_viewings.referral_source_id` →
 * `sales_referral_sources.name` (архивласан ч нэрээ хадгална). Багана эсвэл хүснэгт хараахан алга
 * (migration ороогүй) бол `available: false` — бүгд «Тодорхойгүй». Бусад алдааг дамжуулна.
 */
export async function loadViewingReferrals(db: SupabaseClient, shopId: string, viewingIds: readonly string[]): Promise<{ available: boolean; byViewing: Map<string, string | null> }> {
    const byViewing = new Map<string, string | null>();
    const ids = [...new Set(viewingIds)];
    const sourceOf = new Map<string, string | null>();
    // Хоосон жагсаалтад ч нэг удаа асууна — багана байгаа эсэхийг (`available`) үнэн зөв мэдэхийн тулд.
    for (let index = 0; index === 0 || index < ids.length; index += ID_CHUNK) {
        const { data, error } = await db.from('property_viewings').select('id, referral_source_id')
            .eq('shop_id', shopId).in('id', ids.slice(index, index + ID_CHUNK));
        if (error) {
            if (isMissingSchemaError(error)) return { available: false, byViewing };
            throw new Error(error.message);
        }
        for (const row of (data ?? []) as Array<{ id: string; referral_source_id: string | null }>) sourceOf.set(row.id, row.referral_source_id ?? null);
    }
    const sourceIds = [...new Set([...sourceOf.values()].filter((id): id is string => !!id))];
    const names = new Map<string, string>();
    for (let index = 0; index < sourceIds.length; index += ID_CHUNK) {
        const { data, error } = await db.from('sales_referral_sources').select('id, name')
            .eq('shop_id', shopId).in('id', sourceIds.slice(index, index + ID_CHUNK));
        if (error) {
            if (isMissingSchemaError(error)) return { available: false, byViewing };
            throw new Error(error.message);
        }
        for (const row of (data ?? []) as Array<{ id: string; name: string | null }>) if (row.name) names.set(row.id, row.name);
    }
    for (const [id, source] of sourceOf) byViewing.set(id, source ? names.get(source) ?? null : null);
    return { available: true, byViewing };
}

/**
 * Хурлын «уулзалтын дэлгэрэнгүй»-н эх өгөгдөл (нэг shop = нэг төсөл): сүүлийн 4 долоо хоногийн
 * `completed`, устгаагүй уулзалт (сонирхол, төрөл), байрны бүртгэлийн өрөө, тайлант 7 хоногийн шинэ
 * уулзалтын сэжим. Уншилтын алдааг хоосон тайлан болгож нуухгүй.
 */
/** Уулзалтын бүртгэл эхэлсэн УБ өдөр: устгаагүй, ямар ч төлөвтэй хамгийн эртний уулзалт (алга бол null). 9, 10-р слайдын нэг эх. */
export async function loadMeetingsSince(db: SupabaseClient, shopId: string): Promise<string | null> {
    const { data, error } = await db.from('property_viewings').select('scheduled_at').eq('shop_id', shopId).is('deleted_at', null)
        .order('scheduled_at', { ascending: true }).limit(1).maybeSingle();
    if (error) throw new Error(error.message);
    return data?.scheduled_at ? ubDateStr(new Date(data.scheduled_at as string)) : null;
}

export async function loadMeetingDetails(db: SupabaseClient, options: { shopId: string; meetingDate: string }): Promise<MeetingDetailsReport> {
    const { shopId, meetingDate } = options;
    const weeks = meetingDetailWeeks(meetingDate);
    const start = ubDateStart(weeks[0].from).toISOString();
    const end = ubDateStart(shiftDate(weeks.at(-1)!.to, 1)).toISOString();
    const [viewings, units, meetingsSince] = await Promise.all([
        fetchAllRows<{ id: string; scheduled_at: string; meeting_type: string | null; interests: unknown }>((from, to) => db.from('property_viewings')
            .select('id, scheduled_at, meeting_type, interests')
            .eq('shop_id', shopId).is('deleted_at', null).eq('status', 'completed').gte('scheduled_at', start).lt('scheduled_at', end)
            .order('scheduled_at').order('id').range(from, to)),
        fetchAllRows<{ block: string | null; model: string | null; rooms: number | string | null }>((from, to) => db.from('property_units')
            .select('block, model, rooms').eq('shop_id', shopId).eq('category', 'residential').not('rooms', 'is', null)
            .order('id').range(from, to)),
        loadMeetingsSince(db, shopId),
    ]);
    const meetings = viewings.map(row => ({ id: row.id, day: ubDateStr(new Date(row.scheduled_at)), type: row.meeting_type, interests: row.interests }));
    const last = weeks.at(-1)!;
    const fresh = meetings.filter(meeting => meeting.type === 'new_customer' && meeting.day >= last.from && meeting.day <= last.to).map(meeting => meeting.id);
    const referrals = await loadViewingReferrals(db, shopId, fresh);
    return buildMeetingDetails({ meetingDate, meetings, units, referrals, meetingsSince });
}

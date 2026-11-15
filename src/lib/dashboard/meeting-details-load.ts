import type { SupabaseClient } from '@supabase/supabase-js';
import { referralFromNote } from '@/lib/sales/referral-from-notes';
import { shiftDate, ubDateStart } from '@/lib/sales/activity';
import { ubDateStr } from '@/lib/utils/date';
import { fetchAllRows } from '@/lib/utils/pagination';
import { buildMeetingDetails, meetingDetailWeeks, type MeetingDetailsReport } from './meeting-details';
import { isMissingSchemaError } from './sales-activity-load';

const ID_CHUNK = 100;

/**
 * Уулзалт бүрийн «Сэжим (хаанаас ирсэн)» нэр. Сонгосон сэжим (`property_viewings.referral_source_id` →
 * `sales_referral_sources.name`, архивласан ч нэрээ хадгална) давамгайлна; сонгоогүй бол уулзалтын «Тэмдэглэл»-ээс
 * (`agent_notes`) түлхүүр үгээр танина (`referralFromNote`, эзэмшигчийн шийдвэр 2026-11-15) — өмнөх уулзалтууд ч мөн адил.
 * Сэжмийн багана эсвэл хүснэгт хараахан алга (migration ороогүй) бол `available: false`, гэхдээ тэмдэглэлээс таних
 * хэвээр. `fromNotes` = тэмдэглэлээс таньсан уулзалтын тоо. Бусад алдааг дамжуулна.
 */
export async function loadViewingReferrals(db: SupabaseClient, shopId: string, viewingIds: readonly string[]): Promise<{ available: boolean; byViewing: Map<string, string | null>; fromNotes: number }> {
    const byViewing = new Map<string, string | null>();
    const ids = [...new Set(viewingIds)];
    type Row = { id: string; referral_source_id?: string | null; agent_notes: string | null };
    const rows: Row[] = [];
    let available = true;
    // Хоосон жагсаалтад ч нэг удаа асууна — багана байгаа эсэхийг (`available`) үнэн зөв мэдэхийн тулд.
    for (let index = 0; index === 0 || index < ids.length; index += ID_CHUNK) {
        const read = (columns: string) => db.from('property_viewings').select(columns).eq('shop_id', shopId).in('id', ids.slice(index, index + ID_CHUNK));
        let result = await read(available ? 'id, referral_source_id, agent_notes' : 'id, agent_notes');
        if (result.error && available && isMissingSchemaError(result.error)) {
            available = false;
            result = await read('id, agent_notes');
        }
        if (result.error) throw new Error(result.error.message);
        rows.push(...((result.data ?? []) as unknown as Row[]));
    }
    // Төслийн сэжмийн жагсаалт: сонгосон id → нэр (архивласан орно), идэвхтэй нэрс тэмдэглэлд тулгахад.
    const names = new Map<string, string>();
    const activeNames: string[] = [];
    if (available) {
        const { data, error } = await db.from('sales_referral_sources').select('id, name, archived_at').eq('shop_id', shopId);
        if (error) {
            if (!isMissingSchemaError(error)) throw new Error(error.message);
            available = false;
        }
        for (const row of (data ?? []) as Array<{ id: string; name: string | null; archived_at: string | null }>) {
            if (!row.name) continue;
            names.set(row.id, row.name);
            if (!row.archived_at) activeNames.push(row.name);
        }
    }
    let fromNotes = 0;
    for (const row of rows) {
        const chosen = row.referral_source_id ? names.get(row.referral_source_id) ?? null : null;
        const derived = chosen ? null : referralFromNote(row.agent_notes, activeNames);
        if (derived) fromNotes++;
        byViewing.set(row.id, chosen ?? derived);
    }
    return { available, byViewing, fromNotes };
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
    // Төлбөрийн нөхцөлийн баганууд (migration 20261113120000) алга орчинд тэдгээргүйгээр дахин уншина — тайланг унагахгүй.
    let termsAvailable = true;
    type ViewingRow = { id: string; scheduled_at: string; meeting_type: string | null; interests: unknown; advance_payment_term?: string | null; remainder_payment_term?: string | null };
    const readViewings = (columns: string) => fetchAllRows<ViewingRow>((from, to) => db.from('property_viewings')
        .select(columns)
        .eq('shop_id', shopId).is('deleted_at', null).eq('status', 'completed').gte('scheduled_at', start).lt('scheduled_at', end)
        .order('scheduled_at').order('id').range(from, to) as unknown as PromiseLike<{ data: ViewingRow[] | null; error: { message: string; code?: string } | null }>);
    const [viewings, units, meetingsSince] = await Promise.all([
        readViewings('id, scheduled_at, meeting_type, interests, advance_payment_term, remainder_payment_term').catch(async (error: unknown) => {
            if (!/advance_payment_term|remainder_payment_term/.test(error instanceof Error ? error.message : '')) throw error;
            termsAvailable = false;
            return readViewings('id, scheduled_at, meeting_type, interests');
        }),
        // Бүх ангилал: орон сууц биш сонирхлыг («Үйлчилгээ», «Зогсоол») ангиллаар нь бүлэглэнэ; өрөөг зөвхөн орон сууцнаас.
        fetchAllRows<{ block: string | null; model: string | null; rooms: number | string | null; category: string | null }>((from, to) => db.from('property_units')
            .select('block, model, rooms, category').eq('shop_id', shopId)
            .order('id').range(from, to)),
        loadMeetingsSince(db, shopId),
    ]);
    const meetings = viewings.map(row => ({
        id: row.id, day: ubDateStr(new Date(row.scheduled_at)), type: row.meeting_type, interests: row.interests,
        advanceTerm: row.advance_payment_term ?? null, remainderTerm: row.remainder_payment_term ?? null,
    }));
    const last = weeks.at(-1)!;
    const fresh = meetings.filter(meeting => meeting.type === 'new_customer' && meeting.day >= last.from && meeting.day <= last.to).map(meeting => meeting.id);
    const referrals = await loadViewingReferrals(db, shopId, fresh);
    return buildMeetingDetails({ meetingDate, meetings, units, referrals, meetingsSince, paymentTermsAvailable: termsAvailable });
}

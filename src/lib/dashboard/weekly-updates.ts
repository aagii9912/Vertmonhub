import type { PostgrestError, SupabaseClient } from '@supabase/supabase-js';
import { WeeklyUpdateSchema, type WeeklyUpdate } from './weekly-review';

/**
 * «Хурлын бэлтгэл»-ийн ажлын шинэчлэл (хийсэн ажил, саад, дараагийн алхам) — /api/dashboard/weekly-updates
 * ба AI хоёулаа ашиглана. shop, хэрэглэгч, зохиогчийн нэрийг серверээс авна.
 */
export const WEEKLY_UPDATE_COLUMNS = 'id,user_id,author_name,meeting_date,achievements,blockers,next_steps,updated_at';

/** Багийн (reports эрхтэй) эсвэл зөвхөн өөрийн шинэчлэлүүд; PostgREST-ийн 1000 мөрийн хязгаарт таслахгүй. */
export async function listWeeklyUpdates(
    db: SupabaseClient, shopId: string, meetingDate: string, viewer: { userId: string; canViewTeam: boolean },
): Promise<{ updates: WeeklyUpdate[] } | { error: PostgrestError }> {
    const updates: WeeklyUpdate[] = [];
    for (let offset = 0; ; offset += 500) {
        let query = db.from('weekly_updates').select(WEEKLY_UPDATE_COLUMNS).eq('shop_id', shopId).eq('meeting_date', meetingDate);
        if (!viewer.canViewTeam) query = query.eq('user_id', viewer.userId);
        const { data, error } = await query.order('id').range(offset, offset + 499);
        if (error) return { error };
        updates.push(...((data || []) as WeeklyUpdate[]));
        if (!data || data.length < 500) break;
    }
    return { updates };
}

/** Хэрэглэгчийн өөрийн шинэчлэлийг (shop, хурлын өдрөөр нэг) хадгална. */
export async function saveWeeklyUpdate(
    db: SupabaseClient, shopId: string, userId: string, input: unknown,
): Promise<{ update: WeeklyUpdate } | { invalid: string } | { error: PostgrestError }> {
    const parsed = WeeklyUpdateSchema.safeParse(input);
    if (!parsed.success) return { invalid: parsed.error.issues[0]?.message || 'Огноо, текстээ шалгана уу.' };
    const profile = await db.from('user_profiles').select('full_name').eq('id', userId).maybeSingle();
    if (profile.error) return { error: profile.error };
    const { meetingDate, achievements, blockers, nextSteps } = parsed.data;
    const { data, error } = await db.from('weekly_updates').upsert({
        shop_id: shopId, user_id: userId, author_name: profile.data?.full_name || 'Багийн гишүүн',
        meeting_date: meetingDate, achievements, blockers, next_steps: nextSteps,
        updated_at: new Date().toISOString(),
    }, { onConflict: 'shop_id,user_id,meeting_date' }).select(WEEKLY_UPDATE_COLUMNS).single();
    if (error) return { error };
    return { update: data as WeeklyUpdate };
}

/**
 * «Өдрийн тайлан»-гийн уулзалт (эзэмшигч 2026-10-19) — ээлжийн менежер хамт олныхоо болсон уулзалтыг
 * тухайн менежерийн нэр дээр бүртгэх, тэр өдрийн товлосон уулзалтыг «Болсон» / «Ирээгүй» гэж тэмдэглэх,
 * админ уулзалтын менежерийг засах. Бичилт бүр атомар RPC-ээр (уулзалт + лид + лидийн түүх + тайлангийн
 * түүх нэг transaction-д). Эрх, actor-ийг дуудагч (API) серверээс тогтооно; body-оос хэзээ ч авахгүй.
 *
 * Давхар лидээс сэргийлэх: утсыг төслийн хэмжээнд хайна — зорилтот менежерийн ганц лид бол түүнд холбоно,
 * өөр менежерийн эсвэл хариуцагчгүй лид бол бүртгэхгүй (409), олдоогүй бол шинэ лид (зорилтот менежерийнх).
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { formalManagerName } from '@/lib/dashboard/daily-report';
import {
    dailyMeetingPhone, dailyMeetingScheduledAt,
    type DailyMeetingCompleteInput, type DailyMeetingReassignInput, type DailyMeetingRecordInput,
} from '@/lib/dashboard/daily-report-meetings';
import { LEAD_NAME_OR_ANONYMOUS, leadDisplayName, normalizeLeadName } from '@/lib/leads/labels';
import { soleShopProjectId } from '@/lib/projects/shop-project';
import { shiftDate, ubDateStart } from '@/lib/sales/activity';
import { assertProjectManager, ProjectScopeError } from '@/lib/sales/project-scope';
import { classifyPhoneLeads, findProjectLeadsByPhone, loadProjectManagerNames, type ProjectPhoneLead } from '@/lib/services/ViewingService';
import { resolveReferralSource } from '@/lib/sales/referral-sources-store';

export interface DailyMeetingActor {
    userId: string;
    /** Хязгаарлагдсан: бүртгэлийн канон нэр (RPC шалгана); байгууллага: албан нэр эсвэл профайлын нэр. */
    name: string;
    /** null = байгууллагын эрх (API шалгасан); массив = менежерийн бүртгэлтэй төслүүд. */
    projectIds: string[] | null;
}

export type DailyMeetingResult<T> = { ok: true; data: T } | { ok: false; status: number; error: string };

const fail = (status: number, error: string) => ({ ok: false as const, status, error });

export const DAILY_MEETING_UNAVAILABLE = 'Өдрийн тайлангийн уулзалт бүртгэх хэсэг идэвхжээгүй байна. Админд хандаж шинэчлэлийг (migration) суулгана уу.';
const MISSING = ['PGRST202', '42883', '42P01', 'PGRST205'];
const INVALID = ['22023', '22P02', '22007', '22008'];

/** RPC-ийн алдааг үйлдэл бүрийн тогтмол монгол мессеж болгоно. */
function rpcFailure(error: { code?: string } | null, messages: { notFound: string; invalid: string }) {
    const code = error?.code || '';
    if (code === 'P0002') return fail(404, messages.notFound);
    // Хайлтын дараа ижил утастай лид үүссэн (зэрэгцээ бүртгэл).
    if (code === '23505') return fail(409, 'Энэ утастай лид дөнгөж бүртгэгдлээ. Хуудсаа шинэчлээд дахин оролдоно уу.');
    if (INVALID.includes(code)) return fail(400, messages.invalid);
    if (MISSING.includes(code)) return fail(503, DAILY_MEETING_UNAVAILABLE);
    return fail(503, 'Уулзалт хадгалагдсангүй. Дахин оролдоно уу.');
}

/** Хамт олны болсон уулзалтыг тухайн менежерийн нэр дээр бүртгэнэ (completed viewing). */
export async function recordDailyMeeting(
    db: SupabaseClient,
    shopId: string,
    actor: DailyMeetingActor,
    input: DailyMeetingRecordInput,
    now: Date = new Date(),
): Promise<DailyMeetingResult<{ viewing_id: string; lead_id: string | null; lead_created: boolean }>> {
    let projectId: string | null;
    try { projectId = await soleShopProjectId(db, shopId); }
    catch { return fail(503, 'Төсөл шалгахад алдаа гарлаа'); }
    if (!projectId) return fail(400, 'Төслөө сонгоно уу');
    if (actor.projectIds !== null && !actor.projectIds.includes(projectId)) return fail(403, 'Энэ төсөлд уулзалт бүртгэх эрхгүй');

    const scheduledAt = dailyMeetingScheduledAt(input.date, input.time, now);
    if (!scheduledAt) return fail(400, 'Уулзалтын цаг буруу байна');
    // RPC-тэй ижил 5 минутын зай (хөтчийн цаг бага зэрэг түрүүлж болно).
    if (Date.parse(scheduledAt) > now.getTime() + 5 * 60_000) return fail(400, 'Ирээдүйн цагийн уулзалтыг бүртгэхгүй. Цагаа шалгана уу.');
    const phone = dailyMeetingPhone(input.customer_phone);
    if (!phone) return fail(400, 'Утасны дугаараа бүтнээр оруулна уу');

    try { await assertProjectManager(db, shopId, projectId, input.manager); }
    catch (error) {
        if (error instanceof ProjectScopeError) return fail(error.status, error.message);
        throw error;
    }
    // «Сэжим (хаанаас ирсэн)»: шинэ харилцагчийн уулзалтад заавал (төсөлд идэвхтэй сонголт байгаа үед).
    const referral = await resolveReferralSource(db, shopId, { id: input.referral_source_id }, { newMeetingType: input.meeting_type });
    if (!referral.ok) return fail(referral.status, referral.error);

    let matches: ProjectPhoneLead[] | null;
    let activeManagers: Set<string>;
    try {
        [matches, activeManagers] = await Promise.all([
            findProjectLeadsByPhone(db, shopId, projectId, phone), loadProjectManagerNames(db, shopId, projectId),
        ]);
    } catch { return fail(503, 'Лид хайхад алдаа гарлаа'); }
    if (matches === null) return fail(409, 'Олон лид таарлаа. Лидээ шалгана уу.');
    // Зорилтот менежерийн ганц лид бол түүнд холбоно (бусдын давхар лид байсан ч буруу нэр рүү заахгүй).
    const verdict = classifyPhoneLeads(matches, {
        owner: input.manager, activeManagers,
        colleagueNext: 'Уулзалтыг тухайн менежерийн нэр дээр бүртгэнэ үү.',
        claim: `Энэ утастай лид хариуцагчгүй байна. ${formalManagerName(input.manager)} «Хариуцагчгүй» жагсаалтаас хариуцаж авсны дараа бүртгэнэ үү.`,
    });
    if (verdict.kind === 'blocked') return fail(409, verdict.error);
    const lead = verdict.kind === 'own' ? verdict.lead : null;

    // Шинэ харилцагчид л нэр (эсвэл «Нэр тодорхойгүй») шаардана; олдсон лидийн нэрийг өөрчлөхгүй.
    const customerName = input.anonymous ? null : normalizeLeadName(input.customer_name);
    if (!lead && !customerName && !input.anonymous) return fail(400, LEAD_NAME_OR_ANONYMOUS);

    const { data, error } = await db.rpc('record_daily_report_meeting', {
        p_shop_id: shopId,
        p_user_id: actor.userId,
        p_actor_name: actor.name,
        p_actor_project_ids: actor.projectIds,
        p_manager_name: input.manager,
        p_report_date: input.date,
        p_input: {
            project_id: projectId,
            lead_id: lead?.id ?? null,
            customer_name: lead ? null : customerName,
            customer_phone: phone,
            meeting_type: input.meeting_type,
            scheduled_at: scheduledAt,
            agent_notes: input.notes,
            customer_feedback: input.feedback,
            interest_level: input.interest_level,
            // Түүхэнд зөвхөн харагдах нэр (утас биш).
            customer_label: leadDisplayName(lead ?? customerName).slice(0, 200),
            // Сэжимгүй үед түлхүүрийг илгээхгүй (migration-ий өмнөх RPC мэдэхгүй түлхүүрийг татгалздаг).
            ...(referral.referralSourceId ? { referral_source_id: referral.referralSourceId } : {}),
        },
    });
    const row = data as { viewing_id?: string; lead_id?: string | null; lead_created?: boolean } | null;
    if (error || !row?.viewing_id) {
        return rpcFailure(error, { notFound: 'Лид олдсонгүй эсвэл уулзалт бүртгэх эрхгүй байна. Хуудсаа шинэчлээд дахин оролдоно уу.', invalid: 'Уулзалтын мэдээллийг шалгана уу' });
    }
    return { ok: true, data: { viewing_id: row.viewing_id, lead_id: row.lead_id ?? lead?.id ?? null, lead_created: !!row.lead_created } };
}

/** Тэр өдрийн товлосон уулзалтыг «Болсон» / «Ирээгүй» гэж тэмдэглэнэ (менежерийн нэр өөрчлөгдөхгүй). */
export async function completeDailyMeeting(
    db: SupabaseClient,
    shopId: string,
    actor: DailyMeetingActor,
    input: DailyMeetingCompleteInput,
): Promise<DailyMeetingResult<{ viewing_id: string; status: 'completed' | 'no_show' }>> {
    // Сонирхол, санал зөвхөн болсон уулзалтад, өгсөн үед л (байгаа утгыг null-оор дарахгүй).
    const details: Record<string, unknown> = {};
    if (input.status === 'completed' && input.interest_level !== null) details.interest_level = input.interest_level;
    if (input.status === 'completed' && input.feedback) details.customer_feedback = input.feedback;
    const { data, error } = await db.rpc('complete_daily_report_meeting', {
        p_shop_id: shopId,
        p_user_id: actor.userId,
        p_actor_name: actor.name,
        p_actor_project_ids: actor.projectIds,
        p_viewing_id: input.viewing_id,
        p_status: input.status,
        p_input: details,
        p_report_date: input.date,
        p_day_start: ubDateStart(input.date).toISOString(),
        p_day_end: ubDateStart(shiftDate(input.date, 1)).toISOString(),
    });
    const row = data as { viewing_id?: string } | null;
    if (error || !row?.viewing_id) {
        return rpcFailure(error, { notFound: 'Тухайн өдрийн товлосон уулзалт олдсонгүй. Хуудсаа шинэчилнэ үү.', invalid: 'Уулзалтын мэдээллийг шалгана уу' });
    }
    return { ok: true, data: { viewing_id: row.viewing_id, status: input.status } };
}

/** Админ: уулзалтыг аль менежерт тооцохыг засна (зөвхөн admin/super_admin — API шалгана). */
export async function reassignDailyMeeting(
    db: SupabaseClient,
    shopId: string,
    actor: DailyMeetingActor,
    input: DailyMeetingReassignInput,
): Promise<DailyMeetingResult<{ viewing_id: string; changed: boolean }>> {
    const { data, error } = await db.rpc('reassign_daily_report_meeting', {
        p_shop_id: shopId,
        p_user_id: actor.userId,
        p_actor_name: actor.name,
        p_viewing_id: input.viewing_id,
        p_manager_name: input.manager,
        p_report_date: input.date,
    });
    const row = data as { viewing_id?: string; changed?: boolean } | null;
    if (error || !row?.viewing_id) {
        return rpcFailure(error, { notFound: 'Уулзалт олдсонгүй', invalid: 'Тухайн төслийн идэвхтэй борлуулалтын менежерийг сонгоно уу' });
    }
    return { ok: true, data: { viewing_id: row.viewing_id, changed: !!row.changed } };
}

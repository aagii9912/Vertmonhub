import type { SupabaseClient } from '@supabase/supabase-js';
import { leadDisplayName } from '@/lib/leads/labels';
import { shiftDate, ubDateStart } from '@/lib/sales/activity';
import { fetchAllRows } from '@/lib/utils/pagination';
import { resolveReportViewer } from '@/lib/sales/manager-identity';
import { ProjectScopeError } from '@/lib/sales/project-scope';
import { viewingSelectionText, type ViewingInterest } from '@/lib/viewings/interests';
import {
    buildDailyReport, buildDailyReportChanges, flattenDailyNotes, joinDailyGeneralNotes, readDailyReportConfig, readDailyReportNotes, sumDailyCounts,
    type DailyCountRow, type DailyMeetingRow, type DailyReport, type DailyReportChange, type DailyReportChangeRow, type DailyReportConfig,
    type DailyReportConflict, type DailyRosterEntry, type SaveDailyReportInput,
} from './daily-report';

/**
 * «Өдрийн тайлан»-гийн DB давхарга — API route ба AI tool нэг loader-аар уншина. Алдааг хоосон тайлан
 * болгож нуухгүй (throw); migration хэрэглэгдээгүй бол `DailyReportUnavailableError`.
 * Тоо, тэмдэглэл, баталгаажуулалтыг `save_daily_report` RPC нэг transaction-д бичиж түүхэнд
 * (`daily_report_changes`) хуучин → шинэ утгаар нь хадгална.
 */
export class DailyReportUnavailableError extends Error {
    constructor() { super('Өдрийн тайлангийн хэсэг хараахан идэвхжээгүй байна. Админд хандаж шинэчлэлийг суулгана уу.'); }
}

/** Хүснэгт/багана/RPC алга (migration хэрэглэгдээгүй). */
const UNAVAILABLE = ['42P01', 'PGRST205', '42703', 'PGRST204', 'PGRST202', '42883'];
type DbError = { code?: string; message: string } | null;
function assertOk(error: DbError) {
    if (!error) return;
    if (UNAVAILABLE.includes(error.code || '')) throw new DailyReportUnavailableError();
    throw new Error(error.message);
}
/** fetchAllRows; migration хэрэглэгдээгүй бол `DailyReportUnavailableError`. */
function allRows<T>(page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: DbError }>): Promise<T[]> {
    return fetchAllRows<T>((from, to) => Promise.resolve(page(from, to)).then(result => {
        if (result.error && UNAVAILABLE.includes(result.error.code || '')) throw new DailyReportUnavailableError();
        return result;
    }));
}

/** Өдрийн тайланг ээлжээр нэгтгэнэ: төсөлдөө бүртгэлтэй менежер багийн тайланг харна. */
export async function resolveDailyReportViewer(
    db: SupabaseClient,
    shopId: string,
    input: Parameters<typeof resolveReportViewer>[2],
) {
    const viewer = await resolveReportViewer(db, shopId, input);
    const entry = viewer.identity?.rosterEntry;
    let ownManager = viewer.personal && entry?.is_active && input.userId && entry.user_id === input.userId ? entry.name : null;
    if (ownManager) {
        const { data, error } = await db.from('sales_manager_projects').select('project_id')
            .eq('shop_id', shopId).eq('manager_name', ownManager);
        if (error) throw new ProjectScopeError(503, 'Менежерийн төслийн харьяаллыг шалгаж чадсангүй');
        if (!data?.length) ownManager = null;
    }
    return { ...viewer, ownManager, canViewTeam: viewer.canViewTeam || !!ownManager };
}
export type DailyReportViewer = Awaited<ReturnType<typeof resolveDailyReportViewer>>;

/**
 * Ээлжийн менежерийн тоог нь оруулж болох хамт олон: тухайн төслийн ИДЭВХТЭЙ, төсөлд нь бүртгэлтэй
 * (`sales_manager_projects`) менежерүүдийн канон нэр.
 */
export async function loadDailyColleagues(db: SupabaseClient, shopId: string): Promise<string[]> {
    const [managers, links] = await Promise.all([
        allRows<{ name: string | null }>((from, to) => db.from('sales_managers').select('name')
            .eq('shop_id', shopId).eq('is_active', true).order('name').range(from, to)),
        allRows<{ manager_name: string | null }>((from, to) => db.from('sales_manager_projects').select('manager_name')
            .eq('shop_id', shopId).order('manager_name').order('project_id').range(from, to)),
    ]);
    const registered = new Set(links.map(row => row.manager_name));
    return [...new Set(managers.map(row => row.name).filter((name): name is string => !!name && registered.has(name)))];
}

export async function loadDailyReportConfig(db: SupabaseClient, shopId: string, shopName = '') {
    const { data, error } = await db.from('daily_report_settings').select('config, updated_at').eq('shop_id', shopId).maybeSingle();
    assertOk(error);
    return { ...readDailyReportConfig(data?.config ?? null, shopName), updatedAt: (data?.updated_at as string | undefined) ?? null };
}

/** Бүртгэл + холбосон акаунт (зөвхөн серверт; `loadDailyRoster` нь акаунтгүй). */
async function loadRosterAccounts(db: SupabaseClient, shopId: string): Promise<DailyRosterEntry[]> {
    const { data, error } = await db.from('sales_managers').select('name, is_active, user_id').eq('shop_id', shopId);
    assertOk(error);
    const userIds = [...new Set((data ?? []).map(row => row.user_id as string | null).filter((id): id is string => !!id))];
    const phones = new Map<string, string | null>();
    if (userIds.length) {
        // Зөвхөн энэ төслийн бүртгэлтэй холбосон акаунтууд; нэрээр тааруулж утас авахгүй.
        const profiles = await db.from('user_profiles').select('id, phone').in('id', userIds);
        assertOk(profiles.error);
        for (const profile of profiles.data ?? []) phones.set(profile.id, profile.phone);
    }
    return (data ?? []).filter(row => !!row.name).map(row => ({
        name: row.name as string, is_active: !!row.is_active, phone: phones.get(row.user_id) || null, user_id: (row.user_id as string | null) ?? null,
    }));
}
const withoutAccount = ({ name, is_active, phone }: DailyRosterEntry): DailyRosterEntry => ({ name, is_active, phone: phone ?? null });

/** Тайлангийн бүртгэл (нэр, идэвх, холбосон акаунтын утас) — акаунтын id-гүй, browser-т өгч болно. */
export async function loadDailyRoster(db: SupabaseClient, shopId: string): Promise<DailyRosterEntry[]> {
    return (await loadRosterAccounts(db, shopId)).map(withoutAccount);
}

type MeetingSelect = {
    id: string; sales_manager_name: string | null; meeting_type: string | null; scheduled_at: string;
    agent_notes: string | null; customer_feedback: string | null;
    interests?: ViewingInterest[];
    // PostgREST embed: many-to-one нь объект, supabase-js-ийн төрөлд массив байж болно.
    leads: Embedded<{ customer_name: string | null }>; properties: Embedded<{ name: string | null }>;
};
type PendingSelect = {
    id: string; sales_manager_name: string | null; meeting_type: string | null; scheduled_at: string;
    leads: Embedded<{ customer_name: string | null; sales_manager_name?: string | null; deleted_at?: string | null }>;
};
type Embedded<T> = T | T[] | null;
const one = <T,>(value: Embedded<T>): T | null => (Array.isArray(value) ? value[0] ?? null : value);

export async function loadDailyReport(db: SupabaseClient, options: {
    shopId: string;
    shopName: string;
    date: string;
    /** Огнооны муж: дуусах өдөр (оруулсан). Орхивол `date` нэг өдөр; урт мужийг дуудагч хязгаарлана. */
    to?: string;
    /** Хувийн горим: зөвхөн энэ менежерийн тоо, уулзалт. */
    only: string | null;
}): Promise<{ report: DailyReport; config: DailyReportConfig; configSaved: boolean; configInvalid: boolean; roster: DailyRosterEntry[] }> {
    const { shopId, date, only } = options;
    const to = options.to && options.to > date ? options.to : date;
    const ranged = to !== date;
    const start = ubDateStart(date).toISOString();
    const end = ubDateStart(shiftDate(to, 1)).toISOString();
    const settings = await loadDailyReportConfig(db, shopId, options.shopName);

    const [roster, counts, meetings, pending, leads, reportRows] = await Promise.all([
        loadRosterAccounts(db, shopId),
        allRows<DailyCountRow>((from, until) => {
            let query = db.from('daily_report_counts').select('manager_name, metric, value, updated_by, updated_by_name, updated_at')
                .eq('shop_id', shopId).gte('report_date', date).lte('report_date', to);
            if (only) query = query.eq('manager_name', only);
            return query.order('report_date').order('manager_name').order('metric').range(from, until);
        }),
        allRows<MeetingSelect>((from, until) => {
            let query = db.from('property_viewings')
                .select('id, sales_manager_name, meeting_type, scheduled_at, agent_notes, customer_feedback, interests, leads(customer_name), properties(name)')
                .eq('shop_id', shopId).is('deleted_at', null).eq('status', 'completed').gte('scheduled_at', start).lt('scheduled_at', end);
            if (only) query = query.eq('sales_manager_name', only);
            return query.order('scheduled_at').order('id').range(from, until);
        }),
        allRows<PendingSelect>((from, until) => {
            let query = db.from('property_viewings').select('id, sales_manager_name, meeting_type, scheduled_at, leads(customer_name, sales_manager_name, deleted_at)')
                .eq('shop_id', shopId).is('deleted_at', null).eq('status', 'scheduled').gte('scheduled_at', start).lt('scheduled_at', end);
            if (only) query = query.eq('sales_manager_name', only);
            return query.order('scheduled_at').order('id').range(from, until);
        }),
        // Шинэ лид: тухайн УБ өдөр бүртгэгдсэн, устгаагүй — зөвхөн хариуцагч, эх үүсвэр (тоолоход; нэр, утас уншихгүй).
        allRows<{ sales_manager_name: string | null; source: string | null }>((from, until) => {
            let query = db.from('leads').select('sales_manager_name, source')
                .eq('shop_id', shopId).is('deleted_at', null).gte('created_at', start).lt('created_at', end);
            if (only) query = query.eq('sales_manager_name', only);
            return query.order('created_at').order('id').range(from, until);
        }),
        db.from('daily_reports').select('report_date, notes, completed_by_name, completed_at').eq('shop_id', shopId)
            .gte('report_date', date).lte('report_date', to).order('report_date'),
    ]);
    assertOk(reportRows.error);
    const reportRow = reportRows.data?.find(row => row.report_date === date) ?? null;

    // Хуучин мөр (оруулсан хүний нэргүй): тухайн акаунтын профайлын нэр. Мужид нүд нийлбэр тул оруулсан хүнгүй.
    const legacy = ranged ? [] : [...new Set(counts.filter(row => row.updated_by && !row.updated_by_name).map(row => row.updated_by as string))];
    if (legacy.length) {
        const profiles = await db.from('user_profiles').select('id, full_name').in('id', legacy);
        assertOk(profiles.error);
        const names = new Map((profiles.data ?? []).map(profile => [profile.id as string, (profile.full_name as string | null) || null]));
        for (const row of counts) if (row.updated_by && !row.updated_by_name) row.updated_by_name = names.get(row.updated_by) ?? null;
    }

    const meetingRows: DailyMeetingRow[] = meetings.map(row => ({
        id: row.id,
        manager: row.sales_manager_name?.trim() || null,
        type: row.meeting_type,
        customer: leadDisplayName(one(row.leads)),
        property: viewingSelectionText(row.interests, one(row.properties)?.name),
        notes: row.agent_notes,
        feedback: row.customer_feedback,
        scheduled_at: row.scheduled_at,
    }));
    // Мужид шугамын тайлбар өдөр бүрийнх тул нэгтгэхгүй; нэмэлт тэмдэглэлийг огноотой нь жагсаана.
    const notes = only ? {} : ranged
        ? { general: joinDailyGeneralNotes((reportRows.data ?? []).map(row => ({ date: row.report_date as string, general: readDailyReportNotes(row.notes).general }))) }
        : readDailyReportNotes(reportRow?.notes);
    const report = buildDailyReport({
        date,
        to,
        title: settings.config.title || `${options.shopName} баг`,
        config: settings.config,
        roster,
        counts: ranged ? sumDailyCounts(counts) : counts,
        meetings: meetingRows,
        pendingMeetings: pending.map(row => {
            const lead = one(row.leads);
            return {
                id: row.id, manager: row.sales_manager_name?.trim() || null, type: row.meeting_type, customer: leadDisplayName(lead), scheduled_at: row.scheduled_at,
                // complete_daily_report_meeting-ийн менежерийн дүрэм: лидтэй, устгаагүй, хариуцагчтай.
                assigned: !!lead && !lead.deleted_at && !!lead.sales_manager_name?.trim(),
            };
        }),
        leads: leads.map(row => ({ manager: row.sales_manager_name?.trim() || null, source: row.source })),
        // Хувийн горимд багийн тэмдэглэл, баталгаажуулалт харуулахгүй (зөвхөн өөрийн багана).
        notes,
        completed: !only && reportRow?.completed_at
            ? { by: (reportRow.completed_by_name as string | null) ?? null, at: reportRow.completed_at as string }
            : null,
        completedDays: only ? 0 : (reportRows.data ?? []).filter(row => row.completed_at).length,
        only,
    });
    return { report, config: settings.config, configSaved: settings.saved, configInvalid: settings.invalid, roster: roster.map(withoutAccount) };
}

export type SaveDailyReportResult = { ok: true; changes: number } | { ok: false; conflicts: DailyReportConflict[] };

/**
 * Тоо (нүд), тэмдэглэл (зөвхөн илгээсэн түлхүүр), баталгаажуулалтыг `save_daily_report` RPC-ээр нэг
 * transaction-д хадгална: `expected` өгсөн нүд/тэмдэглэл энэ хооронд өөрчлөгдсөн бол юу ч бичихгүй
 * `{ ok: false, conflicts }`. Өөрчлөгдсөн нүд бүр түүхэнд бичигдэнэ (`restoredFrom` = сэргээсэн мөр).
 * Эрх, менежер, үзүүлэлтийн шалгалтыг дуудагч (route) хийнэ.
 */
export async function saveDailyReport(db: SupabaseClient, input: {
    shopId: string;
    userId: string | null;
    /** Оруулсан/баталгаажуулсан хүний нэр (тоо, түүх, «Тайлан хийж гүйцэтгэсэн»). */
    userName: string;
    data: SaveDailyReportInput;
    restoredFrom?: number | null;
}): Promise<SaveDailyReportResult> {
    const { data } = input;
    const cells = data.cells.map(cell => (cell.expected === undefined
        ? { manager: cell.manager, metric: cell.metric, value: cell.value }
        : { manager: cell.manager, metric: cell.metric, value: cell.value, expected: cell.expected }));
    const { data: result, error } = await db.rpc('save_daily_report', {
        p_shop_id: input.shopId,
        p_date: data.date,
        p_user_id: input.userId,
        p_user_name: input.userName,
        p_cells: cells,
        p_notes: data.notes === undefined ? null : flattenDailyNotes(data.notes, data.notesExpected),
        p_complete: data.complete ?? null,
        p_restored_from: input.restoredFrom ?? null,
    });
    assertOk(error);
    const body = result as { ok?: boolean; changes?: number; conflicts?: DailyReportConflict[] } | null;
    if (body?.ok === true) return { ok: true, changes: Number(body.changes) || 0 };
    if (body?.ok === false && Array.isArray(body.conflicts)) return { ok: false, conflicts: body.conflicts };
    throw new Error('save_daily_report: хариу буруу байна');
}

/** Нэг өдрийн түүхийн дээд мөр. */
export const DAILY_HISTORY_LIMIT = 500;

/** Тухайн өдрийн өөрчлөлтийн түүх (шинэ нь эхэнд, ≤ 500); акаунтын id уншихгүй. */
export async function loadDailyReportChanges(db: SupabaseClient, options: {
    shopId: string;
    shopName: string;
    date: string;
    /** Тоог нь засаж болох менежерүүд (сэргээх эрх). */
    editable: ReadonlySet<string>;
    canEditNotes: boolean;
}): Promise<DailyReportChange[]> {
    const { shopId, date } = options;
    const [settings, changes, counts, reportRow] = await Promise.all([
        loadDailyReportConfig(db, shopId, options.shopName),
        db.from('daily_report_changes')
            .select('id, kind, manager_name, metric, note_key, old_value, new_value, old_text, new_text, restored_from, meta, changed_by_name, changed_at')
            .eq('shop_id', shopId).eq('report_date', date)
            .order('changed_at', { ascending: false }).order('id', { ascending: false }).limit(DAILY_HISTORY_LIMIT),
        allRows<Pick<DailyCountRow, 'manager_name' | 'metric' | 'value'>>((from, to) => db.from('daily_report_counts').select('manager_name, metric, value')
            .eq('shop_id', shopId).eq('report_date', date).order('manager_name').order('metric').range(from, to)),
        db.from('daily_reports').select('notes').eq('shop_id', shopId).eq('report_date', date).maybeSingle(),
    ]);
    assertOk(changes.error);
    assertOk(reportRow.error);
    return buildDailyReportChanges((changes.data ?? []) as DailyReportChangeRow[], {
        config: settings.config, counts, notes: readDailyReportNotes(reportRow.data?.notes), editable: options.editable, canEditNotes: options.canEditNotes,
    });
}

export interface DailyReportChangeRecord {
    id: number; report_date: string; kind: string; manager_name: string | null; metric: string | null; note_key: string | null;
    old_value: number | null; new_value: number | null; old_text: string | null; new_text: string | null;
}
/** Сэргээх гэж буй түүхийн мөр (зөвхөн тухайн shop-ийнх). */
export async function loadDailyReportChange(db: SupabaseClient, shopId: string, id: number): Promise<DailyReportChangeRecord | null> {
    const { data, error } = await db.from('daily_report_changes')
        .select('id, report_date, kind, manager_name, metric, note_key, old_value, new_value, old_text, new_text')
        .eq('shop_id', shopId).eq('id', id).maybeSingle();
    assertOk(error);
    return (data as DailyReportChangeRecord | null) ?? null;
}

export async function saveDailyReportConfig(db: SupabaseClient, shopId: string, config: DailyReportConfig, userId: string | null): Promise<void> {
    const { error } = await db.from('daily_report_settings')
        .upsert({ shop_id: shopId, config, updated_by: userId, updated_at: new Date().toISOString() }, { onConflict: 'shop_id' });
    assertOk(error);
}

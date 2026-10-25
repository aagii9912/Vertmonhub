/**
 * Удирдлагын «Өөрчлөлтийн түүх» (`/admin/history`, super_admin) — хэн, хэзээ, юуг өөрчилснийг нэг жагсаалтад.
 *
 * Эх сурвалж (зөвхөн уншина, юу ч засахгүй), идэвхтэй төсөл (shop)-өөр:
 *  • daily_report_changes — өдрийн тайлангийн нүд, тэмдэглэл, баталгаажуулалт, уулзалт (хуучин → шинэ);
 *  • data_audit_log — харилцагч, лид, гэрээ, лидийн ангилал, байр, уулзалтыг нэмсэн/зассан/устгасан;
 *  • lead_activities — лидийн түүх (дуудлага, уулзалт, статус, менежер, тэмдэглэл, үнийн санал, систем).
 * «Нэрийн зөрүү»: тайлан, KPI менежерийг бүртгэлийн НЭРЭЭР нь танидаг тул бүртгэлд байхгүй нэрээр орсон
 * бичлэг, холбосон акаунтын зөрүүг харуулна (засвар нь «Төлөвлөгөө ба баг»-т, энд юу ч бичихгүй).
 *
 * DB-ийн алдааг хоосон өгөгдөл болгож нуухгүй (throw); daily_report_changes хүснэгт хараахан үүсээгүй
 * бол тэр эх сурвалжийг `unavailable`-д нэрлээд алгасна. Client-safe: DB client-ийг дуудагч өгнө.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { fetchAllRows } from '@/lib/utils/pagination';
import { ubDateStr } from '@/lib/utils/date';
import { daySpan, shiftDate, ubDateStart } from '@/lib/sales/activity';
import { ACTIVITY_LABEL, leadDisplayName } from '@/lib/leads/labels';
import { MEETING_TYPE_META, type MeetingType } from '@/lib/viewings/labels';
import {
    dailyMetricLabel, dailyNoteLabel, DailyReportDateSchema, formalManagerName, readDailyReportConfig,
    type DailyReportConfig,
} from '@/lib/dashboard/daily-report';

/** Нэг хариунд харуулах дээд бичлэг (эх сурвалж бүрээс +1 уншиж `truncated`-ийг тодорхойлно). */
export const ACTIVITY_FEED_LIMIT = 500;
export const ACTIVITY_FEED_MAX_DAYS = 92;
export const ACTIVITY_FEED_DEFAULT_DAYS = 30;
/** Лидийн түүхээс авах төрөл («contract» нь data_audit_log-д давхар орно). */
export const FEED_LEAD_ACTIVITY_TYPES = ['call', 'meeting', 'status', 'manager', 'note', 'quote', 'system'] as const;

export type ActivityFeedSource = 'daily_report' | 'audit' | 'lead';
export const ACTIVITY_SOURCE_LABEL: Record<ActivityFeedSource, string> = {
    daily_report: 'Өдрийн тайлан', audit: 'Өгөгдөл', lead: 'Лид',
};

export interface ActivityFeedItem {
    /** `<source>:<мөрийн id>` — эх сурвалж хооронд давхардахгүй. */
    id: string;
    at: string;
    source: ActivityFeedSource;
    /** daily_report: count|note|complete|meeting; audit: `<entity>.<action>`; lead: үйлдлийн төрөл. */
    kind: string;
    by: string | null;
    byUserId: string | null;
    summary: string;
    detail: string | null;
    href: string | null;
    /** Өдрийн тайлангийн өдөр (daily_report мөрөнд). */
    reportDate?: string;
}

export interface ActivityFeedUser {
    id: string;
    name: string;
    email: string | null;
    role: string | null;
    /** Энэ төслийн бүртгэлд холбосон менежерийн нэр(үүд). */
    managers: Array<{ name: string; active: boolean }>;
    owner: boolean;
    /** false = одоо гишүүн биш ч түүхэнд үйлдэл нь байгаа. */
    member: boolean;
}

export interface ActivityFeed {
    from: string;
    to: string;
    user: string | null;
    items: ActivityFeedItem[];
    truncated: boolean;
    unavailable: ActivityFeedSource[];
    users: ActivityFeedUser[];
}

/* ------------------------------------------------------------------ */
/* Шүүлтүүр                                                            */
/* ------------------------------------------------------------------ */

export const ActivityFeedQuerySchema = z.object({
    user: z.union([z.literal(''), z.guid()]).optional(),
    from: DailyReportDateSchema.optional(),
    to: DailyReportDateSchema.optional(),
});

/** Анхдагч нь УБ-ийн сүүлийн 30 өдөр; [from, to] хоёр захыг оруулна, 92 хоногоос ихгүй. */
export function resolveFeedRange(input: { from?: string; to?: string }, today = ubDateStr()): { from: string; to: string } | { error: string } {
    const to = input.to || today;
    const from = input.from || shiftDate(to, -(ACTIVITY_FEED_DEFAULT_DAYS - 1));
    if (from > to) return { error: 'Эхлэх огноо дуусах огнооноос хойш байна' };
    if (daySpan(from, to) > ACTIVITY_FEED_MAX_DAYS) return { error: `Хугацаа ${ACTIVITY_FEED_MAX_DAYS} хоногоос ихгүй байна` };
    return { from, to };
}

/* ------------------------------------------------------------------ */
/* Мөр → бичлэг (pure)                                                 */
/* ------------------------------------------------------------------ */

type Json = Record<string, unknown>;
const isRecord = (value: unknown): value is Json => !!value && typeof value === 'object' && !Array.isArray(value);
const text = (value: unknown): string | null => (typeof value === 'string' && value.trim() ? value.trim() : null);
const clip = (value: string | null | undefined, max: number): string | null => {
    const trimmed = value?.replace(/\s+/g, ' ').trim();
    if (!trimmed) return null;
    return trimmed.length > max ? `${trimmed.slice(0, max - 1)}…` : trimmed;
};
const cell = (value: number | null | undefined) => (value === null || value === undefined ? '—' : String(value));
const quoted = (value: string | null | undefined) => {
    const short = clip(value, 80);
    return short ? `«${short}»` : '—';
};
const managerTitle = (name: string | null | undefined) => (name?.trim() ? formalManagerName(name.trim()) : '—');

export interface DailyReportChangeRow {
    id: number | string;
    report_date: string;
    kind: string;
    manager_name: string | null;
    metric: string | null;
    note_key: string | null;
    old_value: number | null;
    new_value: number | null;
    old_text: string | null;
    new_text: string | null;
    viewing_id: string | null;
    restored_from: number | string | null;
    meta: unknown;
    changed_by: string | null;
    changed_by_name: string | null;
    changed_at: string;
}
const DAILY_CHANGE_COLUMNS = 'id, report_date, kind, manager_name, metric, note_key, old_value, new_value, old_text, new_text, viewing_id, restored_from, meta, changed_by, changed_by_name, changed_at';

function meetingChange(row: DailyReportChangeRow): { summary: string; detail: string | null } {
    const meta = isRecord(row.meta) ? row.meta : {};
    const manager = managerTitle(row.manager_name);
    switch (meta.action) {
        case 'record': {
            const type = MEETING_TYPE_META[meta.meeting_type as MeetingType]?.short;
            const detail = [clip(row.new_text, 120), type, meta.lead_created === true ? 'шинэ лид үүсгэв' : null].filter(Boolean).join(' · ');
            return { summary: `Уулзалт бүртгэв · ${manager}`, detail: detail || null };
        }
        case 'complete': return { summary: `Уулзалтыг «Болсон» гэж тэмдэглэв · ${manager}`, detail: null };
        case 'no_show': return { summary: `Уулзалтыг «Ирээгүй» гэж тэмдэглэв · ${manager}`, detail: null };
        case 'reassign': return { summary: `Уулзалтын менежер солив: ${managerTitle(row.old_text)} → ${managerTitle(row.new_text)}`, detail: null };
        default: return { summary: `Уулзалт · ${manager}`, detail: clip(row.new_text, 120) };
    }
}

export function dailyChangeItem(row: DailyReportChangeRow, config: DailyReportConfig, names: ReadonlyMap<string, string>): ActivityFeedItem {
    const restored = row.restored_from !== null && row.restored_from !== undefined ? ' · сэргээсэн' : '';
    let summary: string;
    let detail: string | null = null;
    if (row.kind === 'count') {
        summary = `${dailyMetricLabel(config, row.metric ?? '')} · ${managerTitle(row.manager_name)}: ${cell(row.old_value)} → ${cell(row.new_value)}${restored}`;
    } else if (row.kind === 'note') {
        summary = `${dailyNoteLabel(config, row.note_key ?? '')} засав${restored}`;
        detail = `${quoted(row.old_text)} → ${quoted(row.new_text)}`;
    } else if (row.kind === 'complete') {
        summary = row.new_text ? 'Тайланг баталгаажуулав' : 'Тайлангийн баталгаажуулалтыг цуцлав';
        detail = row.old_text ? `Өмнө нь: ${row.old_text}` : null;
    } else if (row.kind === 'meeting') {
        ({ summary, detail } = meetingChange(row));
    } else {
        summary = row.kind;
    }
    return {
        id: `daily_report:${row.id}`, at: row.changed_at, source: 'daily_report', kind: row.kind,
        by: text(row.changed_by_name) ?? (row.changed_by ? names.get(row.changed_by) ?? null : null), byUserId: row.changed_by,
        summary, detail, href: `/dashboard/daily-report?date=${row.report_date}`, reportDate: row.report_date,
    };
}

export interface AuditRow {
    id: string;
    actor_id: string | null;
    entity: string;
    entity_id: string | null;
    action: string;
    changes: unknown;
    created_at: string;
}
const AUDIT_ENTITY_LABEL: Record<string, string> = {
    customer: 'Харилцагч', lead: 'Лид', contract: 'Гэрээ', lead_category: 'Лидийн ангилал', referral_source: 'Сэжим (хаанаас ирсэн)', property: 'Байр', viewing: 'Уулзалт', unit: 'Нэгж',
};
const AUDIT_ACTION_LABEL: Record<string, string> = { create: 'нэмэв', update: 'засав', delete: 'устгав', transfer: 'шилжүүлэв' };
/** Түгээмэл талбарын нэр; бусад нь баганын нэрээрээ. */
const AUDIT_FIELD_LABEL: Record<string, string> = {
    name: 'Нэр', phone: 'Утас', email: 'И-мэйл', notes: 'Тэмдэглэл', tags: 'Шошго', status: 'Төлөв', tone: 'Өнгө',
    archived: 'Архив', sort_order: 'Дараалал', customer_name: 'Харилцагч', customer_phone: 'Утас', sales_manager: 'Менежер',
    sales_manager_name: 'Менежер', total_price: 'Нийт үнэ', contract_date: 'Гэрээний огноо', contract_number: 'Гэрээний дугаар',
    price: 'Үнэ', address: 'Хаяг', source: 'Эх сурвалж',
    // Гэрээний жагсаалтын (HUB) импорт
    order_date: 'Захиалга өгсөн огноо', payment_condition: 'Захиалгын нөхцөл', prepayment_condition: 'Урьдчилгааны нөхцөл',
    prepayment_due: 'Урьдчилгааны дүн', price_per_sqm: 'М.кв үнэ', contracted_area: 'Гэрээлсэн талбай', overdue_amount: 'Төлбөр хоцролт',
    overdue_as_of: 'Хоцролтын огноо', contract_status: 'Гэрээний төлөв', customer_first_name: 'Нэр', customer_last_name: 'Овог',
    product_type: 'Төрөл', block_name: 'Блок', floor: 'Давхар', model: 'Загвар', unit_number: 'Тоот', legacy_unit_number: 'Хуучин тоот',
};
/** Аудитын `changes._meta` — бичилтийн эх сурвалж (талбар биш). */
const AUDIT_META_KEY = '_meta';
const AUDIT_SOURCE_LABEL: Record<string, string> = { contract_list_import: 'Гэрээний жагсаалтын импорт' };
const holderName = (value: unknown) => (isRecord(value) ? text(value.customer_name) : text(value));

export function auditItem(row: AuditRow, names: ReadonlyMap<string, string>): ActivityFeedItem {
    const changes = isRecord(row.changes) ? row.changes : {};
    const entity = AUDIT_ENTITY_LABEL[row.entity] ?? row.entity;
    const action = AUDIT_ACTION_LABEL[row.action] ?? row.action;
    const meta = isRecord(changes[AUDIT_META_KEY]) ? changes[AUDIT_META_KEY] : null;
    // Засварт `name` нь өөрчлөгдсөн талбар; бичлэгийн нэр (ж: гэрээний байр) `_meta.label`-д.
    const name = text(changes.name) ?? text(meta?.label);
    let detail: string | null = null;
    if (row.action === 'transfer') {
        const from = holderName(changes.from);
        const to = holderName(changes.to);
        if (from || to) detail = `${from ?? '—'} → ${to ?? '—'}`;
    } else {
        const fields = Object.keys(changes).filter(key => key !== AUDIT_META_KEY && (key !== 'name' || row.action === 'update'));
        if (fields.length) {
            const shown = fields.slice(0, 8).map(key => AUDIT_FIELD_LABEL[key] ?? key);
            detail = `Талбар: ${shown.join(', ')}${fields.length > 8 ? ` +${fields.length - 8}` : ''}`;
        }
    }
    const source = typeof meta?.source === 'string' ? AUDIT_SOURCE_LABEL[meta.source] ?? null : null;
    if (source) detail = detail ? `${detail} · ${source}` : source;
    return {
        id: `audit:${row.id}`, at: row.created_at, source: 'audit', kind: `${row.entity}.${row.action}`,
        by: row.actor_id ? names.get(row.actor_id) ?? null : 'Систем', byUserId: row.actor_id,
        summary: `${entity} ${action}${name ? ` · ${clip(name, 80)}` : ''}`, detail,
        href: row.entity === 'lead' && row.entity_id ? `/dashboard/leads?lead=${encodeURIComponent(row.entity_id)}` : null,
    };
}

export interface LeadActivityRow {
    id: string;
    lead_id: string;
    type: string;
    content: string | null;
    created_by: string | null;
    created_by_name: string | null;
    created_at: string;
}

export function leadActivityItem(row: LeadActivityRow, leadName: string, names: ReadonlyMap<string, string>): ActivityFeedItem {
    return {
        id: `lead:${row.id}`, at: row.created_at, source: 'lead', kind: row.type,
        by: text(row.created_by_name) ?? (row.created_by ? names.get(row.created_by) ?? null : null), byUserId: row.created_by,
        summary: `${ACTIVITY_LABEL[row.type] ?? row.type} · ${leadName}`, detail: clip(row.content, 200),
        // Лидийн дэлгэрэнгүй нь жагсаалтын `?lead=` panel (тусдаа хуудас байхгүй).
        href: `/dashboard/leads?lead=${encodeURIComponent(row.lead_id)}`,
    };
}

/** Шинэ нь эхэнд; `limit`-ээс илүү бол таслаад `truncated`. */
export function mergeFeed(lists: ActivityFeedItem[][], limit = ACTIVITY_FEED_LIMIT): { items: ActivityFeedItem[]; truncated: boolean } {
    const all = lists.flat().sort((a, b) => (Date.parse(b.at) - Date.parse(a.at)) || b.id.localeCompare(a.id));
    return { items: all.slice(0, limit), truncated: all.length > limit };
}

/* ------------------------------------------------------------------ */
/* DB                                                                  */
/* ------------------------------------------------------------------ */

const MISSING_TABLE = new Set(['42P01', 'PGRST205']);
type DbError = { code?: string; message: string } | null;
function assertOk(error: DbError) {
    if (error) throw new Error(error.message);
}
const chunks = <T,>(values: T[], size = 200): T[][] => {
    const out: T[][] = [];
    for (let index = 0; index < values.length; index += size) out.push(values.slice(index, index + size));
    return out;
};

type Profile = { id: string; full_name: string | null; email: string | null };
async function loadProfiles(db: SupabaseClient, ids: string[]): Promise<Map<string, Profile>> {
    const profiles = new Map<string, Profile>();
    for (const part of chunks([...new Set(ids)])) {
        const { data, error } = await db.from('user_profiles').select('id, full_name, email').in('id', part);
        assertOk(error);
        for (const row of (data ?? []) as Profile[]) profiles.set(row.id, row);
    }
    return profiles;
}
const profileName = (profile: Profile | undefined) => text(profile?.full_name) ?? text(profile?.email);

/** Төслийн гишүүд (эзэмшигч ∪ shop_members): профайлын нэр, дүр, энэ төслийн бүртгэлийн нэр. */
export async function loadShopUsers(db: SupabaseClient, shopId: string): Promise<ActivityFeedUser[]> {
    const [shopRes, members, roster] = await Promise.all([
        db.from('shops').select('user_id').eq('id', shopId).maybeSingle(),
        fetchAllRows<{ user_id: string }>((from, to) => db.from('shop_members').select('user_id').eq('shop_id', shopId).order('user_id').range(from, to)),
        fetchAllRows<{ name: string; user_id: string | null; is_active: boolean }>((from, to) => db.from('sales_managers')
            .select('name, user_id, is_active').eq('shop_id', shopId).order('name').range(from, to)),
    ]);
    assertOk(shopRes.error);
    const ownerId = (shopRes.data?.user_id as string | null | undefined) ?? null;
    const ids = [...new Set([...(ownerId ? [ownerId] : []), ...members.map(row => row.user_id).filter(Boolean)])];
    if (!ids.length) return [];
    const profiles = await loadProfiles(db, ids);
    const roles = new Map<string, string>();
    for (const part of chunks(ids)) {
        const { data, error } = await db.from('user_roles').select('user_id, role').in('user_id', part);
        assertOk(error);
        for (const row of data ?? []) roles.set(row.user_id as string, row.role as string);
    }
    return ids.map(id => ({
        id,
        name: profileName(profiles.get(id)) ?? 'Нэргүй хэрэглэгч',
        email: text(profiles.get(id)?.email),
        role: roles.get(id) ?? null,
        managers: roster.filter(row => row.user_id === id).map(row => ({ name: row.name, active: !!row.is_active })),
        owner: id === ownerId,
        member: true,
    })).sort((a, b) => a.name.localeCompare(b.name, 'mn'));
}

export async function loadActivityFeed(db: SupabaseClient, options: {
    shopId: string;
    shopName?: string;
    from: string;
    to: string;
    /** Зөвхөн энэ хэрэглэгчийн үйлдэл; null = бүгд. */
    userId: string | null;
}): Promise<ActivityFeed> {
    const { shopId, userId } = options;
    const start = ubDateStart(options.from).toISOString();
    const end = ubDateStart(shiftDate(options.to, 1)).toISOString();
    const cap = ACTIVITY_FEED_LIMIT + 1;

    const [changesRes, auditRes, activityRes, settingsRes, users] = await Promise.all([
        (() => {
            let query = db.from('daily_report_changes').select(DAILY_CHANGE_COLUMNS)
                .eq('shop_id', shopId).gte('changed_at', start).lt('changed_at', end);
            if (userId) query = query.eq('changed_by', userId);
            return query.order('changed_at', { ascending: false }).order('id', { ascending: false }).limit(cap);
        })(),
        (() => {
            let query = db.from('data_audit_log').select('id, actor_id, entity, entity_id, action, changes, created_at')
                .eq('shop_id', shopId).gte('created_at', start).lt('created_at', end);
            if (userId) query = query.eq('actor_id', userId);
            return query.order('created_at', { ascending: false }).order('id', { ascending: false }).limit(cap);
        })(),
        (() => {
            let query = db.from('lead_activities').select('id, lead_id, type, content, created_by, created_by_name, created_at')
                .eq('shop_id', shopId).in('type', [...FEED_LEAD_ACTIVITY_TYPES]).gte('created_at', start).lt('created_at', end);
            if (userId) query = query.eq('created_by', userId);
            return query.order('created_at', { ascending: false }).order('id', { ascending: false }).limit(cap);
        })(),
        db.from('daily_report_settings').select('config').eq('shop_id', shopId).maybeSingle(),
        loadShopUsers(db, shopId),
    ]);

    const unavailable: ActivityFeedSource[] = [];
    let changes: DailyReportChangeRow[] = [];
    if (changesRes.error && MISSING_TABLE.has(changesRes.error.code || '')) unavailable.push('daily_report');
    else {
        assertOk(changesRes.error);
        changes = (changesRes.data ?? []) as DailyReportChangeRow[];
    }
    // data_audit_log үүсээгүй орчинд (production 2026-10-20) тэр эх сурвалжийг алгасна.
    const auditMissing = !!auditRes.error && MISSING_TABLE.has(auditRes.error.code || '');
    if (auditMissing) unavailable.push('audit');
    else assertOk(auditRes.error);
    assertOk(activityRes.error);
    if (settingsRes.error && !MISSING_TABLE.has(settingsRes.error.code || '')) assertOk(settingsRes.error);
    const audits = (auditMissing ? [] : auditRes.data ?? []) as AuditRow[];
    const activities = (activityRes.data ?? []) as LeadActivityRow[];
    const { config } = readDailyReportConfig(settingsRes.error ? null : settingsRes.data?.config ?? null, options.shopName ?? '');

    // Үйлдэл хийсэн хүний нэр: хадгалсан нэр → профайл (гишүүнээс гарсан хүн ч орно).
    const actorIds = [
        ...changes.map(row => row.changed_by), ...audits.map(row => row.actor_id), ...activities.map(row => row.created_by),
    ].filter((id): id is string => !!id);
    const known = new Map(users.map(user => [user.id, user.name]));
    const missing = [...new Set(actorIds)].filter(id => !known.has(id));
    const extraProfiles = missing.length ? await loadProfiles(db, missing) : new Map<string, Profile>();
    const names = new Map(known);
    for (const id of missing) {
        const name = profileName(extraProfiles.get(id));
        if (name) names.set(id, name);
    }

    const leadNames = new Map<string, string>();
    for (const part of chunks([...new Set(activities.map(row => row.lead_id))])) {
        const { data, error } = await db.from('leads').select('id, customer_name, deleted_at').eq('shop_id', shopId).in('id', part);
        assertOk(error);
        for (const lead of data ?? []) leadNames.set(lead.id as string, `${leadDisplayName(lead as { customer_name: string | null })}${lead.deleted_at ? ' (устгасан)' : ''}`);
    }

    const { items, truncated } = mergeFeed([
        changes.map(row => dailyChangeItem(row, config, names)),
        audits.map(row => auditItem(row, names)),
        activities.map(row => leadActivityItem(row, leadNames.get(row.lead_id) ?? 'Лид', names)),
    ]);
    // Шүүлтүүрт: одоо гишүүн биш ч түүхэнд үйлдэлтэй хүн.
    const former: ActivityFeedUser[] = missing.map(id => ({
        id, name: names.get(id) ?? 'Нэргүй хэрэглэгч', email: text(extraProfiles.get(id)?.email), role: null, managers: [], owner: false, member: false,
    })).sort((a, b) => a.name.localeCompare(b.name, 'mn'));
    return { from: options.from, to: options.to, user: userId, items, truncated, unavailable, users: [...users, ...former] };
}

/* ------------------------------------------------------------------ */
/* Нэрийн зөрүү                                                        */
/* ------------------------------------------------------------------ */

export const NAME_SOURCES = ['leads', 'viewings', 'contracts', 'daily_counts', 'service_logs'] as const;
export type NameSource = (typeof NAME_SOURCES)[number];
export const NAME_SOURCE_LABEL: Record<NameSource, string> = {
    leads: 'Лид', viewings: 'Уулзалт', contracts: 'Гэрээ', daily_counts: 'Өдрийн тайлан', service_logs: 'Санал гомдол',
};
export type NameCounts = Partial<Record<NameSource, number>>;

export interface RosterNameRow {
    name: string;
    isActive: boolean;
    linked: boolean;
    /** Холбосон акаунтын профайлын нэр, и-мэйл. */
    profileName: string | null;
    email: string | null;
    projects: number;
    counts: NameCounts;
    flags: {
        /** Профайлын нэр бүртгэлийн нэрээс өөр (мэдээлэл төдий: тайлан бүртгэлийн нэрээр танина). */
        profileDiffers: boolean;
        /** Төсөлд бүртгэлгүй — тайлан, лидийн хүрээ хаагдана. */
        noProject: boolean;
        /** Идэвхгүй боловч акаунт холбоостой хэвээр. */
        inactiveButLinked: boolean;
        /** Нэг акаунт энэ төслийн хэд хэдэн бүртгэлд холбогдсон — нэрээ танихгүй (профайлын нэрээр бичигдэнэ). */
        sharedAccount: boolean;
    };
}

export interface UnknownNameRow {
    /** Өгөгдөлд хадгалагдсан яг тэр нэр. */
    name: string;
    counts: NameCounts;
    total: number;
    /** Ойролцоо бүртгэлийн нэр (ижил өөрийн нэр, эсвэл холбосон акаунтын профайлын нэр/и-мэйл). */
    similar: string[];
}

export interface NameMismatchReport {
    roster: RosterNameRow[];
    unknown: UnknownNameRow[];
    unavailable: NameSource[];
}

export interface NameMismatchInput {
    roster: Array<{ name: string; user_id: string | null; is_active: boolean }>;
    profiles: ReadonlyMap<string, { full_name: string | null; email: string | null }>;
    memberships: Array<{ manager_name: string }>;
    names: Partial<Record<NameSource, Array<string | null>>>;
    unavailable?: NameSource[];
}

const lower = (value: string) => value.trim().toLocaleLowerCase('mn');
const compactKey = (value: string) => lower(value).replace(/[\s.]+/gu, '');
/** «Р.Чанцалдулам», «Чанцалдулам.Раднаа» → «чанцалдулам». */
const givenKey = (value: string) => lower(formalManagerName(value.trim()).replace(/^\S{1,2}\.\s+/u, ''));

/** PURE: бүртгэл ба өгөгдөл дэх нэрийг харьцуулна. */
export function buildNameMismatchReport(input: NameMismatchInput): NameMismatchReport {
    const counts = new Map<string, NameCounts>();
    for (const source of NAME_SOURCES) {
        for (const raw of input.names[source] ?? []) {
            if (typeof raw !== 'string' || !raw.trim()) continue;
            const entry = counts.get(raw) ?? {};
            entry[source] = (entry[source] ?? 0) + 1;
            counts.set(raw, entry);
        }
    }
    const projectCount = new Map<string, number>();
    for (const row of input.memberships) projectCount.set(row.manager_name, (projectCount.get(row.manager_name) ?? 0) + 1);
    const linkCount = new Map<string, number>();
    for (const row of input.roster) if (row.user_id) linkCount.set(row.user_id, (linkCount.get(row.user_id) ?? 0) + 1);

    const roster: RosterNameRow[] = input.roster.map(row => {
        const profile = row.user_id ? input.profiles.get(row.user_id) : undefined;
        const fullName = text(profile?.full_name);
        return {
            name: row.name,
            isActive: !!row.is_active,
            linked: !!row.user_id,
            profileName: fullName,
            email: text(profile?.email),
            projects: projectCount.get(row.name) ?? 0,
            counts: counts.get(row.name) ?? {},
            flags: {
                profileDiffers: !!fullName && fullName !== row.name,
                noProject: !projectCount.get(row.name),
                inactiveButLinked: !row.is_active && !!row.user_id,
                sharedAccount: !!row.user_id && (linkCount.get(row.user_id) ?? 0) > 1,
            },
        };
    }).sort((a, b) => Number(b.isActive) - Number(a.isActive) || a.name.localeCompare(b.name, 'mn'));

    const rosterNames = new Set(input.roster.map(row => row.name));
    const unknown: UnknownNameRow[] = [...counts.entries()].filter(([name]) => !rosterNames.has(name)).map(([name, sourceCounts]) => {
        const tokens = new Set(lower(name).split(/[\s.]+/u).filter(token => token.length >= 3));
        const similar = roster.filter(row => {
            if (compactKey(row.name) === compactKey(name)) return true;
            const given = givenKey(row.name);
            if (given.length >= 3 && (given === givenKey(name) || tokens.has(given))) return true;
            return [row.profileName, row.email].some(value => !!value && lower(value) === lower(name));
        }).map(row => row.name);
        return { name, counts: sourceCounts, total: Object.values(sourceCounts).reduce((sum, value) => sum + (value ?? 0), 0), similar };
    }).sort((a, b) => b.total - a.total || a.name.localeCompare(b.name, 'mn'));

    return { roster, unknown, unavailable: input.unavailable ?? [] };
}

class SourceUnavailable extends Error {}
/** Нэрийн нэг баганыг бүхэлд нь уншина; `optional` эх сурвалжийн хүснэгт/багана байхгүй бол unavailable. */
async function readNames<T extends Record<string, unknown>>(
    page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: DbError }>,
    column: keyof T,
    optional: boolean,
): Promise<Array<string | null> | null> {
    try {
        const rows = await fetchAllRows<T>(async (from, to) => {
            const result = await page(from, to);
            if (optional && result.error && (MISSING_TABLE.has(result.error.code || '') || result.error.code === '42703')) throw new SourceUnavailable();
            return result;
        });
        return rows.map(row => (typeof row[column] === 'string' ? row[column] as string : null));
    } catch (error) {
        if (error instanceof SourceUnavailable) return null;
        throw error;
    }
}

export async function loadNameMismatches(db: SupabaseClient, shopId: string): Promise<NameMismatchReport> {
    const [roster, memberships, leads, viewings, contracts, dailyCounts, serviceLogs] = await Promise.all([
        fetchAllRows<{ name: string; user_id: string | null; is_active: boolean }>((from, to) => db.from('sales_managers')
            .select('name, user_id, is_active').eq('shop_id', shopId).order('name').range(from, to)),
        fetchAllRows<{ manager_name: string }>((from, to) => db.from('sales_manager_projects')
            .select('manager_name').eq('shop_id', shopId).order('manager_name').order('project_id').range(from, to)),
        readNames<{ sales_manager_name: string | null }>((from, to) => db.from('leads').select('sales_manager_name')
            .eq('shop_id', shopId).is('deleted_at', null).not('sales_manager_name', 'is', null).order('id').range(from, to), 'sales_manager_name', false),
        readNames<{ sales_manager_name: string | null }>((from, to) => db.from('property_viewings').select('sales_manager_name')
            .eq('shop_id', shopId).is('deleted_at', null).not('sales_manager_name', 'is', null).order('id').range(from, to), 'sales_manager_name', false),
        readNames<{ sales_manager: string | null }>((from, to) => db.from('property_contracts').select('sales_manager')
            .eq('shop_id', shopId).is('deleted_at', null).not('sales_manager', 'is', null).order('id').range(from, to), 'sales_manager', false),
        readNames<{ manager_name: string | null }>((from, to) => db.from('daily_report_counts').select('manager_name')
            .eq('shop_id', shopId).order('report_date').order('manager_name').order('metric').range(from, to), 'manager_name', true),
        readNames<{ manager_name: string | null }>((from, to) => db.from('service_logs').select('manager_name')
            .eq('shop_id', shopId).not('manager_name', 'is', null).order('id').range(from, to), 'manager_name', true),
    ]);
    const linked = roster.map(row => row.user_id).filter((id): id is string => !!id);
    const profiles = linked.length ? await loadProfiles(db, linked) : new Map<string, Profile>();
    const sources: Record<NameSource, Array<string | null> | null> = {
        leads, viewings, contracts, daily_counts: dailyCounts, service_logs: serviceLogs,
    };
    return buildNameMismatchReport({
        roster,
        profiles,
        memberships,
        names: Object.fromEntries(NAME_SOURCES.map(source => [source, sources[source] ?? []])),
        unavailable: NAME_SOURCES.filter(source => sources[source] === null),
    });
}

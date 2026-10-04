/**
 * Elysium.mn ↔ CRM лидийн тулгалт. Шууд дамжуулалт (push) үндсэн зам; энэ үйлчилгээ нь
 * Elysium `event_leads`-ийг cron/гараар татаж, дамжуулалтаар ирээгүй хүсэлтийг нэг удаа
 * `insertLeadOnce`-оор бичнэ (client_request_id = event_leads.id, created_at = Elysium-д
 * ирсэн цаг). Эх мөр бүрийн үр дүн `external_lead_imports` ledger-т нэг удаа үлдэнэ.
 * API (cron, админ) ба дамжуулалтын route хоёулаа эндээс ашиглана.
 * Лог зөвхөн id, тоо агуулна — утас, и-мэйл бичихгүй.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { insertLeadOnce } from '@/lib/services/LeadService';
import { logLeadActivity } from '@/lib/leads/activities';
import {
    contactKey, ELYSIUM_ACTOR_NAME, ELYSIUM_IMPORT_NOTE, ELYSIUM_LEAD_SOURCE, ELYSIUM_MATCH_WINDOW,
    elysiumRepeatInquiryText, findMatchingLead, normalizeEventLead, submissionRecorded, toCandidate,
    type CandidateLeadRow, type EventLeadRow, type LeadCandidate,
} from '@/lib/leads/elysium';
import { countEventLeads, elysiumSourceConfigured, ElysiumSourceError, fetchEventLeads } from '@/lib/leads/elysium-source';
import { fetchAllRows } from '@/lib/utils/pagination';
import { logger } from '@/lib/utils/logger';

/** Дамжуулалт, түүний дахин оролдлого дуусах хүртэл хүлээх хугацаа. */
export const ELYSIUM_SETTLE_MS = 15 * 60 * 1000;
/** Cursor-оос өмнө дахин унших нөөц (удаан commit болсон мөрийг алдахгүй). */
export const ELYSIUM_LOOKBACK_MS = 24 * 60 * 60 * 1000;
/** Нэг ажиллалтад бичих дээд мөр (үлдсэнийг дараагийн ажиллалт үргэлжлүүлнэ). */
export const ELYSIUM_MAX_ROWS_PER_RUN = 200;

const SOURCE = 'elysium';
/** `.in()` URL-ийн уртыг хязгаарлана (uuid × 100 ≈ 4KB). */
const CHUNK = 100;
const LEAD_COLUMNS = 'id, project_id, client_request_id, customer_phone, customer_email, notes, created_at, deleted_at';
const KEY_CONFLICT = 'Хүсэлтийн түлхүүр өөр төсөлд ашиглагдсан';

export type ElysiumOutcome = 'imported' | 'matched' | 'invalid';
export type ElysiumSyncTrigger = 'cron' | 'manual';

export class ElysiumSyncError extends Error {
    constructor(message: string, readonly status = 503) { super(message); }
}

export interface ElysiumConfig {
    pushConfigured: boolean;
    pullConfigured: boolean;
    projectId: string | null;
}

/** Тохиргооны төлөв — зөвхөн boolean, нууц буцаахгүй. */
export function elysiumConfig(env: NodeJS.ProcessEnv = process.env): ElysiumConfig {
    const projectId = env.ELYSIUM_LEAD_PROJECT_ID?.trim() || null;
    return {
        pushConfigured: !!env.ELYSIUM_LEAD_SYNC_SECRET?.trim() && !!projectId,
        pullConfigured: elysiumSourceConfigured(env) && !!projectId,
        projectId,
    };
}

/** Уншилтын цонх: дээд хил = одоо − 15 мин, доод хил = cursor − 1 өдөр (анх удаа бүх түүх). */
export function elysiumSyncWindow(now: Date, cursorAt: string | null): { since: string | null; until: string } {
    const cursorMs = cursorAt ? Date.parse(cursorAt) : NaN;
    return {
        since: Number.isFinite(cursorMs) ? new Date(cursorMs - ELYSIUM_LOOKBACK_MS).toISOString() : null,
        until: new Date(now.getTime() - ELYSIUM_SETTLE_MS).toISOString(),
    };
}

export interface ElysiumSyncSample {
    sourceId: string;
    createdAt: string;
    name: string | null;
    outcome: ElysiumOutcome | 'failed';
    detail: string | null;
}

export interface ElysiumSyncResult {
    status: 'ok' | 'partial' | 'skipped';
    skipped?: 'not_configured' | 'disabled';
    dryRun: boolean;
    since: string | null;
    until: string | null;
    /** Elysium-д хадгалагдсан нийт хүсэлт (уншиж чадаагүй бол null). */
    sourceTotal: number | null;
    /** Цонхонд уншсан эх мөр. */
    read: number;
    /** Ledger-т ороогүй (энэ ажиллалтад шийдэх) мөр. */
    pending: number;
    imported: number;
    matched: number;
    invalid: number;
    failed: number;
    /** Нэг ажиллалтын хязгаараас үлдэж, дараагийн ажиллалтад шилжсэн мөр. */
    remaining: number;
    /** Тохирсон лид дээр бичсэн «дахин хүсэлт» бичлэг. */
    repeats: number;
    sample: ElysiumSyncSample[];
}

interface SyncState {
    enabled: boolean;
    cursor_at: string | null;
}

interface LedgerRow {
    source: typeof SOURCE;
    source_id: string;
    shop_id: string;
    project_id: string;
    lead_id: string | null;
    outcome: ElysiumOutcome;
    source_name: string | null;
    source_created_at: string;
    detail: string | null;
}

function chunks<T>(items: T[], size = CHUNK): T[][] {
    const out: T[][] = [];
    for (let index = 0; index < items.length; index += size) out.push(items.slice(index, index + size));
    return out;
}

const emptyResult = (dryRun: boolean): ElysiumSyncResult => ({
    status: 'ok', dryRun, since: null, until: null, sourceTotal: null,
    read: 0, pending: 0, imported: 0, matched: 0, invalid: 0, failed: 0, remaining: 0, repeats: 0, sample: [],
});

async function loadProject(db: SupabaseClient, projectId: string): Promise<{ id: string; shop_id: string; name: string | null }> {
    const { data, error } = await db.from('projects').select('id, shop_id, name').eq('id', projectId).maybeSingle();
    if (error) throw new ElysiumSyncError('Elysium-ийн төслийг шалгаж чадсангүй.');
    if (!data) throw new ElysiumSyncError('ELYSIUM_LEAD_PROJECT_ID-д заасан төсөл олдсонгүй.', 409);
    return data as { id: string; shop_id: string; name: string | null };
}

async function loadState(db: SupabaseClient): Promise<SyncState | null> {
    const { data, error } = await db.from('external_lead_sync').select('enabled, cursor_at').eq('source', SOURCE).maybeSingle();
    if (error) throw new ElysiumSyncError('Холболтын төлөвийн хүснэгт уншигдсангүй (migration 20261004164000 суулгасан эсэхийг шалгана уу).');
    return (data as SyncState | null) ?? null;
}

async function recordState(db: SupabaseClient, input: {
    started: string; shopId: string | null; projectId: string | null; cursor: string | null; error: string | null; result: Record<string, unknown>;
}): Promise<void> {
    const { error } = await db.rpc('record_external_lead_sync', {
        p_source: SOURCE, p_started: input.started, p_shop: input.shopId, p_project: input.projectId,
        p_cursor: input.cursor, p_error: input.error, p_result: input.result,
    });
    if (error) {
        logger.error('[Elysium sync] state save failed', { code: error.code });
        throw new ElysiumSyncError('Татан авалтын төлөв хадгалагдсангүй.');
    }
}

/** Ledger-т аль хэдийн бичигдсэн эх мөрүүд (дахин боловсруулахгүй). */
async function processedSourceIds(db: SupabaseClient, ids: string[]): Promise<Set<string>> {
    const done = new Set<string>();
    for (const part of chunks(ids)) {
        const { data, error } = await db.from('external_lead_imports').select('source_id').eq('source', SOURCE).in('source_id', part);
        if (error) throw new ElysiumSyncError('Тулгалтын бүртгэл уншигдсангүй.');
        for (const row of (data || []) as Array<{ source_id: string }>) done.add(row.source_id);
    }
    return done;
}

/**
 * Тохирсон лид дээр «дахин хүсэлт» системийн бичлэг үлдээнэ. Ижил агуулга өмнө нь
 * (дамжуулалт эсвэл өмнөх татан авалт) бичигдсэн бол давтахгүй. Best-effort.
 */
async function logRepeatInquiry(db: SupabaseClient, input: {
    shopId: string;
    lead: LeadCandidate;
    submission: { message: string | null; event: string | null; notes: string | null; phone: string | null; email: string | null };
    meta: Record<string, unknown>;
}): Promise<string | null> {
    const { data, error } = await db.from('lead_activities').select('content')
        .eq('shop_id', input.shopId).eq('lead_id', input.lead.id).eq('type', 'system')
        .order('created_at', { ascending: false }).limit(50);
    if (!error && submissionRecorded(((data || []) as Array<{ content: string | null }>).map((row) => row.content), input.submission)) return null;
    const content = elysiumRepeatInquiryText(input.submission, input.lead);
    const activity = await logLeadActivity(db, {
        shopId: input.shopId, leadId: input.lead.id, type: 'system', content,
        meta: { source: SOURCE, kind: 'repeat_inquiry', ...input.meta }, createdByName: ELYSIUM_ACTOR_NAME,
    });
    return activity ? content : null;
}

/** Лид хадгалах алдаа тогтмол (өгөгдлийн) эсэх — тийм бол дахин оролдохгүй, «алдаатай» гэж бүртгэнэ. */
const permanentInsertError = (code: string | undefined) => !!code && /^2[23]/.test(code);

/**
 * Elysium `event_leads`-ийг CRM-тэй тулгана.
 * - cron: тохиргоо дутуу эсвэл админ идэвхжүүлээгүй бол `skipped`.
 * - dryRun: юу ч бичихгүй, ямар үр дүн гарахыг тоолж жишээ буцаана.
 * Шийдэл: client_request_id = event_leads.id лид байвал «imported»; утас/и-мэйлээр цонхон
 * дотор тохирвол «matched» (шинэ агуулгыг «дахин хүсэлт»-ээр); үгүй бол шинэ лид («imported»).
 */
export async function syncElysiumLeads(
    db: SupabaseClient,
    options: { trigger: ElysiumSyncTrigger; dryRun?: boolean; now?: Date },
): Promise<ElysiumSyncResult> {
    const dryRun = !!options.dryRun;
    const config = elysiumConfig();
    if (!config.pullConfigured || !config.projectId) {
        if (options.trigger === 'cron') return { ...emptyResult(dryRun), status: 'skipped', skipped: 'not_configured' };
        throw new ElysiumSyncError('Автомат татах тохируулаагүй байна: ELYSIUM_SUPABASE_URL, ELYSIUM_SUPABASE_SERVICE_KEY, ELYSIUM_LEAD_PROJECT_ID.', 409);
    }
    const project = await loadProject(db, config.projectId);
    const state = await loadState(db);
    if (options.trigger === 'cron' && !state?.enabled) return { ...emptyResult(dryRun), status: 'skipped', skipped: 'disabled' };

    const now = options.now ?? new Date();
    const started = now.toISOString();
    const { since, until } = elysiumSyncWindow(now, state?.cursor_at ?? null);
    const result: ElysiumSyncResult = { ...emptyResult(dryRun), since, until };
    const shopId = project.shop_id;

    try {
        const [rows, sourceTotal] = await Promise.all([fetchEventLeads({ since, until }), countEventLeads()]);
        result.sourceTotal = sourceTotal;
        result.read = rows.length;
        const done = await processedSourceIds(db, rows.map((row) => row.id));
        const pending = rows.filter((row) => !done.has(row.id))
            .sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at) || a.id.localeCompare(b.id));
        const batch = dryRun ? pending : pending.slice(0, ELYSIUM_MAX_ROWS_PER_RUN);
        result.pending = pending.length;
        result.remaining = pending.length - batch.length;

        const ledger: LedgerRow[] = [];
        const failedRows: EventLeadRow[] = [];
        if (batch.length) {
            // 1) Түлхүүрээр (түүхэн импорт эсвэл өмнөх ажиллалт) аль хэдийн орсон лидүүд.
            const byKey = new Map<string, CandidateLeadRow & { project_id: string | null; client_request_id: string }>();
            for (const part of chunks(batch.map((row) => row.id))) {
                const { data, error } = await db.from('leads').select(LEAD_COLUMNS).eq('shop_id', shopId).in('client_request_id', part);
                if (error) throw new ElysiumSyncError('CRM-ийн лидийг шалгаж чадсангүй.');
                for (const lead of (data || []) as Array<CandidateLeadRow & { project_id: string | null; client_request_id: string }>) byKey.set(lead.client_request_id, lead);
            }

            // 2) Давхардлын нэр дэвшигчид: ижил төсөл, цонхон дахь лид (устгасан ч орно).
            const times = batch.map((row) => Date.parse(row.created_at));
            const from = new Date(Math.min(...times) - ELYSIUM_MATCH_WINDOW.importedBeforeMs).toISOString();
            const to = new Date(Math.max(...times) + ELYSIUM_MATCH_WINDOW.afterMs).toISOString();
            const nearby = await fetchAllRows<CandidateLeadRow>((start, end) => db.from('leads').select(LEAD_COLUMNS)
                .eq('shop_id', shopId).eq('project_id', project.id).gte('created_at', from).lte('created_at', to)
                .order('created_at', { ascending: true }).order('id', { ascending: true }).range(start, end))
                .catch(() => { throw new ElysiumSyncError('CRM-ийн лидийг шалгаж чадсангүй.'); });
            const importedIds = new Set<string>();
            for (const part of chunks(nearby.map((lead) => lead.id))) {
                const { data, error } = await db.from('external_lead_imports').select('lead_id')
                    .eq('source', SOURCE).eq('outcome', 'imported').in('lead_id', part);
                if (error) throw new ElysiumSyncError('Тулгалтын бүртгэл уншигдсангүй.');
                for (const row of (data || []) as Array<{ lead_id: string }>) importedIds.add(row.lead_id);
            }
            const candidates = new Map<string, LeadCandidate>(nearby.map((lead) => [lead.id, toCandidate(lead, importedIds.has(lead.id))]));

            const record = (row: EventLeadRow, outcome: ElysiumOutcome, leadId: string | null, detail: string | null = null) => {
                const name = row.name?.trim().slice(0, 255) || null;
                ledger.push({
                    source: SOURCE, source_id: row.id, shop_id: shopId, project_id: project.id, lead_id: outcome === 'invalid' ? null : leadId,
                    outcome, source_name: name, source_created_at: row.created_at, detail: detail?.slice(0, 500) ?? null,
                });
                result[outcome]++;
                if (result.sample.length < 20) result.sample.push({ sourceId: row.id, createdAt: row.created_at, name, outcome, detail });
            };

            for (const row of batch) {
                const keyed = byKey.get(row.id);
                if (keyed) {
                    if ((keyed.project_id ?? null) !== project.id) { record(row, 'invalid', null, KEY_CONFLICT); continue; }
                    const known = candidates.get(keyed.id);
                    if (known) known.imported = true;
                    else candidates.set(keyed.id, toCandidate(keyed, true));
                    record(row, 'imported', keyed.id);
                    continue;
                }

                const lead = normalizeEventLead(row);
                if (!lead.ok) { record(row, 'invalid', null, lead.detail); continue; }

                const match = findMatchingLead(lead, [...candidates.values()]);
                if (match) {
                    let detail: string | null = match.deleted ? 'Устгасан лидтэй таарсан' : null;
                    if (!match.deleted && !submissionRecorded([match.notes], lead)) {
                        const content = dryRun ? elysiumRepeatInquiryText(lead, match) : await logRepeatInquiry(db, {
                            shopId, lead: match, submission: lead, meta: { source_id: row.id, submitted_at: row.created_at },
                        });
                        if (content) {
                            result.repeats++;
                            detail = 'Дахин хүсэлтийг лидийн түүхэнд нэмсэн';
                            // Багц доторх ижил агуулгатай дараагийн мөрийг давтахгүй.
                            match.notes = [match.notes, content].filter(Boolean).join('\n\n');
                        }
                    }
                    record(row, 'matched', match.id, detail);
                    continue;
                }

                if (dryRun) {
                    // Багц доторх дахин оролдлогын мөр энэ «шинэ» лидтэй тохирно.
                    candidates.set(`dry:${row.id}`, toCandidate({ id: `dry:${row.id}`, customer_phone: lead.phone, customer_email: lead.email, notes: lead.notes, created_at: row.created_at }, true));
                    record(row, 'imported', null);
                    continue;
                }

                const inserted = await insertLeadOnce(db, {
                    shop_id: shopId,
                    project_id: project.id,
                    client_request_id: row.id,
                    customer_name: lead.name,
                    customer_phone: lead.phone,
                    customer_email: lead.email,
                    source: ELYSIUM_LEAD_SOURCE,
                    notes: lead.notes,
                    // Elysium-д ирсэн бодит цаг: хариу өгөх хугацаа, сарын тайлан зөв байна.
                    created_at: row.created_at,
                    updated_at: row.created_at,
                    stage_changed_at: row.created_at,
                }, { select: LEAD_COLUMNS });
                if (inserted.ok) {
                    const saved = inserted.lead as unknown as CandidateLeadRow;
                    if (!inserted.duplicate) {
                        await logLeadActivity(db, {
                            shopId, leadId: saved.id, type: 'system', content: ELYSIUM_IMPORT_NOTE,
                            meta: { source: SOURCE, kind: 'import', source_id: row.id, submitted_at: row.created_at },
                            createdByName: ELYSIUM_ACTOR_NAME,
                        });
                    }
                    candidates.set(saved.id, toCandidate(saved, true));
                    record(row, 'imported', saved.id);
                } else if (inserted.conflict) {
                    record(row, 'invalid', null, KEY_CONFLICT);
                } else if (permanentInsertError(inserted.error?.code)) {
                    record(row, 'invalid', null, `Лид хадгалах боломжгүй (${inserted.error.code})`);
                } else {
                    failedRows.push(row);
                    result.failed++;
                    if (result.sample.length < 20) result.sample.push({ sourceId: row.id, createdAt: row.created_at, name: lead.name, outcome: 'failed', detail: null });
                    logger.warn('[Elysium sync] lead insert failed', { sourceId: row.id, code: inserted.error?.code ?? null });
                }
            }
        }

        if (dryRun) return result;

        for (const part of chunks(ledger)) {
            const { error } = await db.from('external_lead_imports').upsert(part, { onConflict: 'source,source_id', ignoreDuplicates: true });
            if (error) throw new ElysiumSyncError('Тулгалтын бүртгэл хадгалагдсангүй. Дараагийн ажиллалт дахин шалгана.');
        }

        // Cursor: амжилтгүй эсвэл хязгаараас үлдсэн хамгийн эрт мөрийн өмнө, эс бөгөөс цонхны дээд хил.
        const unfinished = [...failedRows.map((row) => Date.parse(row.created_at))];
        if (result.remaining > 0) unfinished.push(Date.parse(pending[batch.length].created_at));
        const cursor = unfinished.length ? new Date(Math.min(...unfinished) - 1).toISOString() : until;
        result.status = result.failed ? 'partial' : 'ok';
        await recordState(db, {
            started, shopId, projectId: project.id, cursor,
            error: result.failed ? `${result.failed} хүсэлт хадгалагдсангүй; дараагийн ажиллалт дахин оролдоно.` : null,
            result: summary(result, options.trigger),
        });
        logger.info('[Elysium sync] done', { trigger: options.trigger, read: result.read, imported: result.imported, matched: result.matched, invalid: result.invalid, failed: result.failed });
        return result;
    } catch (error) {
        const message = error instanceof ElysiumSyncError || error instanceof ElysiumSourceError
            ? error.message : 'Elysium лид татахад алдаа гарлаа.';
        if (!(error instanceof ElysiumSyncError || error instanceof ElysiumSourceError)) {
            logger.error('[Elysium sync] failed', { message: error instanceof Error ? error.message : 'unknown' });
        }
        if (!dryRun) {
            await recordState(db, {
                started, shopId, projectId: project.id, cursor: null, error: message,
                result: { ...summary(result, options.trigger), aborted: true },
            }).catch(() => undefined);
        }
        throw error instanceof ElysiumSyncError ? error : new ElysiumSyncError(message, 502);
    }
}

function summary(result: ElysiumSyncResult, trigger: ElysiumSyncTrigger): Record<string, unknown> {
    return {
        trigger, since: result.since, until: result.until, sourceTotal: result.sourceTotal, read: result.read, pending: result.pending,
        imported: result.imported, matched: result.matched, invalid: result.invalid, failed: result.failed,
        remaining: result.remaining, repeats: result.repeats,
    };
}

/**
 * Дамжуулалтын хамгаалалт: татан авалт хүсэлтийг оруулсны дараа зочин дахин илгээж амжилттай
 * болбол шинэ лид үүсгэхгүй. Сүүлийн 72 цагт татаж оруулсан, ижил утас/и-мэйлтэй лидийг
 * буцааж, шинэ агуулгыг «дахин хүсэлт»-ээр нэмнэ. Ижил requestId аль хэдийн хадгалагдсан бол
 * null (insertLeadOnce давтан хариу өгнө). Алдаа гарвал null — дамжуулалт лид алдахгүй.
 */
export async function findImportedElysiumDuplicate(db: SupabaseClient, input: {
    shopId: string;
    projectId: string;
    requestId: string;
    phone?: string | null;
    email?: string | null;
    message?: string | null;
    event?: string | null;
    notes: string | null;
    now?: Date;
}): Promise<{ leadId: string } | null> {
    try {
        const nowMs = (input.now ?? new Date()).getTime();
        const { data: imports, error } = await db.from('external_lead_imports').select('lead_id')
            .eq('source', SOURCE).eq('shop_id', input.shopId).eq('outcome', 'imported').not('lead_id', 'is', null)
            .gte('source_created_at', new Date(nowMs - ELYSIUM_MATCH_WINDOW.importedBeforeMs).toISOString())
            .limit(500);
        if (error) {
            logger.warn('[Elysium push] import guard unavailable', { code: error.code ?? null });
            return null;
        }
        const ids = [...new Set(((imports || []) as Array<{ lead_id: string | null }>).map((row) => row.lead_id).filter((id): id is string => !!id))];
        if (!ids.length) return null;

        const { data: replay, error: replayError } = await db.from('leads').select('id')
            .eq('shop_id', input.shopId).eq('client_request_id', input.requestId).maybeSingle();
        if (replayError || replay) return null;

        const { data: leads, error: leadError } = await db.from('leads').select(LEAD_COLUMNS)
            .eq('shop_id', input.shopId).eq('project_id', input.projectId).in('id', ids);
        if (leadError) return null;
        const match = findMatchingLead(
            { key: contactKey(input.phone, input.email), createdAtMs: nowMs },
            ((leads || []) as CandidateLeadRow[]).map((lead) => toCandidate(lead, true)),
        );
        if (!match) return null;
        const submission = {
            message: input.message?.trim() || null, event: input.event?.trim() || null, notes: input.notes,
            phone: input.phone?.trim() || null, email: input.email?.trim() || null,
        };
        if (!match.deleted && !submissionRecorded([match.notes], submission)) {
            await logRepeatInquiry(db, { shopId: input.shopId, lead: match, submission, meta: { request_id: input.requestId } });
        }
        return { leadId: match.id };
    } catch (error) {
        logger.warn('[Elysium push] import guard failed', { message: error instanceof Error ? error.message : 'unknown' });
        return null;
    }
}

export interface ElysiumLedgerEntry {
    source_id: string;
    outcome: ElysiumOutcome;
    lead_id: string | null;
    source_name: string | null;
    source_created_at: string;
    detail: string | null;
    processed_at: string;
}

export interface ElysiumSyncStatus {
    config: { pushConfigured: boolean; pullConfigured: boolean };
    project: { id: string; name: string | null } | null;
    /** Migration суусан эсэх (хүснэгт уншигдсан). */
    storageReady: boolean;
    state: {
        enabled: boolean;
        cursor_at: string | null;
        last_attempt_at: string | null;
        last_success_at: string | null;
        last_error: string | null;
        last_result: Record<string, unknown>;
        updated_at: string | null;
    } | null;
    totals: Record<ElysiumOutcome, number> | null;
    recent: ElysiumLedgerEntry[];
    invalid: ElysiumLedgerEntry[];
    settleMinutes: number;
}

const LEDGER_COLUMNS = 'source_id, outcome, lead_id, source_name, source_created_at, detail, processed_at';

/** Админы «Холболтууд» хуудасны төлөв: тохиргоо, сүүлийн ажиллалт, ledger-ийн нийлбэр ба сүүлийн мөрүүд. */
export async function elysiumSyncStatus(db: SupabaseClient): Promise<ElysiumSyncStatus> {
    const config = elysiumConfig();
    const status: ElysiumSyncStatus = {
        config: { pushConfigured: config.pushConfigured, pullConfigured: config.pullConfigured },
        project: null, storageReady: false, state: null, totals: null, recent: [], invalid: [],
        settleMinutes: ELYSIUM_SETTLE_MS / 60_000,
    };
    if (config.projectId) {
        const { data } = await db.from('projects').select('id, name').eq('id', config.projectId).maybeSingle();
        status.project = (data as { id: string; name: string | null } | null) ?? null;
    }
    const { data: state, error: stateError } = await db.from('external_lead_sync')
        .select('enabled, cursor_at, last_attempt_at, last_success_at, last_error, last_result, updated_at')
        .eq('source', SOURCE).maybeSingle();
    if (stateError) return status;
    status.storageReady = true;
    status.state = (state as ElysiumSyncStatus['state']) ?? null;

    const count = async (outcome: ElysiumOutcome) => {
        const { count: value, error } = await db.from('external_lead_imports').select('source_id', { count: 'exact', head: true })
            .eq('source', SOURCE).eq('outcome', outcome);
        if (error) throw new ElysiumSyncError('Тулгалтын бүртгэл уншигдсангүй.');
        return value ?? 0;
    };
    const [imported, matched, invalid, recent, invalidRows] = await Promise.all([
        count('imported'), count('matched'), count('invalid'),
        db.from('external_lead_imports').select(LEDGER_COLUMNS).eq('source', SOURCE)
            .order('processed_at', { ascending: false }).order('source_created_at', { ascending: false }).limit(20),
        db.from('external_lead_imports').select(LEDGER_COLUMNS).eq('source', SOURCE).eq('outcome', 'invalid')
            .order('source_created_at', { ascending: false }).limit(100),
    ]);
    if (recent.error || invalidRows.error) throw new ElysiumSyncError('Тулгалтын бүртгэл уншигдсангүй.');
    status.totals = { imported, matched, invalid };
    status.recent = (recent.data || []) as ElysiumLedgerEntry[];
    status.invalid = (invalidRows.data || []) as ElysiumLedgerEntry[];
    return status;
}

/** Cron-ын автомат татах асаах/унтраах. Тохиргоо дутуу үед асаахгүй. */
export async function setElysiumSyncEnabled(db: SupabaseClient, enabled: boolean, actorId: string): Promise<{ enabled: boolean }> {
    if (enabled && !elysiumConfig().pullConfigured) {
        throw new ElysiumSyncError('Эхлээд ELYSIUM_SUPABASE_URL, ELYSIUM_SUPABASE_SERVICE_KEY, ELYSIUM_LEAD_PROJECT_ID-г тохируулна уу.', 409);
    }
    const { data, error } = await db.from('external_lead_sync')
        .upsert({ source: SOURCE, enabled, updated_by: actorId, updated_at: new Date().toISOString() }, { onConflict: 'source' })
        .select('enabled').single();
    if (error || !data) throw new ElysiumSyncError('Тохиргоо хадгалагдсангүй (migration 20261004164000 суулгасан эсэхийг шалгана уу).');
    return { enabled: (data as { enabled: boolean }).enabled };
}

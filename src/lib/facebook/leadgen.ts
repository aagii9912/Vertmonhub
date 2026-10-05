/**
 * Facebook Lead Ads → `leads`. Meta-гийн Page webhook (`/api/webhook`-ийн `entry.changes[field=leadgen]`)
 * болон 90 хоногийн backfill (`/{form_id}/leads`) хоёулаа энд бичнэ: Page → shop, кампанийн
 * холбоос (`marketing_campaigns`) → төсөл, холбоосгүй бол shop-ийн ганц төсөл (shop = төсөл).
 * `client_request_id`-г leadgen_id-аас гаргадаг тул Meta-ийн давтан илгээлт, backfill давхар лид
 * үүсгэхгүй. Шинэ үр дүн бүрийг `meta_leadgen_events`-д leadgen_id-аар тэмдэглэнэ (хувийн мэдээлэлгүй).
 *
 * Үр дүн: `saved` — лид хадгалагдсан; `skipped` — дахин оролдоод нэмэргүй (Page холбоогүй, токен,
 * эрх, лид олдохгүй) тул Meta-д 200 буцааж тэмдэглэнэ, тохиргоог зассаны дараа backfill нөхнө;
 * `failed` — түр зуурын (Graph, DB, хугацаа) тул webhook non-200 буцааж Meta-аар дахин илгээлгэнэ.
 */
import { createHash } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { decryptToken } from '@/lib/crypto/tokens';
import { appsecretProof } from '@/lib/facebook/messenger';
import { logAttributionEvent } from '@/lib/marketing/attribution-events';
import { soleShopProjectId } from '@/lib/projects/shop-project';
import { insertLeadOnce } from '@/lib/services/LeadService';
import { logger } from '@/lib/utils/logger';

export const LEADGEN_GRAPH = 'https://graph.facebook.com/v26.0';
export const LEAD_FIELDS = 'id,created_time,field_data,campaign_id,adset_id,ad_id,form_id';
const GRAPH_TIMEOUT_MS = 10_000;

export type LeadgenSkipReason =
    | 'invalid_payload' | 'page_not_connected' | 'token_missing' | 'app_secret_missing'
    | 'token_invalid' | 'permission_missing' | 'not_found' | 'graph_error' | 'lead_rejected';
export type LeadgenFailReason = 'graph_unavailable' | 'db_error' | 'time_budget';

export type LeadgenOutcome =
    | { status: 'saved'; duplicate: boolean; leadId: string | null }
    | { status: 'skipped'; reason: LeadgenSkipReason }
    | { status: 'failed'; reason: LeadgenFailReason };

export interface LeadgenSummary {
    received: number;
    ingested: number;
    duplicate: number;
    skipped: number;
    failed: number;
    reasons: Partial<Record<LeadgenSkipReason | LeadgenFailReason, number>>;
}

export const emptySummary = (): LeadgenSummary => ({ received: 0, ingested: 0, duplicate: 0, skipped: 0, failed: 0, reasons: {} });

export function tally(summary: LeadgenSummary, outcome: LeadgenOutcome): void {
    summary.received++;
    if (outcome.status === 'saved') {
        if (outcome.duplicate) summary.duplicate++;
        else summary.ingested++;
        return;
    }
    summary[outcome.status]++;
    summary.reasons[outcome.reason] = (summary.reasons[outcome.reason] ?? 0) + 1;
}

// ============ Graph (Page токен) ============

export type GraphFailure = { ok: false; transient: boolean; reason: LeadgenSkipReason | 'graph_unavailable' };
export type GraphResult<T> = { ok: true; data: T } | GraphFailure;

const TRANSIENT_CODES = new Set([1, 2, 4, 17, 32, 341, 613]);

export function classifyGraphError(status: number, code: number | undefined, isTransient: boolean): GraphFailure {
    if (isTransient || status >= 500 || status === 429 || (code !== undefined && (TRANSIENT_CODES.has(code) || (code >= 80000 && code < 80100)))) {
        return { ok: false, transient: true, reason: 'graph_unavailable' };
    }
    if (code === 190 || code === 102) return { ok: false, transient: false, reason: 'token_invalid' };
    if (code === 3 || code === 10 || (code !== undefined && code >= 200 && code < 300)) return { ok: false, transient: false, reason: 'permission_missing' };
    if (code === 100) return { ok: false, transient: false, reason: 'not_found' };
    return { ok: false, transient: false, reason: 'graph_error' };
}

/**
 * Page токеноор Graph v26 унших. Токен URL-д биш Authorization header-т, `appsecret_proof` заавал
 * (FACEBOOK_APP_SECRET-гүй бол дуудахгүй). URL, токен, хариуг логлохгүй.
 */
export async function pageGraphRead<T>(path: string, token: string, params: Record<string, string> = {}, signal?: AbortSignal): Promise<GraphResult<T>> {
    const proof = appsecretProof(token);
    if (!proof) return { ok: false, transient: false, reason: 'app_secret_missing' };
    const url = new URL(`${LEADGEN_GRAPH}/${path}`);
    for (const [key, value] of Object.entries({ ...params, appsecret_proof: proof })) url.searchParams.set(key, value);
    let response: Response;
    try {
        response = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store', signal: signal ?? AbortSignal.timeout(GRAPH_TIMEOUT_MS) });
    } catch {
        return { ok: false, transient: true, reason: 'graph_unavailable' };
    }
    const body = await response.json().catch(() => null);
    if (response.ok && body && !body.error) return { ok: true, data: body as T };
    const code = Number(body?.error?.code);
    return classifyGraphError(response.status, Number.isFinite(code) ? code : undefined, body?.error?.is_transient === true);
}

// ============ Lead ============

interface LeadFieldDatum { name?: string; values?: unknown[] }

export interface MetaLead {
    id: string;
    created_time?: string;
    field_data?: LeadFieldDatum[];
    campaign_id?: string;
    adset_id?: string;
    ad_id?: string;
    form_id?: string;
}

const META_ID = /^\d{1,30}$/;
const metaId = (value: unknown): string | null => {
    const text = typeof value === 'number' ? String(value) : value;
    return typeof text === 'string' && META_ID.test(text) ? text : null;
};

/** Meta нэг lead-ийг дахин илгээхэд ижил `client_request_id` (UUID хэлбэрт оруулсан hash) өгнө. */
export function leadgenRequestId(leadgenId: string): string {
    const hex = createHash('sha256').update(`facebook-leadgen:${leadgenId}`).digest('hex');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

const NOTE_LIMIT = 2000;

/** Формын field_data → нэр, утас, имэйл; бусад асуултын хариу тэмдэглэлд (хэмжээ хязгаартай). */
export function mapLeadFields(fieldData: LeadFieldDatum[] | undefined): { name: string | null; phone: string | null; email: string | null; notes: string | null } {
    let fullName: string | null = null, first: string | null = null, last: string | null = null;
    let phone: string | null = null, email: string | null = null;
    const extra: string[] = [];
    for (const field of (Array.isArray(fieldData) ? fieldData : []).slice(0, 50)) {
        const key = (field?.name || '').toLowerCase();
        const value = (Array.isArray(field?.values) ? field.values : [])
            .filter((v): v is string => typeof v === 'string').map(v => v.trim()).filter(Boolean).join(', ').slice(0, 500);
        if (!key || !value) continue;
        if (key === 'full_name' || key === 'name') fullName ??= value;
        else if (key === 'first_name') first ??= value;
        else if (key === 'last_name') last ??= value;
        else if (key.includes('phone')) phone ??= value;
        else if (key.includes('email')) email ??= value;
        else extra.push(`${field.name}: ${value}`);
    }
    const name = fullName ?? ([first, last].filter(Boolean).join(' ') || null);
    const notes = extra.length ? `Lead Ads форм:\n${extra.join('\n')}`.slice(0, NOTE_LIMIT) : null;
    return { name, phone, email, notes };
}

function createdAt(value: unknown): string | null {
    if (typeof value !== 'string' && typeof value !== 'number') return null;
    const ms = typeof value === 'number' ? value * 1000 : Date.parse(value);
    if (!Number.isFinite(ms) || ms > Date.now() + 5 * 60_000) return null;
    return new Date(ms).toISOString();
}

/** Кампанийн холбоосын төсөл, байхгүй бол shop-ийн ганц төсөл; аль нь ч үгүй бол null. DB алдаа throw. */
export async function leadgenProjectId(db: SupabaseClient, shopId: string, campaignId: string | null): Promise<string | null> {
    if (campaignId) {
        const { data, error } = await db.from('marketing_campaigns').select('project_id')
            .eq('shop_id', shopId).eq('external_campaign_id', campaignId).maybeSingle();
        if (error) throw error;
        if (data?.project_id) return data.project_id as string;
    }
    return soleShopProjectId(db, shopId);
}

export interface LeadgenContext {
    pageId: string;
    origin: 'webhook' | 'backfill';
}

/** Graph-аас татсан нэг lead-ийг хадгалж, үр дүнг тэмдэглэнэ (давхардлыг тэмдэглэхгүй). */
export async function saveMetaLead(db: SupabaseClient, shopId: string, lead: MetaLead, context: LeadgenContext): Promise<LeadgenOutcome> {
    const campaignId = metaId(lead.campaign_id);
    let outcome: LeadgenOutcome;
    try {
        const projectId = await leadgenProjectId(db, shopId, campaignId);
        const { name, phone, email, notes } = mapLeadFields(lead.field_data);
        const created = createdAt(lead.created_time);
        const saved = await insertLeadOnce(db, {
            shop_id: shopId,
            project_id: projectId,
            client_request_id: leadgenRequestId(lead.id),
            customer_name: name || 'Facebook lead',
            customer_phone: phone,
            customer_email: email,
            notes,
            source: 'facebook_ads',
            facebook_campaign_id: campaignId,
            facebook_adset_id: metaId(lead.adset_id),
            facebook_ad_id: metaId(lead.ad_id),
            ...(created ? { created_at: created } : {}),
        }, { select: 'id, project_id' });
        if (saved.ok) {
            outcome = { status: 'saved', duplicate: saved.duplicate, leadId: saved.lead.id as string };
            if (!saved.duplicate) {
                await logAttributionEvent({ shopId, leadId: saved.lead.id as string, eventType: 'lead', source: 'facebook_ads', facebook_campaign_id: campaignId });
            }
        } else if (saved.conflict) {
            // Өөр төсөлтэйгээр аль хэдийн хадгалагдсан — дахин бичихгүй.
            outcome = { status: 'saved', duplicate: true, leadId: null };
        } else {
            // 22xxx/23xxx = өгөгдөл/constraint (дахин оролдоод нэмэргүй), бусад нь түр зуурын.
            const permanent = /^2[23]/.test(saved.error.code ?? '');
            logger.error('[Leadgen] lead insert failed', { leadgenId: lead.id, shopId, code: saved.error.code, message: saved.error.message });
            outcome = permanent ? { status: 'skipped', reason: 'lead_rejected' } : { status: 'failed', reason: 'db_error' };
        }
    } catch (error) {
        logger.error('[Leadgen] project lookup failed', { leadgenId: lead.id, shopId, error: error instanceof Error ? error.message : String(error) });
        outcome = { status: 'failed', reason: 'db_error' };
    }
    if (!(outcome.status === 'saved' && outcome.duplicate)) {
        await recordLeadgenEvent(db, { leadgenId: lead.id, shopId, campaignId, formId: metaId(lead.form_id), adId: metaId(lead.ad_id), createdTime: lead.created_time }, context, outcome);
    }
    return outcome;
}

interface EventFacts {
    leadgenId: string;
    shopId: string | null;
    campaignId?: string | null;
    formId?: string | null;
    adId?: string | null;
    createdTime?: unknown;
}

/** `meta_leadgen_events`-д leadgen_id бүрийн сүүлийн үр дүн. Бичиж чадаагүй бол зөвхөн лог. */
export async function recordLeadgenEvent(db: SupabaseClient, facts: EventFacts, context: LeadgenContext, outcome: LeadgenOutcome): Promise<void> {
    const row = {
        leadgen_id: facts.leadgenId,
        page_id: context.pageId,
        shop_id: facts.shopId,
        lead_id: outcome.status === 'saved' ? outcome.leadId : null,
        form_id: facts.formId ?? null,
        ad_id: facts.adId ?? null,
        campaign_id: facts.campaignId ?? null,
        status: outcome.status,
        reason: outcome.status === 'saved' ? null : outcome.reason,
        origin: context.origin,
        lead_created_at: createdAt(facts.createdTime),
        updated_at: new Date().toISOString(),
    };
    const level = outcome.status === 'saved' ? 'info' : 'warn';
    logger[level]('[Leadgen] event', { leadgenId: row.leadgen_id, pageId: row.page_id, shopId: row.shop_id, status: row.status, reason: row.reason, origin: row.origin });
    try {
        const { error } = await db.from('meta_leadgen_events').upsert(row, { onConflict: 'leadgen_id' });
        if (error) logger.warn('[Leadgen] event not recorded', { leadgenId: row.leadgen_id, code: error.code, message: error.message });
    } catch (error) {
        logger.warn('[Leadgen] event not recorded', { leadgenId: row.leadgen_id, error: error instanceof Error ? error.message : String(error) });
    }
}

// ============ Webhook ============

export interface LeadgenRef {
    leadgenId: string;
    pageId: string;
    formId: string | null;
    adId: string | null;
    createdTime: unknown;
}

/** Webhook body-гоос `field: 'leadgen'` өөрчлөлтүүд; ID-гүй/буруу өөрчлөлтийг `invalid`-д тоолно. */
export function leadgenRefs(body: unknown): { refs: LeadgenRef[]; invalid: number } {
    const refs: LeadgenRef[] = [];
    let invalid = 0;
    const entries = (body as { entry?: unknown })?.entry;
    for (const entry of Array.isArray(entries) ? entries : []) {
        const changes = (entry as { changes?: unknown })?.changes;
        for (const change of Array.isArray(changes) ? changes : []) {
            if ((change as { field?: unknown })?.field !== 'leadgen') continue;
            const value = ((change as { value?: unknown }).value ?? {}) as Record<string, unknown>;
            const leadgenId = metaId(value.leadgen_id);
            const pageId = metaId(value.page_id) ?? metaId((entry as { id?: unknown }).id);
            if (!leadgenId || !pageId) { invalid++; continue; }
            refs.push({ leadgenId, pageId, formId: metaId(value.form_id), adId: metaId(value.ad_id), createdTime: value.created_time });
        }
    }
    return { refs, invalid };
}

export function hasLeadgenChanges(body: unknown): boolean {
    const { refs, invalid } = leadgenRefs(body);
    return refs.length + invalid > 0;
}

interface PageShop { id: string; facebook_page_access_token: string | null }

/** Webhook-ийн нэг leadgen өөрчлөлт: давхардлыг Graph-аас өмнө таслаад, lead-ийг татаж хадгална. */
async function ingestRef(db: SupabaseClient, ref: LeadgenRef, shops: Map<string, Promise<{ shop: PageShop | null; error: boolean }>>, deadline: number): Promise<LeadgenOutcome> {
    const context: LeadgenContext = { pageId: ref.pageId, origin: 'webhook' };
    const facts: EventFacts = { leadgenId: ref.leadgenId, shopId: null, formId: ref.formId, adId: ref.adId, createdTime: ref.createdTime };
    const finish = async (outcome: LeadgenOutcome) => { await recordLeadgenEvent(db, facts, context, outcome); return outcome; };

    if (!shops.has(ref.pageId)) {
        shops.set(ref.pageId, Promise.resolve(db.from('shops').select('id, facebook_page_access_token')
            .eq('facebook_page_id', ref.pageId).eq('is_active', true).maybeSingle<PageShop>())
            .then(({ data, error }) => ({ shop: data ?? null, error: !!error })));
    }
    const { shop, error } = await shops.get(ref.pageId)!;
    if (error) return finish({ status: 'failed', reason: 'db_error' });
    if (!shop) return finish({ status: 'skipped', reason: 'page_not_connected' });
    facts.shopId = shop.id;

    // Meta-ийн давтан илгээлт (эсвэл backfill аль хэдийн татсан) — Graph-аас дахин татахгүй.
    const prior = await db.from('leads').select('id').eq('shop_id', shop.id).eq('client_request_id', leadgenRequestId(ref.leadgenId)).maybeSingle();
    if (prior.error) return finish({ status: 'failed', reason: 'db_error' });
    if (prior.data) return { status: 'saved', duplicate: true, leadId: prior.data.id as string };

    const token = decryptToken(shop.facebook_page_access_token);
    if (!token) return finish({ status: 'skipped', reason: 'token_missing' });
    const remaining = deadline - Date.now();
    if (remaining < 1000) return { status: 'failed', reason: 'time_budget' };
    const lead = await pageGraphRead<MetaLead>(ref.leadgenId, token, { fields: LEAD_FIELDS }, AbortSignal.timeout(Math.min(GRAPH_TIMEOUT_MS, remaining)));
    if (!lead.ok) {
        return finish(lead.transient || lead.reason === 'graph_unavailable'
            ? { status: 'failed', reason: 'graph_unavailable' }
            : { status: 'skipped', reason: lead.reason as LeadgenSkipReason });
    }
    if (lead.data.id !== ref.leadgenId) return finish({ status: 'skipped', reason: 'graph_error' });
    return saveMetaLead(db, shop.id, { form_id: ref.formId ?? undefined, ad_id: ref.adId ?? undefined, ...lead.data }, context);
}

/**
 * Webhook body дахь бүх leadgen өөрчлөлтийг дарааллаар боловсруулна. `deadline`-аас хэтэрсэн нь
 * `failed/time_budget` — webhook non-200 буцааж Meta дахин илгээнэ (давхардал таслагдана).
 */
export async function ingestLeadgenWebhook(db: SupabaseClient, body: unknown, deadline: number): Promise<LeadgenSummary> {
    const summary = emptySummary();
    const { refs, invalid } = leadgenRefs(body);
    for (let i = 0; i < invalid; i++) tally(summary, { status: 'skipped', reason: 'invalid_payload' });
    if (invalid) logger.warn('[Leadgen] invalid leadgen change skipped', { invalid });
    const shops = new Map<string, Promise<{ shop: PageShop | null; error: boolean }>>();
    for (const ref of refs) {
        const outcome = Date.now() >= deadline ? { status: 'failed', reason: 'time_budget' } as const : await ingestRef(db, ref, shops, deadline);
        tally(summary, outcome);
    }
    logger.info('[Leadgen] webhook batch', { ...summary });
    return summary;
}

/**
 * CustomerScoringService — харилцагчийн чанарын оноо, lifecycle шат, сегментийг тооцоолно.
 *
 * `computeScore` нь цэвэр функц (тест хийхэд хялбар). `recomputeShopScores` /
 * `recomputeCustomerScore` нь өгөгдлийг цуглуулж DB-д хадгална.
 */

import { supabaseAdmin } from '@/lib/supabase';
import { logger } from '@/lib/utils/logger';
import {
    SCORE_MAX,
    RECENCY_BUCKETS,
    ENGAGEMENT_BUCKETS,
    ENGAGEMENT_MAX_POINTS,
    FUNNEL_POINTS,
    TIER_THRESHOLDS,
    DORMANT_AFTER_DAYS,
    type LifecycleStage,
    type QualityTier,
    type Temperature,
} from '@/lib/config/scoring';

export interface ScoringSignals {
    createdAt: string;
    lastContactAt?: string | null;
    messageCount?: number;
    aiMemory?: Record<string, unknown> | null;
    tags?: string[];
    leads: Array<{ status: string; budget_max?: number | null; urgency?: string | null }>;
    viewings: Array<{ status: string; interest_level?: number | null }>;
}

export interface ScoreResult {
    score: number;
    tier: QualityTier;
    stage: LifecycleStage;
    temperature: Temperature;
    breakdown: {
        recency: number;
        engagement: number;
        funnel: number;
        viewing: number;
        intent: number;
        temperature: Temperature;
        tier: QualityTier;
    };
}

function daysSince(date?: string | null): number {
    if (!date) return Infinity;
    const ms = Date.now() - new Date(date).getTime();
    if (Number.isNaN(ms)) return Infinity;
    return ms / (1000 * 60 * 60 * 24);
}

function recencyPoints(days: number): number {
    for (const bucket of RECENCY_BUCKETS) {
        if (days <= bucket.maxDays) return bucket.points;
    }
    return 0;
}

function engagementPoints(messageCount: number): number {
    for (const bucket of ENGAGEMENT_BUCKETS) {
        if (messageCount <= bucket.maxCount) return bucket.points;
    }
    return ENGAGEMENT_MAX_POINTS;
}

/**
 * Lead статусуудаас хамгийн ахисан funnel оноог буцаана (closed_lost-ыг тоохгүй).
 */
function bestFunnelPoints(leads: ScoringSignals['leads']): number {
    let best = 0;
    for (const lead of leads) {
        const pts = FUNNEL_POINTS[lead.status] ?? 0;
        if (pts > best) best = pts;
    }
    return best;
}

function viewingPoints(viewings: ScoringSignals['viewings']): number {
    const completed = viewings.filter(v => v.status === 'completed').length;
    const scheduled = viewings.filter(v => v.status === 'scheduled').length;
    const maxInterest = viewings.reduce((m, v) => Math.max(m, v.interest_level || 0), 0);

    let pts = 0;
    if (completed > 0) pts += 8;
    else if (scheduled > 0) pts += 4;

    if (maxInterest >= 4) pts += 7;
    else if (maxInterest === 3) pts += 4;
    else if (maxInterest > 0) pts += 1;

    return Math.min(pts, SCORE_MAX.viewing);
}

function intentPoints(signals: ScoringSignals): number {
    let pts = 0;
    const mem = signals.aiMemory || {};
    const memKeys = Object.keys(mem).filter(k => k !== 'last_updated');
    if (memKeys.some(k => /budget|rooms|district|type|size/i.test(k))) pts += 4;

    const tags = signals.tags || [];
    if (tags.some(t => /^(budget:|interest:|stage:hot)/i.test(t))) pts += 3;

    if (signals.leads.some(l => l.urgency === 'urgent')) pts += 3;
    if (signals.leads.some(l => typeof l.budget_max === 'number' && (l.budget_max || 0) > 0)) pts += 2;

    return Math.min(pts, SCORE_MAX.intent);
}

function deriveStage(signals: ScoringSignals, recencyDays: number): LifecycleStage {
    const statuses = signals.leads.map(l => l.status);
    const hasWon = statuses.includes('closed_won');
    const hasLeads = statuses.length > 0;
    const allLost = hasLeads && statuses.every(s => s === 'closed_lost');
    const best = bestFunnelPoints(signals.leads);

    let stage: LifecycleStage;
    if (hasWon) {
        stage = 'won';
    } else if (allLost) {
        stage = 'lost';
    } else if (statuses.includes('offered') || statuses.includes('negotiating')) {
        stage = 'negotiating';
    } else if (
        statuses.includes('viewing_scheduled') ||
        signals.viewings.some(v => v.status === 'completed' || v.status === 'scheduled')
    ) {
        stage = 'viewing';
    } else if (statuses.includes('contacted') || best > 0 || hasLeads) {
        stage = 'qualified';
    } else if ((signals.messageCount || 0) > 0 || signals.lastContactAt) {
        stage = 'engaged';
    } else {
        stage = 'prospect';
    }

    // Идэвхгүй болсон бол dormant (won/lost-оос бусад)
    if (stage !== 'won' && stage !== 'lost' && recencyDays > DORMANT_AFTER_DAYS) {
        stage = 'dormant';
    }

    return stage;
}

function deriveTier(score: number): QualityTier {
    if (score >= TIER_THRESHOLDS.A) return 'A';
    if (score >= TIER_THRESHOLDS.B) return 'B';
    return 'C';
}

function deriveTemperature(stage: LifecycleStage, score: number, recencyDays: number): Temperature {
    if (stage === 'dormant') return 'dormant';
    if (stage === 'won' || stage === 'lost') return 'nurturing';
    if (score >= 65 && recencyDays <= 14) return 'hot';
    return 'nurturing';
}

/**
 * Цэвэр тооцоолол — өгсөн дохиоллоос оноо/шат/сегмент гаргана.
 */
export function computeScore(signals: ScoringSignals): ScoreResult {
    const recencyDays = daysSince(signals.lastContactAt ?? signals.createdAt);

    const recency = recencyPoints(recencyDays);
    const engagement = engagementPoints(signals.messageCount || 0);
    const funnel = bestFunnelPoints(signals.leads);
    const viewing = viewingPoints(signals.viewings);
    const intent = intentPoints(signals);

    const score = Math.min(100, recency + engagement + funnel + viewing + intent);
    const stage = deriveStage(signals, recencyDays);
    const tier = deriveTier(score);
    const temperature = deriveTemperature(stage, score, recencyDays);

    return {
        score,
        tier,
        stage,
        temperature,
        breakdown: { recency, engagement, funnel, viewing, intent, temperature, tier },
    };
}

// ============================================
// DB-backed recompute
// ============================================

type CustomerRow = {
    id: string;
    created_at: string;
    last_contact_at: string | null;
    message_count: number | null;
    ai_memory: Record<string, unknown> | null;
    tags: string[] | null;
};

async function persistScore(
    supabase: ReturnType<typeof supabaseAdmin>,
    customerId: string,
    result: ScoreResult
) {
    await supabase
        .from('customers')
        .update({
            quality_score: result.score,
            quality_tier: result.tier,
            lifecycle_stage: result.stage,
            score_breakdown: result.breakdown,
            last_scored_at: new Date().toISOString(),
        })
        .eq('id', customerId);
}

/**
 * Shop доторх бүх харилцагчийн оноог дахин тооцоолно.
 */
export async function recomputeShopScores(shopId: string): Promise<{ updated: number }> {
    const supabase = supabaseAdmin();

    const [{ data: customers }, { data: leads }] = await Promise.all([
        supabase
            .from('customers')
            .select('id, created_at, last_contact_at, message_count, ai_memory, tags')
            .eq('shop_id', shopId),
        supabase
            .from('leads')
            .select('id, customer_id, status, budget_max, urgency')
            .eq('shop_id', shopId),
    ]);

    const customerRows = (customers || []) as CustomerRow[];
    const leadRows = (leads || []) as Array<{ id: string; customer_id: string | null; status: string; budget_max: number | null; urgency: string | null }>;

    // lead_id → customer_id зураглал (viewings-ийг харилцагчтай холбоход)
    const leadToCustomer = new Map<string, string>();
    const leadsByCustomer = new Map<string, typeof leadRows>();
    for (const lead of leadRows) {
        if (lead.customer_id) {
            leadToCustomer.set(lead.id, lead.customer_id);
            const arr = leadsByCustomer.get(lead.customer_id) || [];
            arr.push(lead);
            leadsByCustomer.set(lead.customer_id, arr);
        }
    }

    // Энэ shop-ийн lead-үүдийн viewings-ийг авч харилцагчаар бүлэглэнэ
    const viewingsByCustomer = new Map<string, Array<{ status: string; interest_level: number | null }>>();
    const leadIds = leadRows.map(l => l.id);
    if (leadIds.length > 0) {
        const { data: viewings } = await supabase
            .from('property_viewings')
            .select('lead_id, status, interest_level')
            .in('lead_id', leadIds);
        for (const v of viewings || []) {
            const customerId = v.lead_id ? leadToCustomer.get(v.lead_id) : undefined;
            if (!customerId) continue;
            const arr = viewingsByCustomer.get(customerId) || [];
            arr.push({ status: v.status, interest_level: v.interest_level });
            viewingsByCustomer.set(customerId, arr);
        }
    }

    let updated = 0;
    // Багцлан шинэчилнэ (нэг дор хэт олон холболт үүсгэхгүй)
    const CHUNK = 25;
    for (let i = 0; i < customerRows.length; i += CHUNK) {
        const chunk = customerRows.slice(i, i + CHUNK);
        await Promise.all(chunk.map(async (c) => {
            const result = computeScore({
                createdAt: c.created_at,
                lastContactAt: c.last_contact_at,
                messageCount: c.message_count || 0,
                aiMemory: c.ai_memory,
                tags: c.tags || [],
                leads: (leadsByCustomer.get(c.id) || []).map(l => ({
                    status: l.status,
                    budget_max: l.budget_max,
                    urgency: l.urgency,
                })),
                viewings: viewingsByCustomer.get(c.id) || [],
            });
            await persistScore(supabase, c.id, result);
            updated++;
        }));
    }

    logger.info('[Scoring] recomputed shop scores', { shopId, updated });
    return { updated };
}

/**
 * Нэг харилцагчийн оноог дахин тооцоолно (чухал үйл явдлын дараа).
 */
export async function recomputeCustomerScore(customerId: string): Promise<ScoreResult | null> {
    const supabase = supabaseAdmin();

    const { data: customer } = await supabase
        .from('customers')
        .select('id, created_at, last_contact_at, message_count, ai_memory, tags')
        .eq('id', customerId)
        .single();

    if (!customer) return null;

    const { data: leads } = await supabase
        .from('leads')
        .select('id, status, budget_max, urgency')
        .eq('customer_id', customerId);

    const leadIds = (leads || []).map(l => l.id);
    let viewings: Array<{ status: string; interest_level: number | null }> = [];
    if (leadIds.length > 0) {
        const { data: v } = await supabase
            .from('property_viewings')
            .select('status, interest_level')
            .in('lead_id', leadIds);
        viewings = (v || []).map(x => ({ status: x.status, interest_level: x.interest_level }));
    }

    const result = computeScore({
        createdAt: customer.created_at,
        lastContactAt: customer.last_contact_at,
        messageCount: customer.message_count || 0,
        aiMemory: customer.ai_memory,
        tags: customer.tags || [],
        leads: (leads || []).map(l => ({ status: l.status, budget_max: l.budget_max, urgency: l.urgency })),
        viewings,
    });

    await persistScore(supabase, customerId, result);
    return result;
}

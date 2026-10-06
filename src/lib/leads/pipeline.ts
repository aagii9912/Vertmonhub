/**
 * Лидийн pipeline (/dashboard/leads/pipeline): шат, магадлал, «зогссон» / «дараагийн алхамгүй» дүрэм
 * ба шат бүрийн нэгтгэл. Самбарын карт (browser) болон бүх лидийн тоолол
 * (`GET /api/dashboard/leads/pipeline-summary`) хоёулаа энэ нэг дүрмийг хэрэглэнэ.
 *
 * «Дүн» = лидийн төсвийн дундаж (budget_min/max) — гэрээний үнэ биш, зөвхөн таамагт.
 */
import type { LeadStatus } from '@/types/property';

export interface PipelineStageRule {
    key: LeadStatus;
    /** closed_won-руу хүрэх магадлал (жинлэсэн таамаг) */
    probability: number;
    /** энэ шатанд хэдэн хоног зогсвол «зогссон» гэж үзэх (0 = шалгахгүй) */
    stalledDays: number;
}

export const PIPELINE_STAGE_RULES: readonly PipelineStageRule[] = [
    { key: 'new', probability: 0.1, stalledDays: 3 },
    { key: 'contacted', probability: 0.2, stalledDays: 5 },
    { key: 'viewing_scheduled', probability: 0.4, stalledDays: 7 },
    { key: 'offered', probability: 0.6, stalledDays: 7 },
    { key: 'negotiating', probability: 0.8, stalledDays: 10 },
    { key: 'closed_won', probability: 1, stalledDays: 0 },
    { key: 'closed_lost', probability: 0, stalledDays: 0 },
];

const RULES = new Map<string, PipelineStageRule>(PIPELINE_STAGE_RULES.map(rule => [rule.key, rule]));
const DAY_MS = 86_400_000;

export interface PipelineLead {
    status: string;
    budget_min: number | string | null;
    budget_max: number | string | null;
    next_followup_at: string | null;
    stage_changed_at: string | null;
    created_at: string;
}

export const isClosedStatus = (status: string) => status === 'closed_won' || status === 'closed_lost';

/** Лидийн төлөөлөл утга (төсвийн дундаж) — таамагт ашиглана. */
export function leadValue(lead: Pick<PipelineLead, 'budget_min' | 'budget_max'>): number {
    const min = Number(lead.budget_min) || 0;
    const max = Number(lead.budget_max) || 0;
    return min && max ? (min + max) / 2 : min || max;
}

/** Одоогийн шатанд хэдэн хоног болсон (stage_changed_at, эс бөгөөс created_at). */
export function daysInStage(lead: Pick<PipelineLead, 'stage_changed_at' | 'created_at'>, now: number): number {
    const ts = lead.stage_changed_at || lead.created_at;
    if (!ts) return 0;
    return Math.floor((now - new Date(ts).getTime()) / DAY_MS);
}

export function isStalled(lead: Pick<PipelineLead, 'status' | 'stage_changed_at' | 'created_at'>, now: number): boolean {
    if (isClosedStatus(lead.status)) return false;
    const threshold = RULES.get(lead.status)?.stalledDays || 0;
    return threshold > 0 && daysInStage(lead, now) >= threshold;
}

export const isOverdue = (lead: Pick<PipelineLead, 'status' | 'next_followup_at'>, now: number): boolean =>
    !!lead.next_followup_at && !isClosedStatus(lead.status) && new Date(lead.next_followup_at).getTime() < now;

export const noNextStep = (lead: Pick<PipelineLead, 'status' | 'next_followup_at'>): boolean =>
    !lead.next_followup_at && !isClosedStatus(lead.status);

export interface PipelineStageSummary {
    status: LeadStatus;
    count: number;
    /** Шатны лидийн төсвийн дундажийн нийлбэр. */
    value: number;
    stalled: number;
    noNextStep: number;
}

/** Шат бүр PIPELINE_STAGE_RULES-ийн дарааллаар; самбарт байхгүй төлөвтэй лид тоологдохгүй. */
export interface PipelineSummary { stages: PipelineStageSummary[] }

function tally(stages: PipelineStageSummary[], lead: PipelineLead, now: number, sign: 1 | -1) {
    const stage = stages.find(s => s.status === lead.status);
    if (!stage) return;
    stage.count = Math.max(0, stage.count + sign);
    stage.value = Math.max(0, stage.value + sign * leadValue(lead));
    if (isStalled(lead, now)) stage.stalled = Math.max(0, stage.stalled + sign);
    if (noNextStep(lead)) stage.noNextStep = Math.max(0, stage.noNextStep + sign);
}

export function buildPipelineSummary(leads: readonly PipelineLead[], now: number): PipelineSummary {
    const stages = PIPELINE_STAGE_RULES.map(rule => ({ status: rule.key, count: 0, value: 0, stalled: 0, noNextStep: 0 }));
    for (const lead of leads) tally(stages, lead, now, 1);
    return { stages };
}

/** Карт зөөхөд нэгтгэлийг серверийн хариу хүлээлгүй засна: хуучин төлвөөс хасаж, шинэд нэмнэ. */
export function movePipelineLead(summary: PipelineSummary, before: PipelineLead, after: PipelineLead, now: number): PipelineSummary {
    const stages = summary.stages.map(stage => ({ ...stage }));
    tally(stages, before, now, -1);
    tally(stages, after, now, 1);
    return { ...summary, stages };
}

export interface PipelineTotals {
    total: number;
    /** Хаагдаагүй лидийн дүн. */
    openValue: number;
    /** Хаагдаагүй дүн × шатны магадлал. */
    weightedForecast: number;
    wonValue: number;
    stalled: number;
    noNextStep: number;
}

export function pipelineTotals(summary: PipelineSummary): PipelineTotals {
    const totals: PipelineTotals = { total: 0, openValue: 0, weightedForecast: 0, wonValue: 0, stalled: 0, noNextStep: 0 };
    for (const stage of summary.stages) {
        totals.total += stage.count;
        totals.stalled += stage.stalled;
        totals.noNextStep += stage.noNextStep;
        if (stage.status === 'closed_won') totals.wonValue += stage.value;
        else if (!isClosedStatus(stage.status)) {
            totals.openValue += stage.value;
            totals.weightedForecast += stage.value * (RULES.get(stage.status)?.probability || 0);
        }
    }
    return totals;
}

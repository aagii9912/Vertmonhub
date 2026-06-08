/**
 * Харилцагчийн чанарын скорингийн тохиргоо.
 * Жинг энд төвлөрүүлж, hard-code хийхгүй — ирээдүйд тохируулахад хялбар.
 * Дэд онооны дээд нийлбэр = 100.
 */

export type LifecycleStage =
    | 'prospect'
    | 'engaged'
    | 'qualified'
    | 'viewing'
    | 'negotiating'
    | 'won'
    | 'lost'
    | 'dormant';

export type QualityTier = 'A' | 'B' | 'C';
export type Temperature = 'hot' | 'nurturing' | 'dormant';

// Дэд онооны дээд хязгаар (нийлбэр 100)
export const SCORE_MAX = {
    recency: 25,
    engagement: 20,
    funnel: 30,
    viewing: 15,
    intent: 10,
} as const;

// Сүүлийн холбоо барьснаас хойших хоног → recency оноо
export const RECENCY_BUCKETS: Array<{ maxDays: number; points: number }> = [
    { maxDays: 3, points: 25 },
    { maxDays: 7, points: 22 },
    { maxDays: 14, points: 18 },
    { maxDays: 30, points: 12 },
    { maxDays: 60, points: 6 },
    { maxDays: 120, points: 2 },
];

// Мессежний тоо → engagement оноо
export const ENGAGEMENT_BUCKETS: Array<{ maxCount: number; points: number }> = [
    { maxCount: 0, points: 0 },
    { maxCount: 2, points: 5 },
    { maxCount: 5, points: 10 },
    { maxCount: 15, points: 15 },
];
export const ENGAGEMENT_MAX_POINTS = 20; // 15-аас дээш мессеж

// Lead-ийн статус → funnel оноо (closed_lost = 0)
export const FUNNEL_POINTS: Record<string, number> = {
    new: 6,
    contacted: 12,
    viewing_scheduled: 18,
    offered: 24,
    negotiating: 28,
    closed_won: 30,
    closed_lost: 0,
};

// Tier босгууд
export const TIER_THRESHOLDS = { A: 70, B: 40 } as const;

// Идэвхгүй (dormant) гэж үзэх хоног
export const DORMANT_AFTER_DAYS = 60;

// Автомат дагалт: энэ оноо ба түүнээс дээш харилцагчдыг "чанартай" гэж үзнэ
export const FOLLOWUP_MIN_SCORE = 55;
// Сүүлийн холбооноос хойш энэ хоног өнгөрсөн бол дагаж холбогдохыг сануулна
export const FOLLOWUP_QUIET_DAYS = 14;
// Дараагийн дагалтын огноог хэдэн хоногийн дараа товлох
export const FOLLOWUP_SNOOZE_DAYS = 3;

/**
 * Маркетингийн бичилтүүд — зарцуулалт, сарын төсөв, зах зээлийн үзүүлэлт.
 * API route ба AI tool хоёулаа энд дамжина.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { SPEND_CHANNELS } from '@/lib/marketing/budget';

export function isMissingMarketingTable(error: { code?: string; message?: string } | null): boolean {
    if (!error) return false;
    return error.code === '42P01' || /marketing_budgets|marketing_spend_entries|market_indicators/i.test(error.message || '');
}
export const MARKETING_MIGRATION_HINT = 'Төсвийн хүснэгтүүд үүсээгүй байна — 20260721140000_marketing_budget_indicators.sql миграцийг ажиллуулна уу';

export async function logMarketingSpend(db: SupabaseClient, shopId: string, userId: string | null, d: { spentAt: string; amount: number; channel?: string; note?: string | null }) {
    return db.from('marketing_spend_entries').insert({
        shop_id: shopId, spent_at: d.spentAt, amount: d.amount,
        channel: d.channel && SPEND_CHANNELS[d.channel] ? d.channel : 'other', note: d.note?.trim() || null, created_by: userId,
    }).select('id, spent_at, amount, channel, note, created_at').single();
}

export async function upsertMarketingBudget(db: SupabaseClient, shopId: string, year: number, months: Array<{ month: number; amount: number }>) {
    const rows = months.map((m) => ({ shop_id: shopId, year, month: m.month, amount: m.amount }));
    return db.from('marketing_budgets').upsert(rows, { onConflict: 'shop_id,year,month' });
}

export async function addMarketIndicator(db: SupabaseClient, shopId: string, d: { category?: string; name: string; value: string; note?: string | null; sourceUrl?: string | null; recordedAt?: string | null }) {
    const category = ['mortgage', 'bank', 'macro', 'other'].includes(d.category || '') ? d.category : 'mortgage';
    return db.from('market_indicators').insert({
        shop_id: shopId, category, name: d.name, value: d.value, note: d.note?.trim() || null, source_url: d.sourceUrl || null,
        recorded_at: d.recordedAt || new Date().toISOString().slice(0, 10),
    }).select('id, category, name, value, note, source_url, recorded_at').single();
}

export async function listMarketingSpend(db: SupabaseClient, shopId: string, year: number, month?: number) {
    let q = db.from('marketing_spend_entries').select('id, spent_at, amount, channel, note').eq('shop_id', shopId).is('deleted_at', null)
        .gte('spent_at', `${year}-01-01`).lte('spent_at', `${year}-12-31`).order('spent_at', { ascending: false }).limit(200);
    if (month) { const mm = String(month).padStart(2, '0'); q = q.gte('spent_at', `${year}-${mm}-01`).lte('spent_at', `${year}-${mm}-31`); }
    return q;
}

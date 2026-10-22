import { pricingKey, type PricingRule } from './pricing';

/** Only activated versions (active/archived) are listed; drafts never reach the price sheet. */
export interface PricingVersionSummary {
    id: string; version: number; status: 'active' | 'archived';
    source: string; valid_from: string | null; valid_until: string | null;
    activated_at: string; activated_by: string | null;
    /** The next activation's time; null while the version is still active. */
    archived_at: string | null;
}

export type PricingValidity = 'valid' | 'upcoming' | 'expired';
export type PricingRuleChange = 'same' | 'added' | 'changed';

export interface PricingRuleDiff {
    rule: PricingRule;
    /** null = no earlier activated version to compare with. */
    change: PricingRuleChange | null;
    previous: Pick<PricingRule, 'price_per_sqm' | 'advance_percent'> | null;
}

export interface PricingSheetVersion extends PricingVersionSummary {
    validity: PricingValidity;
    previous_version: number | null;
    rows: PricingRuleDiff[];
    removed: PricingRule[];
}

export interface PricingSheet {
    as_of: string;
    history: PricingVersionSummary[];
    selected: PricingSheetVersion | null;
}

/** Same window as `calculatePricing`: outside it no quote is calculated. */
export function pricingValidity(config: { valid_from: string | null; valid_until: string | null }, asOf: string): PricingValidity {
    if (config.valid_from && asOf < config.valid_from) return 'upcoming';
    if (!config.valid_from || !config.valid_until || asOf > config.valid_until) return 'expired';
    return 'valid';
}

const ruleKey = (rule: PricingRule) => [pricingKey(rule.block), pricingKey(rule.model), pricingKey(rule.payment_condition), rule.floor_min, rule.floor_max].join('|');
const compareText = (left: string, right: string) => pricingKey(left).localeCompare(pricingKey(right), 'mn', { numeric: true });

/** Block → model → floors; conditions keep the order the admin entered. */
export function sortPricingRules(rules: readonly PricingRule[]): PricingRule[] {
    return [...rules].sort((a, b) => compareText(a.block, b.block) || compareText(a.model, b.model)
        || a.floor_min - b.floor_min || a.floor_max - b.floor_max);
}

/** A rule matches only the same block, model, condition and floor range; a moved range shows as added + removed. */
export function diffPricingRules(rules: readonly PricingRule[], previous: readonly PricingRule[] | null): { rows: PricingRuleDiff[]; removed: PricingRule[] } {
    const earlier = new Map((previous ?? []).map(rule => [ruleKey(rule), rule]));
    const rows = sortPricingRules(rules).map((rule): PricingRuleDiff => {
        if (!previous) return { rule, change: null, previous: null };
        const match = earlier.get(ruleKey(rule));
        if (!match) return { rule, change: 'added', previous: null };
        const same = match.price_per_sqm === rule.price_per_sqm && match.advance_percent === rule.advance_percent;
        return { rule, change: same ? 'same' : 'changed', previous: { price_per_sqm: match.price_per_sqm, advance_percent: match.advance_percent } };
    });
    const current = new Set(rules.map(ruleKey));
    return { rows, removed: sortPricingRules((previous ?? []).filter(rule => !current.has(ruleKey(rule)))) };
}

/** History rows sorted newest first: an archived version was replaced by the next newer activation. */
export function withArchiveTimes<T extends { status: string; created_at: string }>(rows: readonly T[]): Array<T & { archived_at: string | null }> {
    return rows.map((row, index) => ({ ...row, archived_at: row.status === 'archived' && index > 0 ? rows[index - 1].created_at : null }));
}

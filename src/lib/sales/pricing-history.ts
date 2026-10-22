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

export interface PricingSheetGroup { block: string; model: string; floor_min: number; floor_max: number; cells: Record<string, PricingRuleDiff> }
export interface PricingSheetCondition { key: string; label: string; /** One advance for every row of the condition, else 'mixed' (shown per cell). */ advance_percent: number | null | 'mixed' }
export interface PricingSheetTable { blocks: string[]; conditions: PricingSheetCondition[]; groups: PricingSheetGroup[] }

/** The price-list layout: one row per block × model × floors, one column per payment condition. */
export function pivotPricingRows(rows: readonly PricingRuleDiff[]): PricingSheetTable {
    const conditions = new Map<string, PricingSheetCondition>();
    const groups = new Map<string, PricingSheetGroup>();
    const blocks = new Map<string, string>();
    for (const row of rows) {
        const { rule } = row, key = pricingKey(rule.payment_condition);
        const condition = conditions.get(key);
        if (!condition) conditions.set(key, { key, label: rule.payment_condition, advance_percent: rule.advance_percent });
        else if (condition.advance_percent !== rule.advance_percent) condition.advance_percent = 'mixed';
        if (!blocks.has(pricingKey(rule.block))) blocks.set(pricingKey(rule.block), rule.block);
        const groupKey = [pricingKey(rule.block), pricingKey(rule.model), rule.floor_min, rule.floor_max].join('|');
        const group = groups.get(groupKey) ?? { block: rule.block, model: rule.model, floor_min: rule.floor_min, floor_max: rule.floor_max, cells: {} };
        group.cells[key] = row;
        groups.set(groupKey, group);
    }
    // A list price («Ашиглалтад орсны дараа») first, then percent conditions in numeric order.
    const ordered = [...conditions.values()].sort((a, b) => Number(/^\d/.test(a.label)) - Number(/^\d/.test(b.label))
        || (/^\d/.test(a.label) ? a.label.localeCompare(b.label, 'en', { numeric: true }) : 0));
    return { blocks: [...blocks.values()], conditions: ordered, groups: [...groups.values()] };
}

/**
 * Plan-based feature limits
 * 
 * DEPRECATED MOCK DATA REMOVED
 * Now uses database-driven plans via /api/features endpoint
 * 
 * These functions are kept for backward compatibility but now delegate
 * to the useFeatures hook or make API calls when needed.
 */

/**
 * @deprecated Use useFeatures().limits.max_shops instead
 * This is a client-side only check that returns a default.
 * The actual limits come from the database via /api/features
 */
export function canAddShop(maxShops: number | undefined, currentShopCount: number): boolean {
    // -1 means unlimited
    if (maxShops === -1 || maxShops === undefined) return true;
    return currentShopCount < maxShops;
}

/**
 * @deprecated Use useFeatures().hasFeature('instagram') instead
 * Instagram access is determined by plan features in the database
 */
export function canUseInstagram(planSlug: string | null | undefined): boolean {
    // Pro and above plans have Instagram access
    const proPlans = ['pro', 'professional', 'ultimate', 'enterprise'];
    return proPlans.includes(planSlug?.toLowerCase() || '');
}

/**
 * Helper to check if plan is paid (not free/trial)
 */
export function isPaidPlan(planSlug: string | null | undefined): boolean {
    const freePlans = ['free', 'trial', ''];
    return !freePlans.includes(planSlug?.toLowerCase() || '');
}

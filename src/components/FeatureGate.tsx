/**
 * FeatureGate Component - Conditionally render content based on plan features
 */

'use client';

import { ReactNode } from 'react';
import { useFeatures, Features } from '@/hooks/useFeatures';
import { UpgradePrompt } from './UpgradePrompt';

interface FeatureGateProps {
    /** The feature key to check */
    feature: keyof Features;
    /** Content to render if feature is enabled */
    children: ReactNode;
    /** Optional custom fallback (defaults to UpgradePrompt) */
    fallback?: ReactNode;
    /** If true, don't show anything when feature is disabled */
    hideWhenDisabled?: boolean;
    /** Required feature value for string features like 'full' or 'advanced' */
    requiredValue?: string;
}

/**
 * Wraps content that should only be visible/accessible for certain plan tiers
 * 
 * @example
 * // Basic usage - check if feature is enabled
 * <FeatureGate feature="payment_integration">
 *   <PaymentSettings />
 * </FeatureGate>
 * 
 * @example
 * // With custom fallback
 * <FeatureGate feature="bulk_marketing" fallback={<LockedBadge />}>
 *   <MarketingTools />
 * </FeatureGate>
 * 
 * @example
 * // Check for specific value (e.g., 'full' cart system)
 * <FeatureGate feature="cart_system" requiredValue="full">
 *   <AdvancedCartFeatures />
 * </FeatureGate>
 */
export function FeatureGate({
    feature,
    children,
    fallback,
    hideWhenDisabled = false,
    requiredValue
}: FeatureGateProps) {
    const { hasFeature, getFeatureValue, isLoading, plan } = useFeatures();

    // While loading, show nothing to prevent flash
    if (isLoading) {
        return null;
    }

    // Check if feature is enabled
    let isEnabled = hasFeature(feature);

    // If a specific value is required, check for it
    if (requiredValue && isEnabled) {
        const currentValue = getFeatureValue(feature);
        isEnabled = currentValue === requiredValue;
    }

    // Feature is enabled - render children
    if (isEnabled) {
        return <>{children}</>;
    }

    // Feature is disabled
    if (hideWhenDisabled) {
        return null;
    }

    // Render fallback or default upgrade prompt
    if (fallback) {
        return <>{fallback}</>;
    }

    return (
        <UpgradePrompt
            feature={feature}
            currentPlan={plan.name}
        />
    );
}

/**
 * Hook-based feature check for programmatic use
 */
export function useFeatureCheck(feature: keyof Features, requiredValue?: string): boolean {
    const { hasFeature, getFeatureValue, isLoading } = useFeatures();

    if (isLoading) return false;

    let isEnabled = hasFeature(feature);

    if (requiredValue && isEnabled) {
        const currentValue = getFeatureValue(feature);
        isEnabled = currentValue === requiredValue;
    }

    return isEnabled;
}

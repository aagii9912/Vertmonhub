/**
 * Features API - Get current shop's enabled features and limits
 */

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getAuthUser } from '@/lib/auth/auth';
import { headers } from 'next/headers';
import { logger } from '@/lib/utils/logger';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET() {
    try {
        const userId = await getAuthUser();

        if (!userId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // Check for x-shop-id in headers (for multi-shop support)
        const headerList = await headers();
        const requestedShopId = headerList.get('x-shop-id');

        // Build query for shop
        let query = supabase
            .from('shops')
            .select(`
                id,
                plan_id,
                subscription_plan,
                enabled_features,
                limit_overrides,
                plans (
                    id,
                    slug,
                    name,
                    features,
                    limits
                )
            `)
            .eq('user_id', userId); // Use user_id, not clerk_user_id

        // If specific shop requested, use it
        if (requestedShopId) {
            query = query.eq('id', requestedShopId);
        }

        const { data: shops, error: shopError } = await query.limit(1);
        const shop = shops?.[0] || null;

        // DEBUG: Log what we got from the database
        logger.debug('[Features API] shop:', { shopId: shop?.id, planId: shop?.plan_id, subscriptionPlan: shop?.subscription_plan });

        if (shopError || !shop) {
            // Return default free features if no shop found
            return NextResponse.json({
                features: {
                    ai_enabled: true,
                    ai_model: 'gpt-4o-mini',
                    sales_intelligence: false,
                    ai_memory: false,
                    cart_system: 'none',
                    payment_integration: false,
                    crm_analytics: 'none',
                    auto_tagging: false,
                    appointment_booking: false,
                    bulk_marketing: false,
                    excel_export: false,
                    custom_branding: false,
                    comment_reply: false,
                    priority_support: false
                },
                limits: {
                    max_messages: 50,
                    max_shops: 1,
                    max_products: 10,
                    max_customers: 50
                },
                plan: {
                    slug: 'free',
                    name: 'Free'
                }
            });
        }

        // Try to get plan from joined data, or lookup by subscription_plan field
        let planData = shop.plans as any;

        // If no plan_id but subscription_plan exists, lookup the plan
        if (!planData && shop.subscription_plan) {
            const { data: planBySlug } = await supabase
                .from('plans')
                .select('id, slug, name, features, limits')
                .eq('slug', shop.subscription_plan)
                .single();

            if (planBySlug) {
                planData = planBySlug;
            }
        }

        // Default features for paid plans without explicit plan record
        if (!planData) {
            const isPro = shop.subscription_plan === 'pro' || shop.subscription_plan === 'professional';
            const isUltimate = shop.subscription_plan === 'ultimate' || shop.subscription_plan === 'enterprise';
            const isStarter = shop.subscription_plan === 'starter';

            // Default to starter features if subscription_plan is set but no plan record found
            if (isPro || isUltimate || isStarter) {
                planData = {
                    slug: shop.subscription_plan,
                    name: shop.subscription_plan?.charAt(0).toUpperCase() + shop.subscription_plan?.slice(1),
                    features: {
                        ai_enabled: true,
                        ai_model: isPro || isUltimate ? 'gpt-4o' : 'gpt-4o-mini',
                        sales_intelligence: isPro || isUltimate,
                        ai_memory: isPro || isUltimate,
                        cart_system: isPro || isUltimate ? 'full' : 'basic',
                        payment_integration: isPro || isUltimate,
                        crm_analytics: isPro || isUltimate ? 'full' : 'basic',
                        auto_tagging: isPro || isUltimate,
                        appointment_booking: isUltimate,
                        bulk_marketing: isUltimate,
                        excel_export: isPro || isUltimate,
                        custom_branding: isUltimate,
                        comment_reply: isPro || isUltimate,
                        priority_support: isUltimate
                    },
                    limits: {
                        max_messages: isUltimate ? -1 : (isPro ? 5000 : 1000),
                        max_shops: isUltimate ? 5 : (isPro ? 2 : 1),
                        max_products: -1,
                        max_customers: -1
                    }
                };
            }
        }

        // Merge plan features with shop overrides (shop overrides take precedence)
        const planFeatures = planData?.features || {};
        const planLimits = planData?.limits || {};
        const shopOverrides = shop.enabled_features || {};
        const limitOverrides = shop.limit_overrides || {};

        const effectiveFeatures = { ...planFeatures, ...shopOverrides };
        const effectiveLimits = { ...planLimits, ...limitOverrides };

        // Determine plan slug - use planData first, then subscription_plan field, then 'free'
        const planSlug = planData?.slug || shop.subscription_plan || 'free';
        const planName = planData?.name || (shop.subscription_plan ? shop.subscription_plan.charAt(0).toUpperCase() + shop.subscription_plan.slice(1) : 'Free');

        logger.debug('[Features API] Final plan:', { planSlug, hasPlanData: !!planData, subscriptionPlan: shop.subscription_plan });

        return NextResponse.json({
            features: effectiveFeatures,
            limits: effectiveLimits,
            plan: {
                slug: planSlug,
                name: planName
            },
            shopId: shop.id
        });

    } catch (error: unknown) {
        logger.error('Features API error:', { error: error });
        return NextResponse.json(
            { error: 'Failed to fetch features' },
            { status: 500 }
        );
    }
}

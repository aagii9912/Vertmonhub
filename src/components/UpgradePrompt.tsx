/**
 * UpgradePrompt Component - Shows when a feature requires a higher plan
 */

'use client';

import { Lock, Sparkles, ArrowRight } from 'lucide-react';
import Link from 'next/link';
import { Features } from '@/hooks/useFeatures';

interface UpgradePromptProps {
    feature?: keyof Features;
    currentPlan?: string;
    title?: string;
    description?: string;
    compact?: boolean;
}

// Feature display names in Mongolian
const FEATURE_NAMES: Record<keyof Features, string> = {
    ai_enabled: 'AI Туслах',
    ai_model: 'GPT-4o Загвар',
    sales_intelligence: 'Борлуулалтын Ухаан',
    ai_memory: 'AI Санамж',
    cart_system: 'Сагсны Систем',
    payment_integration: 'Төлбөрийн Систем',
    crm_analytics: 'CRM Шинжилгээ',
    auto_tagging: 'Автомат Тагжуулалт',
    appointment_booking: 'Цаг Захиалга',
    bulk_marketing: 'Маркетинг Илгээлт',
    excel_export: 'Excel Татах',
    custom_branding: 'Өөрийн Брэнд',
    comment_reply: 'Коммент Хариулт',
    priority_support: 'VIP Дэмжлэг'
};

// Required plan for each feature
const FEATURE_REQUIRED_PLAN: Record<keyof Features, string> = {
    ai_enabled: 'Free',
    ai_model: 'Pro',
    sales_intelligence: 'Pro',
    ai_memory: 'Pro',
    cart_system: 'Starter',
    payment_integration: 'Pro',
    crm_analytics: 'Starter',
    auto_tagging: 'Pro',
    appointment_booking: 'Ultimate',
    bulk_marketing: 'Ultimate',
    excel_export: 'Starter',
    custom_branding: 'Ultimate',
    comment_reply: 'Starter',
    priority_support: 'Ultimate'
};

export function UpgradePrompt({
    feature,
    currentPlan = 'Free',
    title,
    description,
    compact = false
}: UpgradePromptProps) {
    const featureName = feature ? FEATURE_NAMES[feature] : 'Энэ функц';
    const requiredPlan = feature ? FEATURE_REQUIRED_PLAN[feature] : 'Pro';

    const displayTitle = title || `${featureName} идэвхжүүлэх`;
    const displayDescription = description ||
        `Энэ функцыг ашиглахын тулд ${requiredPlan} багц руу шилжинэ үү.`;

    if (compact) {
        return (
            <div className="inline-flex items-center gap-1.5 px-2 py-1 bg-violet-50 text-violet-700 rounded-lg text-sm">
                <Lock className="w-3.5 h-3.5" />
                <span>{requiredPlan}</span>
            </div>
        );
    }

    return (
        <div className="relative overflow-hidden rounded-2xl border border-violet-100 bg-gradient-to-br from-violet-50 to-purple-50 p-6">
            {/* Background decoration */}
            <div className="absolute -right-8 -top-8 w-32 h-32 bg-violet-200/30 rounded-full blur-2xl" />

            <div className="relative flex flex-col items-center text-center">
                {/* Icon */}
                <div className="w-14 h-14 rounded-full bg-violet-100 flex items-center justify-center mb-4">
                    <Sparkles className="w-7 h-7 text-violet-600" />
                </div>

                {/* Title */}
                <h3 className="text-lg font-semibold text-gray-900 mb-2">
                    {displayTitle}
                </h3>

                {/* Description */}
                <p className="text-sm text-gray-600 mb-4 max-w-sm">
                    {displayDescription}
                </p>

                {/* Current plan badge */}
                <div className="text-xs text-gray-500 mb-4">
                    Одоогийн багц: <span className="font-medium">{currentPlan}</span>
                </div>

                {/* Upgrade button */}
                <Link
                    href="/dashboard/subscription"
                    className="inline-flex items-center gap-2 px-5 py-2.5 bg-violet-600 hover:bg-violet-700 text-white rounded-xl font-medium transition-colors"
                >
                    <span>Багц сонгох</span>
                    <ArrowRight className="w-4 h-4" />
                </Link>
            </div>
        </div>
    );
}

/**
 * Locked Badge - Small inline indicator
 */
export function LockedBadge({ plan = 'Pro' }: { plan?: string }) {
    return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-gray-100 text-gray-500 rounded-full text-xs">
            <Lock className="w-3 h-3" />
            {plan}
        </span>
    );
}

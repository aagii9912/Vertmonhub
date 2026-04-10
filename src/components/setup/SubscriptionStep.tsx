'use client';
import { logger } from '@/lib/utils/logger';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/Button';
import {
    Crown, Rocket, Building2, Sparkles,
    CreditCard, X, Loader2, ArrowRight
} from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';

// Types
interface Plan {
    id: string;
    name: string;
    slug: string;
    description: string | null;
    price_monthly: number | null;
    price_yearly: number | null;
    features: Record<string, unknown> | string[] | null;
    is_featured: boolean;
}

interface SubscriptionStepProps {
    onSkip: () => void;
    onComplete: () => void;
}

// Icon and color mappings
const planIcons: Record<string, React.ComponentType<{ className?: string }>> = {
    starter: Rocket,
    business: Crown,
    enterprise: Building2,
};

const planColors: Record<string, { bg: string; text: string }> = {
    starter: { bg: 'bg-blue-100', text: 'text-blue-600' },
    business: { bg: 'bg-gradient-to-br from-indigo-500 to-purple-500', text: 'text-white' },
    enterprise: { bg: 'bg-orange-100', text: 'text-orange-600' },
};

export function SubscriptionStep({ onSkip, onComplete }: SubscriptionStepProps) {
    const [plans, setPlans] = useState<Plan[]>([]);
    const [loading, setLoading] = useState(true);
    const [billingPeriod, setBillingPeriod] = useState<'monthly' | 'yearly'>('monthly');
    const [selectedPlan, setSelectedPlan] = useState<string | null>(null);
    const [showPaymentModal, setShowPaymentModal] = useState(false);
    const [subscribing, setSubscribing] = useState(false);
    const { t } = useLanguage();

    // Fetch plans
    useEffect(() => {
        const fetchPlans = async () => {
            try {
                const res = await fetch('/api/subscription/plans');
                const data = await res.json();
                setPlans(data.plans || []);
            } catch (err) {
                logger.error('Error fetching plans:', { error: err });
            } finally {
                setLoading(false);
            }
        };
        fetchPlans();
    }, []);

    const formatCurrency = (amount: number) => {
        return new Intl.NumberFormat('mn-MN').format(amount) + '₮';
    };

    const getPlanIcon = (slug: string) => planIcons[slug] || Rocket;
    const getPlanColor = (slug: string) => planColors[slug] || planColors.starter;

    const getFeaturesList = (features: Record<string, unknown> | string[] | null): string[] => {
        if (!features) return [];
        if (Array.isArray(features)) return features;

        const featureLabels: Record<string, { icon: string; label: string; showValue?: boolean }> = {
            ai_enabled: { icon: '🤖', label: t.features.aiEnabled },
            cart_system: { icon: '🛒', label: t.features.cartSystem },
            crm_analytics: { icon: '📊', label: t.features.crmAnalytics },
            max_messages: { icon: '💬', label: t.features.messagesPerMonth, showValue: true },
            max_products: { icon: '📦', label: t.features.productCount, showValue: true },
            priority_support: { icon: '⭐', label: t.features.prioritySupport },
        };

        const featureStrings: string[] = [];
        for (const [key, value] of Object.entries(features)) {
            const config = featureLabels[key];
            if (!config) continue;

            if (value === true) {
                featureStrings.push(`${config.icon} ${config.label}`);
            } else if (typeof value === 'number' && value !== 0 && config.showValue) {
                if (value === -1) {
                    featureStrings.push(`${config.icon} ${t.features.unlimited} ${config.label}`);
                } else {
                    featureStrings.push(`${config.icon} ${value.toLocaleString()} ${config.label}`);
                }
            }
        }
        return featureStrings;
    };

    const handleSelectPlan = (planSlug: string) => {
        setSelectedPlan(planSlug);
        setShowPaymentModal(true);
    };

    const handleSubscribe = async () => {
        if (!selectedPlan) return;
        setSubscribing(true);

        try {
            const res = await fetch('/api/subscription/subscribe', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    planSlug: selectedPlan,
                    billingPeriod
                })
            });

            if (res.ok) {
                onComplete();
            }
        } catch (err) {
            logger.error('Subscription error:', { error: err });
        } finally {
            setSubscribing(false);
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center py-16">
                <Loader2 className="w-8 h-8 animate-spin text-violet-600" />
            </div>
        );
    }

    const filteredPlans = plans.filter(plan => plan.slug !== 'free');
    const selected = plans.find(p => p.slug === selectedPlan);

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="text-center">
                <div className="w-14 h-14 bg-gradient-to-br from-violet-500 to-purple-600 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg shadow-violet-500/30">
                    <CreditCard className="w-7 h-7 text-white" />
                </div>
                <h2 className="text-2xl font-bold text-gray-900">{t.setup.subscription.title}</h2>
                <p className="text-gray-500 mt-2">{t.setup.subscription.subtitle}</p>
            </div>

            {/* Billing Toggle */}
            <div className="flex items-center justify-center gap-4">
                <span className={`text-sm font-medium ${billingPeriod === 'monthly' ? 'text-gray-900' : 'text-gray-500'}`}>
                    {t.setup.subscription.monthly}
                </span>
                <button
                    onClick={() => setBillingPeriod(billingPeriod === 'monthly' ? 'yearly' : 'monthly')}
                    className="relative inline-flex h-6 w-11 items-center rounded-full bg-violet-600 transition-colors"
                >
                    <span
                        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${billingPeriod === 'yearly' ? 'translate-x-6' : 'translate-x-1'
                            }`}
                    />
                </button>
                <span className={`text-sm font-medium ${billingPeriod === 'yearly' ? 'text-gray-900' : 'text-gray-500'}`}>
                    {t.setup.subscription.yearly}
                    <span className="ml-2 text-xs text-green-600 font-semibold">{t.setup.subscription.freeMonths}</span>
                </span>
            </div>

            {/* Plans Grid */}
            <div className="grid grid-cols-1 gap-4">
                {filteredPlans.map((plan) => {
                    const PlanIcon = getPlanIcon(plan.slug);
                    const colors = getPlanColor(plan.slug);
                    const price = billingPeriod === 'monthly' ? plan.price_monthly : plan.price_yearly;
                    const isFeatured = plan.is_featured || plan.slug === 'professional' || plan.slug === 'pro';

                    return (
                        <div
                            key={plan.id}
                            className={`relative rounded-2xl border p-5 transition-all cursor-pointer hover:shadow-md ${isFeatured
                                ? 'border-violet-300 bg-violet-50/50'
                                : 'border-gray-200 bg-white hover:border-gray-300 shadow-sm'
                                }`}
                            onClick={() => handleSelectPlan(plan.slug)}
                        >
                            {isFeatured && (
                                <div className="absolute -top-3 left-4">
                                    <span className="inline-flex items-center gap-1 rounded-full bg-gradient-to-r from-indigo-600 to-purple-600 px-3 py-1 text-xs font-semibold text-white">
                                        <Sparkles className="w-3 h-3" />
                                        {t.setup.subscription.recommended}
                                    </span>
                                </div>
                            )}

                            <div className="flex items-center gap-4">
                                <div className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 ${colors.bg}`}>
                                    <PlanIcon className={`w-6 h-6 ${colors.text}`} />
                                </div>

                                <div className="flex-1 min-w-0">
                                    <h3 className="text-lg font-semibold text-gray-900">{plan.name}</h3>
                                    {plan.description && (
                                        <p className="text-sm text-gray-500 truncate">{plan.description}</p>
                                    )}
                                </div>

                                <div className="text-right flex-shrink-0">
                                    {price ? (
                                        <>
                                            <span className="text-xl font-bold text-gray-900">
                                                {formatCurrency(price)}
                                            </span>
                                            <span className="text-gray-500 text-sm">/{billingPeriod === 'monthly' ? t.setup.subscription.perMonth : t.setup.subscription.perYear}</span>
                                        </>
                                    ) : (
                                        <span className="text-lg font-bold text-gray-900">{t.setup.subscription.contactUs}</span>
                                    )}
                                </div>

                                <ArrowRight className="w-5 h-5 text-gray-400" />
                            </div>

                            {/* Features on hover/expanded */}
                            <div className="mt-3 flex flex-wrap gap-2">
                                {getFeaturesList(plan.features).slice(0, 4).map((feature, idx) => (
                                    <span key={idx} className="text-xs text-gray-600 bg-gray-100 px-2 py-1 rounded-full">
                                        {feature}
                                    </span>
                                ))}
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* Skip Button */}
            <div className="text-center pt-4">
                <button
                    onClick={onSkip}
                    className="text-sm text-gray-500 hover:text-gray-700 transition-colors"
                >
                    {t.setup.subscription.chooseLater}
                </button>
            </div>

            {/* Payment Modal */}
            {showPaymentModal && selected && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
                    <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl animate-in fade-in zoom-in duration-200 border border-gray-100">
                        {/* Header */}
                        <div className="flex items-center justify-between mb-6">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 bg-violet-100 rounded-xl flex items-center justify-center">
                                    <CreditCard className="w-5 h-5 text-violet-600" />
                                </div>
                                <div>
                                    <h3 className="text-lg font-bold text-gray-900">{t.setup.subscription.payment}</h3>
                                    <p className="text-sm text-gray-500">{t.setup.subscription.payViaQPay}</p>
                                </div>
                            </div>
                            <button
                                onClick={() => setShowPaymentModal(false)}
                                className="p-2 hover:bg-gray-100 rounded-full transition-colors"
                            >
                                <X className="w-5 h-5 text-gray-400" />
                            </button>
                        </div>

                        {/* Plan Summary */}
                        <div className="bg-gray-50 p-4 rounded-xl mb-6">
                            <div className="flex justify-between items-center mb-2">
                                <span className="font-medium text-gray-700">{t.setup.subscription.selectedPlan}</span>
                                <span className="font-bold text-violet-700">{selected.name}</span>
                            </div>
                            <div className="flex justify-between items-center mb-2">
                                <span className="text-sm text-gray-600">{t.setup.subscription.duration}</span>
                                <span className="text-sm text-gray-900">
                                    {billingPeriod === 'monthly' ? t.setup.subscription.oneMonth : t.setup.subscription.oneYear}
                                </span>
                            </div>
                            <div className="flex justify-between items-center pt-2 border-t border-gray-200 mt-2">
                                <span className="font-bold text-gray-900">{t.setup.subscription.totalAmount}</span>
                                <span className="font-bold text-xl text-violet-700">
                                    {formatCurrency(
                                        (billingPeriod === 'monthly' ? selected.price_monthly : selected.price_yearly) || 0
                                    )}
                                </span>
                            </div>
                        </div>

                        {/* QR Placeholder */}
                        <div className="text-center mb-6">
                            <p className="text-sm font-medium text-gray-700 mb-3">{t.setup.subscription.scanWithBank}</p>
                            <div className="w-48 h-48 bg-gray-100 rounded-xl mx-auto flex items-center justify-center">
                                <span className="text-gray-400 text-sm">QPay QR</span>
                            </div>
                        </div>

                        {/* Actions */}
                        <div className="flex gap-3">
                            <Button
                                variant="secondary"
                                className="flex-1"
                                onClick={() => setShowPaymentModal(false)}
                            >
                                {t.common.back}
                            </Button>
                            <Button
                                className="flex-1"
                                onClick={handleSubscribe}
                                disabled={subscribing}
                            >
                                {subscribing ? (
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                ) : (
                                    t.setup.subscription.paid
                                )}
                            </Button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

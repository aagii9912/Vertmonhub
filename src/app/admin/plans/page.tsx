'use client';
import { logger } from '@/lib/utils/logger';

import { useEffect, useState } from 'react';
import { Card, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import {
    Plus, Edit2, Trash2, Check, X, GripVertical,
    Loader2, Package
} from 'lucide-react';

interface Plan {
    id: string;
    name: string;
    slug: string;
    description: string;
    price_monthly: number;
    price_yearly: number | null;
    features: Record<string, any>;
    limits: Record<string, any>;
    is_active: boolean;
    is_featured: boolean;
    sort_order: number;
}

export default function PlansPage() {
    const [plans, setPlans] = useState<Plan[]>([]);
    const [loading, setLoading] = useState(true);
    const [editingPlan, setEditingPlan] = useState<Plan | null>(null);
    const [showModal, setShowModal] = useState(false);
    const [saving, setSaving] = useState(false);

    // Form state
    const [formData, setFormData] = useState<{
        name: string;
        slug: string;
        description: string;
        price_monthly: number;
        price_yearly: number;
        is_active: boolean;
        is_featured: boolean;
        features: Record<string, any>;
        limits: Record<string, any>;
    }>({
        name: '',
        slug: '',
        description: '',
        price_monthly: 0,
        price_yearly: 0,
        is_active: true,
        is_featured: false,
        features: {
            messages_per_month: 100,
            shops_limit: 1,
            ai_enabled: true,
            ai_model: 'gpt-4o-mini',
            sales_intelligence: false,
            ai_memory: false,
            cart_system: 'none',
            payment_integration: false,
            crm_analytics: 'basic',
            auto_tagging: false,
            appointment_booking: false,
            bulk_marketing: false,
            excel_export: false,
            custom_branding: false,
            comment_reply: false,
            priority_support: false
        },
        limits: {
            max_messages: 100,
            max_shops: 1,
            max_products: 50,
            max_customers: 100
        }
    });

    useEffect(() => {
        fetchPlans();
    }, []);

    async function fetchPlans() {
        try {
            const res = await fetch('/api/admin/plans');
            if (res.ok) {
                const data = await res.json();
                setPlans(data.plans || []);
            }
        } catch (error: unknown) {
            logger.error('Fetch plans error:', { error: error });
        } finally {
            setLoading(false);
        }
    }

    function openCreateModal() {
        setEditingPlan(null);
        setFormData({
            name: '',
            slug: '',
            description: '',
            price_monthly: 0,
            price_yearly: 0,
            is_active: true,
            is_featured: false,
            features: {
                messages_per_month: 100,
                shops_limit: 1,
                ai_enabled: true,
                ai_model: 'gpt-4o-mini',
                sales_intelligence: false,
                ai_memory: false,
                cart_system: 'none',
                payment_integration: false,
                crm_analytics: 'basic',
                auto_tagging: false,
                appointment_booking: false,
                bulk_marketing: false,
                excel_export: false,
                custom_branding: false,
                comment_reply: false,
                priority_support: false
            },
            limits: {
                max_messages: 100,
                max_shops: 1,
                max_products: 50,
                max_customers: 100
            }
        });
        setShowModal(true);
    }

    function openEditModal(plan: Plan) {
        setEditingPlan(plan);
        setFormData({
            name: plan.name,
            slug: plan.slug,
            description: plan.description || '',
            price_monthly: plan.price_monthly,
            price_yearly: plan.price_yearly || 0,
            is_active: plan.is_active,
            is_featured: plan.is_featured,
            features: plan.features || {},
            limits: plan.limits || {}
        });
        setShowModal(true);
    }

    async function savePlan() {
        setSaving(true);
        try {
            const url = '/api/admin/plans';
            const method = editingPlan ? 'PATCH' : 'POST';
            const body = editingPlan
                ? { id: editingPlan.id, ...formData }
                : formData;

            const res = await fetch(url, {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            });

            if (res.ok) {
                setShowModal(false);
                fetchPlans();
            } else {
                const error = await res.json();
                alert(error.error || 'Failed to save plan');
            }
        } catch (error: unknown) {
            logger.error('Save plan error:', { error: error });
            alert('Failed to save plan');
        } finally {
            setSaving(false);
        }
    }

    async function deletePlan(id: string) {
        if (!confirm('Are you sure you want to delete this plan?')) return;

        try {
            const res = await fetch(`/api/admin/plans?id=${id}`, {
                method: 'DELETE'
            });

            if (res.ok) {
                fetchPlans();
            } else {
                const error = await res.json();
                alert(error.error || 'Failed to delete plan');
            }
        } catch (error: unknown) {
            logger.error('Delete plan error:', { error: error });
        }
    }

    const formatMoney = (amount: number) => `₮${amount.toLocaleString()}`;

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <Loader2 className="w-8 h-8 animate-spin text-violet-600" />
            </div>
        );
    }

    return (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Pricing Plans</h1>
                    <p className="text-sm text-gray-500 mt-1">Manage subscription plans and pricing structures.</p>
                </div>
                <Button onClick={openCreateModal} className="bg-violet-600 hover:bg-violet-700 text-white shadow-sm transition-all sm:w-auto w-full">
                    <Plus className="w-4 h-4 mr-2" />
                    Add Plan
                </Button>
            </div>

            {/* Plans Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                {plans.map((plan) => (
                    <Card key={plan.id} className={`relative border-gray-100 shadow-sm rounded-2xl bg-white overflow-hidden transition-all duration-200 hover:shadow-md ${plan.is_featured ? 'ring-2 ring-violet-500/50 scale-[1.02]' : ''}`}>
                        {plan.is_featured && (
                            <div className="absolute top-0 right-0 px-3 py-1 bg-violet-100 text-violet-700 text-xs font-bold rounded-bl-xl border-b border-l border-violet-100 uppercase tracking-wider">
                                Popular
                            </div>
                        )}
                        <CardContent className="p-6">
                            <div className="flex items-center justify-between mb-4">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 bg-violet-50 rounded-xl flex items-center justify-center">
                                        <Package className="w-5 h-5 text-violet-600" />
                                    </div>
                                    <h3 className="font-bold text-gray-900 text-lg">{plan.name}</h3>
                                </div>
                                <div className="flex items-center gap-1">
                                    <button
                                        onClick={() => openEditModal(plan)}
                                        className="p-1.5 hover:bg-violet-50 hover:text-violet-600 rounded-lg text-gray-400 transition-colors"
                                        title="Edit plan"
                                    >
                                        <Edit2 className="w-4 h-4" />
                                    </button>
                                    <button
                                        onClick={() => deletePlan(plan.id)}
                                        className="p-1.5 hover:bg-red-50 hover:text-red-600 rounded-lg text-gray-400 transition-colors"
                                        title="Delete plan"
                                    >
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                </div>
                            </div>

                            <div className="mb-4">
                                <span className="text-3xl font-bold text-gray-900 tracking-tight">
                                    {plan.price_monthly === 0 ? 'Free' : formatMoney(plan.price_monthly)}
                                </span>
                                {plan.price_monthly > 0 && (
                                    <span className="text-sm font-medium text-gray-500 ml-1">/mo</span>
                                )}
                            </div>

                            <p className="text-sm text-gray-500 mb-6 min-h-[40px] leading-relaxed">{plan.description}</p>

                            <div className="space-y-3 text-sm flex-1">
                                <div className="flex items-start gap-3">
                                    <div className="mt-0.5 bg-green-50 rounded-full p-0.5"><Check className="w-3 h-3 text-green-600" /></div>
                                    <span className="text-gray-600">{plan.features?.messages_per_month === -1 ? 'Unlimited' : plan.features?.messages_per_month} messages/mo</span>
                                </div>
                                <div className="flex items-start gap-3">
                                    <div className="mt-0.5 bg-green-50 rounded-full p-0.5"><Check className="w-3 h-3 text-green-600" /></div>
                                    <span className="text-gray-600">{plan.features?.shops_limit === -1 ? 'Unlimited' : plan.features?.shops_limit} shop(s)</span>
                                </div>
                                {plan.features?.comment_reply && (
                                    <div className="flex items-start gap-3">
                                        <div className="mt-0.5 bg-green-50 rounded-full p-0.5"><Check className="w-3 h-3 text-green-600" /></div>
                                        <span className="text-gray-600">Comment reply</span>
                                    </div>
                                )}
                                {plan.features?.priority_support && (
                                    <div className="flex items-start gap-3">
                                        <div className="mt-0.5 bg-green-50 rounded-full p-0.5"><Check className="w-3 h-3 text-green-600" /></div>
                                        <span className="text-gray-600 font-medium">Priority support</span>
                                    </div>
                                )}
                            </div>

                            <div className="mt-6 pt-5 border-t border-gray-100 flex items-center justify-between text-xs">
                                <span className={`inline-flex items-center px-2 py-1 rounded-md font-medium ${plan.is_active
                                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-100'
                                    : 'bg-gray-50 text-gray-600 border border-gray-200'
                                    }`}>
                                    {plan.is_active ? 'Active Status' : 'Inactive'}
                                </span>
                                <span className="text-gray-400 flex items-center gap-1">
                                    Order: {plan.sort_order}
                                </span>
                            </div>
                        </CardContent>
                    </Card>
                ))}
            </div>

            {/* Modal */}
            {showModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-gray-900/40 backdrop-blur-sm transition-opacity" onClick={() => setShowModal(false)} />

                    <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col relative z-10 animate-in zoom-in-95 duration-200">
                        <div className="flex items-center justify-between p-5 border-b border-gray-100">
                            <div>
                                <h2 className="text-lg font-bold text-gray-900">
                                    {editingPlan ? 'Edit Pricing Plan' : 'Create New Plan'}
                                </h2>
                                <p className="text-xs text-gray-500 mt-1">Configure subscription features and limits</p>
                            </div>
                            <button
                                onClick={() => setShowModal(false)}
                                className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-xl transition-colors"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        <div className="p-6 space-y-8 overflow-y-auto flex-1 custom-scrollbar">
                            {/* Basic Info */}
                            <div className="space-y-4">
                                <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wider border-b border-gray-100 pb-2">Plan Details</h3>
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-sm font-semibold text-gray-700 mb-1.5">Name *</label>
                                        <input
                                            type="text"
                                            value={formData.name}
                                            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                            className="w-full px-3.5 py-2.5 text-sm border border-gray-200 rounded-xl focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500 transition-all outline-none bg-gray-50 focus:bg-white"
                                            placeholder="e.g. Professional"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-semibold text-gray-700 mb-1.5">Slug (Identifier) *</label>
                                        <input
                                            type="text"
                                            value={formData.slug}
                                            onChange={(e) => setFormData({ ...formData, slug: e.target.value })}
                                            className="w-full px-3.5 py-2.5 text-sm border border-gray-200 rounded-xl focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500 transition-all outline-none bg-gray-50 focus:bg-white"
                                            placeholder="e.g. professional-tier"
                                        />
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-sm font-semibold text-gray-700 mb-1.5">Description</label>
                                    <textarea
                                        value={formData.description}
                                        onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                                        className="w-full px-3.5 py-2.5 text-sm border border-gray-200 rounded-xl focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500 transition-all outline-none bg-gray-50 focus:bg-white resize-none"
                                        rows={2}
                                        placeholder="Brief text explaining who this plan is for..."
                                    />
                                </div>
                            </div>

                            {/* Pricing */}
                            <div className="space-y-4">
                                <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wider border-b border-gray-100 pb-2">Pricing</h3>
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-sm font-semibold text-gray-700 mb-1.5">Monthly Price (MNT)</label>
                                        <input
                                            type="number"
                                            value={formData.price_monthly}
                                            onChange={(e) => setFormData({ ...formData, price_monthly: parseInt(e.target.value) || 0 })}
                                            className="w-full px-3.5 py-2.5 text-sm border border-gray-200 rounded-xl focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500 transition-all outline-none bg-gray-50 focus:bg-white"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-semibold text-gray-700 mb-1.5">Yearly Price (MNT)</label>
                                        <input
                                            type="number"
                                            value={formData.price_yearly}
                                            onChange={(e) => setFormData({ ...formData, price_yearly: parseInt(e.target.value) || 0 })}
                                            className="w-full px-3.5 py-2.5 text-sm border border-gray-200 rounded-xl focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500 transition-all outline-none bg-gray-50 focus:bg-white"
                                        />
                                    </div>
                                </div>
                            </div>

                            {/* Limits */}
                            <div className="space-y-4">
                                <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wider border-b border-gray-100 pb-2 flex items-center justify-between">
                                    <span>Usage Limits</span>
                                    <span className="text-[10px] font-normal text-gray-400 normal-case bg-gray-100 px-2 py-0.5 rounded-md">Use -1 for unlimited</span>
                                </h3>
                                <div className="grid grid-cols-2 gap-4 bg-gray-50 rounded-xl p-4 border border-gray-100">
                                    <div>
                                        <label className="text-xs font-semibold text-gray-600 block mb-1.5">Messages / month</label>
                                        <input
                                            type="number"
                                            value={formData.features.messages_per_month}
                                            onChange={(e) => setFormData({
                                                ...formData,
                                                features: { ...formData.features, messages_per_month: parseInt(e.target.value) },
                                                limits: { ...formData.limits, max_messages: parseInt(e.target.value) }
                                            })}
                                            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500 outline-none"
                                        />
                                    </div>
                                    <div>
                                        <label className="text-xs font-semibold text-gray-600 block mb-1.5">Max Shops</label>
                                        <input
                                            type="number"
                                            value={formData.features.shops_limit}
                                            onChange={(e) => setFormData({
                                                ...formData,
                                                features: { ...formData.features, shops_limit: parseInt(e.target.value) },
                                                limits: { ...formData.limits, max_shops: parseInt(e.target.value) }
                                            })}
                                            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500 outline-none"
                                        />
                                    </div>
                                </div>
                            </div>

                            {/* Features toggles */}
                            <div className="space-y-6">
                                <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wider border-b border-gray-100 pb-2">Toggle Features</h3>

                                <div>
                                    <h4 className="text-xs font-semibold text-gray-500 mb-3 tracking-wide">AI CORE CAPABILITIES</h4>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                        <label className="flex items-center gap-3 p-3 rounded-lg border border-gray-100 hover:bg-gray-50 transition-colors cursor-pointer bg-white">
                                            <input
                                                type="checkbox"
                                                checked={formData.features.ai_enabled}
                                                onChange={(e) => setFormData({
                                                    ...formData,
                                                    features: { ...formData.features, ai_enabled: e.target.checked }
                                                })}
                                                className="w-4 h-4 rounded text-violet-600 focus:ring-violet-500"
                                            />
                                            <span className="text-sm font-medium text-gray-700">AI Enabled</span>
                                        </label>
                                        <label className="flex items-center gap-3 p-3 rounded-lg border border-gray-100 hover:bg-gray-50 transition-colors cursor-pointer bg-white">
                                            <input
                                                type="checkbox"
                                                checked={formData.features.sales_intelligence}
                                                onChange={(e) => setFormData({
                                                    ...formData,
                                                    features: { ...formData.features, sales_intelligence: e.target.checked }
                                                })}
                                                className="w-4 h-4 rounded text-violet-600 focus:ring-violet-500"
                                            />
                                            <span className="text-sm font-medium text-gray-700">Sales Intelligence</span>
                                        </label>
                                        <label className="flex items-center gap-3 p-3 rounded-lg border border-gray-100 hover:bg-gray-50 transition-colors cursor-pointer bg-white">
                                            <input
                                                type="checkbox"
                                                checked={formData.features.ai_memory}
                                                onChange={(e) => setFormData({
                                                    ...formData,
                                                    features: { ...formData.features, ai_memory: e.target.checked }
                                                })}
                                                className="w-4 h-4 rounded text-violet-600 focus:ring-violet-500"
                                            />
                                            <span className="text-sm font-medium text-gray-700">AI Memory</span>
                                        </label>
                                        <div className="flex items-center gap-3 p-2 rounded-lg border border-gray-100 bg-gray-50">
                                            <span className="text-sm font-medium text-gray-700 pl-1">AI Model:</span>
                                            <select
                                                value={formData.features.ai_model || 'gpt-4o-mini'}
                                                onChange={(e) => setFormData({
                                                    ...formData,
                                                    features: { ...formData.features, ai_model: e.target.value }
                                                })}
                                                className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:ring-2 focus:ring-violet-500/20 outline-none bg-white flex-1"
                                            >
                                                <option value="gpt-4o-mini">GPT-4o-mini</option>
                                                <option value="gpt-4o">GPT-4o</option>
                                            </select>
                                        </div>
                                    </div>
                                </div>

                                <div>
                                    <h4 className="text-xs font-semibold text-gray-500 mb-3 tracking-wide">BUSINESS & MARKETING</h4>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                        <div className="flex items-center gap-3 p-2 rounded-lg border border-gray-100 bg-gray-50">
                                            <span className="text-sm font-medium text-gray-700 pl-1">Cart System:</span>
                                            <select
                                                value={formData.features.cart_system || 'none'}
                                                onChange={(e) => setFormData({
                                                    ...formData,
                                                    features: { ...formData.features, cart_system: e.target.value }
                                                })}
                                                className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:ring-2 focus:ring-violet-500/20 outline-none bg-white flex-1"
                                            >
                                                <option value="none">None</option>
                                                <option value="basic">Basic Cart</option>
                                                <option value="full">Full E-commerce</option>
                                            </select>
                                        </div>
                                        <label className="flex items-center gap-3 p-3 rounded-lg border border-gray-100 hover:bg-gray-50 transition-colors cursor-pointer bg-white">
                                            <input
                                                type="checkbox"
                                                checked={formData.features.payment_integration}
                                                onChange={(e) => setFormData({
                                                    ...formData,
                                                    features: { ...formData.features, payment_integration: e.target.checked }
                                                })}
                                                className="w-4 h-4 rounded text-violet-600 focus:ring-violet-500"
                                            />
                                            <span className="text-sm font-medium text-gray-700">Payment Integration</span>
                                        </label>
                                        <label className="flex items-center gap-3 p-3 rounded-lg border border-gray-100 hover:bg-gray-50 transition-colors cursor-pointer bg-white">
                                            <input
                                                type="checkbox"
                                                checked={formData.features.appointment_booking}
                                                onChange={(e) => setFormData({
                                                    ...formData,
                                                    features: { ...formData.features, appointment_booking: e.target.checked }
                                                })}
                                                className="w-4 h-4 rounded text-violet-600 focus:ring-violet-500"
                                            />
                                            <span className="text-sm font-medium text-gray-700">Appointment Booking</span>
                                        </label>
                                        <label className="flex items-center gap-3 p-3 rounded-lg border border-gray-100 hover:bg-gray-50 transition-colors cursor-pointer bg-white">
                                            <input
                                                type="checkbox"
                                                checked={formData.features.bulk_marketing}
                                                onChange={(e) => setFormData({
                                                    ...formData,
                                                    features: { ...formData.features, bulk_marketing: e.target.checked }
                                                })}
                                                className="w-4 h-4 rounded text-violet-600 focus:ring-violet-500"
                                            />
                                            <span className="text-sm font-medium text-gray-700">Bulk Marketing</span>
                                        </label>
                                        <label className="flex items-center gap-3 p-3 rounded-lg border border-gray-100 hover:bg-gray-50 transition-colors cursor-pointer bg-white">
                                            <input
                                                type="checkbox"
                                                checked={formData.features.comment_reply}
                                                onChange={(e) => setFormData({
                                                    ...formData,
                                                    features: { ...formData.features, comment_reply: e.target.checked }
                                                })}
                                                className="w-4 h-4 rounded text-violet-600 focus:ring-violet-500"
                                            />
                                            <span className="text-sm font-medium text-gray-700">Comment Auto-Reply</span>
                                        </label>
                                        <label className="flex items-center gap-3 p-3 rounded-lg border border-gray-100 hover:bg-gray-50 transition-colors cursor-pointer bg-white">
                                            <input
                                                type="checkbox"
                                                checked={formData.features.auto_tagging}
                                                onChange={(e) => setFormData({
                                                    ...formData,
                                                    features: { ...formData.features, auto_tagging: e.target.checked }
                                                })}
                                                className="w-4 h-4 rounded text-violet-600 focus:ring-violet-500"
                                            />
                                            <span className="text-sm font-medium text-gray-700">Auto Tagging</span>
                                        </label>
                                        <label className="flex items-center gap-3 p-3 rounded-lg border border-gray-100 hover:bg-gray-50 transition-colors cursor-pointer bg-white">
                                            <input
                                                type="checkbox"
                                                checked={formData.features.excel_export}
                                                onChange={(e) => setFormData({
                                                    ...formData,
                                                    features: { ...formData.features, excel_export: e.target.checked }
                                                })}
                                                className="w-4 h-4 rounded text-violet-600 focus:ring-violet-500"
                                            />
                                            <span className="text-sm font-medium text-gray-700">Excel Export</span>
                                        </label>
                                        <label className="flex items-center gap-3 p-3 rounded-lg border border-gray-100 hover:bg-gray-50 transition-colors cursor-pointer bg-white">
                                            <input
                                                type="checkbox"
                                                checked={formData.features.custom_branding}
                                                onChange={(e) => setFormData({
                                                    ...formData,
                                                    features: { ...formData.features, custom_branding: e.target.checked }
                                                })}
                                                className="w-4 h-4 rounded text-violet-600 focus:ring-violet-500"
                                            />
                                            <span className="text-sm font-medium text-gray-700">Custom Branding</span>
                                        </label>
                                        <label className="flex items-center gap-3 p-3 rounded-lg border border-gray-100 hover:bg-gray-50 transition-colors cursor-pointer bg-white">
                                            <input
                                                type="checkbox"
                                                checked={formData.features.priority_support}
                                                onChange={(e) => setFormData({
                                                    ...formData,
                                                    features: { ...formData.features, priority_support: e.target.checked }
                                                })}
                                                className="w-4 h-4 rounded text-violet-600 focus:ring-violet-500"
                                            />
                                            <span className="text-sm font-medium text-gray-700">Priority Support</span>
                                        </label>
                                    </div>
                                </div>
                            </div>

                            {/* Status */}
                            <div className="pt-4 border-t border-gray-100">
                                <div className="flex items-center gap-6 bg-violet-50/50 p-4 rounded-xl border border-violet-100">
                                    <label className="flex items-center gap-3 cursor-pointer">
                                        <div className="relative flex items-center">
                                            <input
                                                type="checkbox"
                                                checked={formData.is_active}
                                                onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                                                className="peer sr-only"
                                            />
                                            <div className="w-10 h-5.5 bg-gray-200 rounded-full peer-checked:bg-emerald-500 transition-colors"></div>
                                            <div className="absolute left-1 top-1 w-3.5 h-3.5 bg-white rounded-full transition-transform peer-checked:translate-x-4.5"></div>
                                        </div>
                                        <span className="text-sm font-semibold text-gray-800">Plan is Active</span>
                                    </label>
                                    <label className="flex items-center gap-3 cursor-pointer">
                                        <div className="relative flex items-center">
                                            <input
                                                type="checkbox"
                                                checked={formData.is_featured}
                                                onChange={(e) => setFormData({ ...formData, is_featured: e.target.checked })}
                                                className="peer sr-only"
                                            />
                                            <div className="w-10 h-5.5 bg-gray-200 rounded-full peer-checked:bg-violet-600 transition-colors"></div>
                                            <div className="absolute left-1 top-1 w-3.5 h-3.5 bg-white rounded-full transition-transform peer-checked:translate-x-4.5"></div>
                                        </div>
                                        <span className="text-sm font-semibold text-gray-800">Highlight as Featured</span>
                                    </label>
                                </div>
                            </div>
                        </div>

                        <div className="flex items-center justify-end gap-3 p-5 border-t border-gray-100 bg-gray-50/50 rounded-b-2xl">
                            <Button
                                variant="outline"
                                onClick={() => setShowModal(false)}
                                className="bg-white border-gray-200 text-gray-700 hover:bg-gray-50 hover:text-gray-900"
                            >
                                Cancel
                            </Button>
                            <Button
                                onClick={savePlan}
                                disabled={saving}
                                className="bg-violet-600 hover:bg-violet-700 text-white shadow-sm border-0"
                            >
                                {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                                {editingPlan ? 'Save Changes' : 'Create Plan'}
                            </Button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

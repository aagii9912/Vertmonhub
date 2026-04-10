'use client';

import { useEffect, useState } from 'react';
import { logger } from '@/lib/utils/logger';
import { Card, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { toast } from 'sonner';
import {
    Search, Users, ToggleLeft, ToggleRight,
    Loader2, Edit, X, Save, Clock
} from 'lucide-react';

interface Shop {
    id: string;
    name: string;
    owner_name: string | null;
    phone: string | null;
    description: string | null;
    facebook_page_id: string | null;
    is_active: boolean;
    created_at: string;
    plan_id: string | null;
    subscription_plan: string | null;
    subscription_status: string | null;
    trial_ends_at: string | null;
    ai_instructions: string | null;
    ai_emotion: string | null;
    // Direct plan from plan_id
    plans: {
        id: string;
        name: string;
        slug: string;
        price_monthly: number;
    } | null;
    // Subscription with nested plan
    subscriptions: Array<{
        id: string;
        status: string;
        billing_cycle: string;
        current_period_end: string;
        plans: {
            id: string;
            name: string;
            price_monthly: number;
        };
    }>;
}

interface Plan {
    id: string;
    name: string;
    slug: string;
    price_monthly: number;
}

interface EditFormData {
    name: string;
    owner_name: string;
    phone: string;
    description: string;
    plan_id: string;
    subscription_plan: string;
    subscription_status: string;
    trial_ends_at: string;
    ai_instructions: string;
    ai_emotion: string;
}

export default function ShopsPage() {
    const [shops, setShops] = useState<Shop[]>([]);
    const [availablePlans, setAvailablePlans] = useState<Plan[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState<string>('');
    const [pagination, setPagination] = useState({ page: 1, total: 0, pages: 0 });

    // Edit modal state
    const [editingShop, setEditingShop] = useState<Shop | null>(null);
    const [editForm, setEditForm] = useState<EditFormData>({
        name: '',
        owner_name: '',
        phone: '',
        description: '',
        plan_id: '',
        subscription_plan: '',
        subscription_status: '',
        trial_ends_at: '',
        ai_instructions: '',
        ai_emotion: ''
    });
    const [saving, setSaving] = useState(false);

    // Toggle loading state
    const [togglingId, setTogglingId] = useState<string | null>(null);

    useEffect(() => {
        fetchShops();
        fetchPlans();
    }, [pagination.page, statusFilter]);

    async function fetchPlans() {
        try {
            const res = await fetch('/api/admin/plans');
            if (res.ok) {
                const data = await res.json();
                setAvailablePlans(data.plans || []);
            }
        } catch (error: unknown) {
            logger.error('Fetch plans error:', { error });
        }
    }

    async function fetchShops() {
        try {
            const params = new URLSearchParams({
                page: pagination.page.toString(),
                limit: '20'
            });
            if (search) params.set('search', search);
            if (statusFilter) params.set('status', statusFilter);

            const res = await fetch(`/api/admin/shops?${params}`);
            if (res.ok) {
                const data = await res.json();
                setShops(data.shops || []);
                setPagination(p => ({
                    ...p,
                    total: data.pagination.total,
                    pages: data.pagination.pages
                }));
            } else {
                toast.error('Дэлгүүрүүдийг татахад алдаа гарлаа');
            }
        } catch (error: unknown) {
            logger.error('Fetch shops error:', { error });
            toast.error('Холболтын алдаа гарлаа');
        } finally {
            setLoading(false);
        }
    }

    async function toggleShopStatus(shop: Shop) {
        // Confirmation for disabling
        if (shop.is_active) {
            const confirmed = window.confirm(`"${shop.name}" дэлгүүрийг идэвхгүй болгох уу?`);
            if (!confirmed) return;
        }

        setTogglingId(shop.id);
        try {
            const res = await fetch('/api/admin/shops', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: shop.id, is_active: !shop.is_active })
            });

            if (res.ok) {
                setShops(shops.map(s =>
                    s.id === shop.id ? { ...s, is_active: !shop.is_active } : s
                ));
                toast.success(shop.is_active ? 'Дэлгүүр идэвхгүй болголоо' : 'Дэлгүүр идэвхжүүллээ');
            } else {
                toast.error('Статус өөрчлөхөд алдаа гарлаа');
            }
        } catch (error: unknown) {
            logger.error('Toggle status error:', { error });
            toast.error('Холболтын алдаа гарлаа');
        } finally {
            setTogglingId(null);
        }
    }

    function openEditModal(shop: Shop) {
        setEditingShop(shop);
        setEditForm({
            name: shop.name || '',
            owner_name: shop.owner_name || '',
            phone: shop.phone || '',
            description: shop.description || '',
            plan_id: shop.plan_id || '',
            subscription_plan: shop.subscription_plan || 'starter',
            subscription_status: shop.subscription_status || 'active',
            trial_ends_at: shop.trial_ends_at ? new Date(shop.trial_ends_at).toISOString().split('T')[0] : '',
            ai_instructions: shop.ai_instructions || '',
            ai_emotion: shop.ai_emotion || ''
        });
    }

    async function handleSaveEdit() {
        if (!editingShop) return;

        if (!editForm.name.trim()) {
            toast.error('Дэлгүүрийн нэр хоосон байж болохгүй');
            return;
        }

        setSaving(true);
        try {
            const res = await fetch('/api/admin/shops', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    id: editingShop.id,
                    name: editForm.name.trim(),
                    owner_name: editForm.owner_name.trim() || null,
                    phone: editForm.phone.trim() || null,
                    description: editForm.description.trim() || null,
                    plan_id: editForm.plan_id,
                    subscription_plan: editForm.subscription_plan,
                    subscription_status: editForm.subscription_status,
                    trial_ends_at: editForm.trial_ends_at ? new Date(editForm.trial_ends_at).toISOString() : null,
                    ai_instructions: editForm.ai_instructions,
                    ai_emotion: editForm.ai_emotion
                })
            });

            if (res.ok) {
                const data = await res.json();
                setShops(shops.map(s =>
                    s.id === editingShop.id ? { ...s, ...data.shop } : s
                ));
                setEditingShop(null);
                toast.success('Дэлгүүрийн мэдээлэл хадгаллаа');
            } else {
                const error = await res.json();
                toast.error(error.error || 'Хадгалахад алдаа гарлаа');
            }
        } catch (error: unknown) {
            logger.error('Save edit error:', { error });
            toast.error('Холболтын алдаа гарлаа');
        } finally {
            setSaving(false);
        }
    }

    function handleSearch(e: React.FormEvent) {
        e.preventDefault();
        setPagination(p => ({ ...p, page: 1 }));
        fetchShops();
    }

    const formatDate = (date: string) => {
        return new Date(date).toLocaleDateString('mn-MN', {
            year: 'numeric',
            month: 'short',
            day: 'numeric'
        });
    };

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
                    <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Shops Directory</h1>
                    <p className="text-sm text-gray-500 mt-1">Manage and monitor all registered shops on the platform.</p>
                </div>
                <div className="text-sm font-medium text-gray-600 bg-white px-4 py-2 rounded-xl border border-gray-100 shadow-sm">
                    <span className="text-gray-400 mr-2">Total Shops:</span>
                    {pagination.total}
                </div>
            </div>

            {/* Filters */}
            <Card className="border-gray-100 shadow-sm rounded-2xl bg-white">
                <CardContent className="p-4">
                    <div className="flex flex-col md:flex-row items-center gap-4">
                        <form onSubmit={handleSearch} className="flex-1 w-full md:w-auto">
                            <div className="relative group">
                                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 group-focus-within:text-violet-500 transition-colors" />
                                <input
                                    type="text"
                                    value={search}
                                    onChange={(e) => setSearch(e.target.value)}
                                    placeholder="Search by name, owner, or phone..."
                                    className="w-full pl-10 pr-4 py-2.5 text-sm border border-gray-200 rounded-xl focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500 transition-all outline-none"
                                />
                            </div>
                        </form>

                        <div className="w-full md:w-48 relative">
                            <select
                                value={statusFilter}
                                onChange={(e) => setStatusFilter(e.target.value)}
                                className="w-full appearance-none px-4 py-2.5 text-sm border border-gray-200 rounded-xl focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500 bg-white transition-all outline-none"
                            >
                                <option value="">All Statuses</option>
                                <option value="active">Active Only</option>
                                <option value="inactive">Inactive Only</option>
                            </select>
                            <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400">
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
                            </div>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Shops Table */}
            <Card className="border-gray-100 shadow-sm rounded-2xl bg-white overflow-hidden">
                <CardContent className="p-0">
                    <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="bg-gray-50/50 border-b border-gray-100">
                                    <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Shop Details</th>
                                    <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Subscription Plan</th>
                                    <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Status</th>
                                    <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Joined Date</th>
                                    <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider text-right">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-50">
                                {shops.map((shop) => (
                                    <tr key={shop.id} className="hover:bg-gray-50/50 transition-colors group">
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-4">
                                                <div className="w-10 h-10 bg-gray-100 rounded-xl border border-gray-200 flex items-center justify-center font-medium text-gray-600 shadow-sm">
                                                    {shop.name.charAt(0).toUpperCase()}
                                                </div>
                                                <div>
                                                    <p className="font-semibold text-gray-900 text-sm">{shop.name}</p>
                                                    <p className="text-xs text-gray-500 mt-0.5">
                                                        {shop.owner_name || (shop.facebook_page_id ? 'FB Connected' : 'No owner')}
                                                    </p>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            {shop.plans ? (
                                                <div>
                                                    <p className="font-medium text-gray-900 text-sm">
                                                        {shop.plans.name}
                                                    </p>
                                                    <p className="text-xs text-gray-500 mt-0.5">
                                                        ₮{shop.plans.price_monthly.toLocaleString()}/mo
                                                    </p>
                                                </div>
                                            ) : shop.subscriptions?.[0]?.plans ? (
                                                <div>
                                                    <p className="font-medium text-gray-900 text-sm">
                                                        {shop.subscriptions[0].plans.name}
                                                    </p>
                                                    <p className="text-xs text-gray-500 mt-0.5">
                                                        ₮{shop.subscriptions[0].plans.price_monthly.toLocaleString()}/mo
                                                    </p>
                                                </div>
                                            ) : shop.subscription_plan ? (
                                                <span className="inline-flex px-2.5 py-1 bg-gray-100 text-gray-700 rounded-md text-xs font-medium capitalize border border-gray-200">
                                                    {shop.subscription_plan}
                                                </span>
                                            ) : (
                                                <span className="text-xs text-gray-400 italic">No Active Plan</span>
                                            )}
                                        </td>
                                        <td className="px-6 py-4">
                                            <button
                                                onClick={() => toggleShopStatus(shop)}
                                                disabled={togglingId === shop.id}
                                                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all border ${shop.is_active
                                                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
                                                    : 'bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100'
                                                    } disabled:opacity-50`}
                                            >
                                                {togglingId === shop.id ? (
                                                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                                ) : shop.is_active ? (
                                                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 mr-1" />
                                                ) : (
                                                    <div className="w-1.5 h-1.5 rounded-full bg-gray-400 mr-1" />
                                                )}
                                                {shop.is_active ? 'Active' : 'Inactive'}
                                            </button>
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-1.5 text-sm text-gray-600">
                                                <Clock className="w-4 h-4 text-gray-400" />
                                                {formatDate(shop.created_at)}
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            <button
                                                onClick={() => openEditModal(shop)}
                                                className="inline-flex p-2 bg-white border border-gray-200 hover:border-violet-300 hover:bg-violet-50 rounded-lg text-gray-500 hover:text-violet-600 transition-colors shadow-sm"
                                                title="Edit shop details"
                                            >
                                                <Edit className="w-4 h-4" />
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    {/* Pagination */}
                    {pagination.pages > 1 && (
                        <div className="px-6 py-4 border-t border-gray-50 bg-gray-50/50 flex flex-col sm:flex-row items-center justify-between gap-4">
                            <p className="text-sm text-gray-500 font-medium">
                                Showing Page <span className="text-gray-900">{pagination.page}</span> of <span className="text-gray-900">{pagination.pages}</span>
                            </p>
                            <div className="flex gap-2">
                                <Button
                                    variant="outline"
                                    size="sm"
                                    className="bg-white border-gray-200 text-gray-700 hover:bg-gray-50"
                                    disabled={pagination.page <= 1}
                                    onClick={() => setPagination(p => ({ ...p, page: p.page - 1 }))}
                                >
                                    Previous
                                </Button>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    className="bg-white border-gray-200 text-gray-700 hover:bg-gray-50"
                                    disabled={pagination.page >= pagination.pages}
                                    onClick={() => setPagination(p => ({ ...p, page: p.page + 1 }))}
                                >
                                    Next
                                </Button>
                            </div>
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Edit Shop Modal */}
            {editingShop && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-gray-900/40 backdrop-blur-sm transition-opacity" onClick={() => setEditingShop(null)} />

                    <div className="bg-white rounded-2xl shadow-xl w-full max-w-xl max-h-[90vh] flex flex-col relative z-10 animate-in zoom-in-95 duration-200">
                        <div className="flex items-center justify-between p-5 border-b border-gray-100">
                            <div>
                                <h2 className="text-lg font-bold text-gray-900">Edit Shop Details</h2>
                                <p className="text-xs text-gray-500 mt-1">ID: {editingShop.id}</p>
                            </div>
                            <button
                                onClick={() => setEditingShop(null)}
                                className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-xl transition-colors"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        <div className="p-6 space-y-6 overflow-y-auto flex-1 custom-scrollbar">
                            {/* Basic Info */}
                            <div className="space-y-4">
                                <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wider border-b border-gray-100 pb-2">Basic Info</h3>
                                <div>
                                    <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                                        Дэлгүүрийн нэр *
                                    </label>
                                    <input
                                        type="text"
                                        value={editForm.name}
                                        onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                                        className="w-full px-3.5 py-2.5 text-sm border border-gray-200 rounded-xl focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500 transition-all outline-none bg-gray-50 focus:bg-white"
                                        placeholder="Enter shop name"
                                    />
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                                            Эзэмшигчийн нэр
                                        </label>
                                        <input
                                            type="text"
                                            value={editForm.owner_name}
                                            onChange={(e) => setEditForm({ ...editForm, owner_name: e.target.value })}
                                            className="w-full px-3.5 py-2.5 text-sm border border-gray-200 rounded-xl focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500 transition-all outline-none bg-gray-50 focus:bg-white"
                                            placeholder="Owner's full name"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                                            Утасны дугаар
                                        </label>
                                        <input
                                            type="tel"
                                            value={editForm.phone}
                                            onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
                                            className="w-full px-3.5 py-2.5 text-sm border border-gray-200 rounded-xl focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500 transition-all outline-none bg-gray-50 focus:bg-white"
                                            placeholder="+976 00000000"
                                        />
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                                        Тайлбар
                                    </label>
                                    <textarea
                                        value={editForm.description}
                                        onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                                        rows={2}
                                        className="w-full px-3.5 py-2.5 text-sm border border-gray-200 rounded-xl focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500 transition-all outline-none bg-gray-50 focus:bg-white resize-none"
                                        placeholder="Brief description of the shop..."
                                    />
                                </div>
                            </div>

                            {/* Subscription Info */}
                            <div className="space-y-4 pt-4">
                                <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wider border-b border-gray-100 pb-2">Subscription Info</h3>
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-sm font-semibold text-gray-700 mb-1.5">Plan</label>
                                        <select
                                            value={editForm.plan_id}
                                            onChange={(e) => {
                                                const selectedPlanId = e.target.value;
                                                const selectedPlan = availablePlans.find(p => p.id === selectedPlanId);
                                                setEditForm({
                                                    ...editForm,
                                                    plan_id: selectedPlanId,
                                                    subscription_plan: selectedPlan?.slug || editForm.subscription_plan
                                                });
                                            }}
                                            className="w-full px-3.5 py-2.5 text-sm border border-gray-200 rounded-xl focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500 transition-all outline-none bg-gray-50 focus:bg-white"
                                        >
                                            <option value="">Select Plan...</option>
                                            {availablePlans.map((plan) => (
                                                <option key={plan.id} value={plan.id}>
                                                    {plan.name} ({plan.slug})
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-sm font-semibold text-gray-700 mb-1.5">Status</label>
                                        <select
                                            value={editForm.subscription_status}
                                            onChange={(e) => setEditForm({ ...editForm, subscription_status: e.target.value })}
                                            className="w-full px-3.5 py-2.5 text-sm border border-gray-200 rounded-xl focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500 transition-all outline-none bg-gray-50 focus:bg-white"
                                        >
                                            <option value="active">Active</option>
                                            <option value="trial">Trial</option>
                                            <option value="inactive">Inactive</option>
                                            <option value="cancelled">Cancelled</option>
                                        </select>
                                    </div>
                                    <div className="col-span-2">
                                        <label className="block text-sm font-semibold text-gray-700 mb-1.5">Trial Ends At</label>
                                        <input
                                            type="date"
                                            value={editForm.trial_ends_at}
                                            onChange={(e) => setEditForm({ ...editForm, trial_ends_at: e.target.value })}
                                            className="w-full px-3.5 py-2.5 text-sm border border-gray-200 rounded-xl focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500 transition-all outline-none bg-gray-50 focus:bg-white"
                                        />
                                    </div>
                                </div>
                            </div>

                            {/* AI Settings */}
                            <div className="space-y-4 pt-4">
                                <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wider border-b border-gray-100 pb-2">AI Preferences</h3>
                                <div>
                                    <label className="block text-sm font-semibold text-gray-700 mb-1.5">System Instructions</label>
                                    <textarea
                                        value={editForm.ai_instructions}
                                        onChange={(e) => setEditForm({ ...editForm, ai_instructions: e.target.value })}
                                        rows={3}
                                        className="w-full px-3.5 py-2.5 text-sm border border-gray-200 rounded-xl focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500 transition-all outline-none bg-gray-50 focus:bg-white resize-none"
                                        placeholder="Example: You are a helpful sales assistant..."
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-semibold text-gray-700 mb-1.5">Emotion & Tone</label>
                                    <input
                                        type="text"
                                        value={editForm.ai_emotion}
                                        onChange={(e) => setEditForm({ ...editForm, ai_emotion: e.target.value })}
                                        className="w-full px-3.5 py-2.5 text-sm border border-gray-200 rounded-xl focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500 transition-all outline-none bg-gray-50 focus:bg-white"
                                        placeholder="e.g. Friendly, Professional, Enthusiastic"
                                    />
                                </div>
                            </div>
                        </div>

                        <div className="flex items-center justify-end gap-3 p-5 border-t border-gray-100 bg-gray-50/50 rounded-b-2xl">
                            <Button
                                variant="outline"
                                onClick={() => setEditingShop(null)}
                                disabled={saving}
                                className="bg-white"
                            >
                                Cancel
                            </Button>
                            <Button
                                onClick={handleSaveEdit}
                                disabled={saving}
                                className="bg-violet-600 hover:bg-violet-700 text-white border-0 shadow-sm"
                            >
                                {saving ? (
                                    <>
                                        <Loader2 className="w-4 h-4 animate-spin mr-2" />
                                        Saving...
                                    </>
                                ) : (
                                    <>
                                        <Save className="w-4 h-4 mr-2" />
                                        Save Changes
                                    </>
                                )}
                            </Button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

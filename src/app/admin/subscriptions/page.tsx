'use client';
import { logger } from '@/lib/utils/logger';

import { useEffect, useState } from 'react';
import { Card, CardContent } from '@/components/ui/Card';
import {
    CreditCard, Search, Filter, ChevronLeft, ChevronRight,
    CheckCircle, XCircle, AlertCircle, Clock
} from 'lucide-react';

interface Subscription {
    id: string;
    shop_id: string;
    plan_id: string;
    status: 'active' | 'canceled' | 'past_due' | 'trialing';
    current_period_start: string;
    current_period_end: string;
    created_at: string;
    shops: { id: string; name: string; email: string };
    plans: { id: string; name: string; price_monthly: number; price_yearly: number };
}

export default function AdminSubscriptionsPage() {
    const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
    const [loading, setLoading] = useState(true);
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [statusFilter, setStatusFilter] = useState('');
    const [searchTerm, setSearchTerm] = useState('');

    useEffect(() => {
        fetchSubscriptions();
    }, [page, statusFilter]);

    async function fetchSubscriptions() {
        try {
            setLoading(true);
            const params = new URLSearchParams({ page: page.toString(), limit: '10' });
            if (statusFilter) params.append('status', statusFilter);

            const res = await fetch(`/api/admin/subscriptions?${params}`);
            if (res.ok) {
                const data = await res.json();
                setSubscriptions(data.subscriptions || []);
                setTotalPages(data.totalPages || 1);
            }
        } catch (error: unknown) {
            logger.error('Fetch error:', { error: error });
        } finally {
            setLoading(false);
        }
    }

    async function updateStatus(subscriptionId: string, newStatus: string) {
        try {
            const res = await fetch('/api/admin/subscriptions', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ subscription_id: subscriptionId, status: newStatus })
            });
            if (res.ok) {
                fetchSubscriptions();
            }
        } catch (error: unknown) {
            logger.error('Update error:', { error: error });
        }
    }

    const getStatusIcon = (status: string) => {
        switch (status) {
            case 'active': return <CheckCircle className="w-4 h-4 text-green-500" />;
            case 'canceled': return <XCircle className="w-4 h-4 text-red-500" />;
            case 'past_due': return <AlertCircle className="w-4 h-4 text-yellow-500" />;
            case 'trialing': return <Clock className="w-4 h-4 text-blue-500" />;
            default: return null;
        }
    };

    const getStatusBadge = (status: string) => {
        const styles: Record<string, string> = {
            active: 'bg-green-100 text-green-700',
            canceled: 'bg-red-100 text-red-700',
            past_due: 'bg-yellow-100 text-yellow-700',
            trialing: 'bg-blue-100 text-blue-700'
        };
        return styles[status] || 'bg-gray-100 text-gray-700';
    };

    const formatMoney = (amount: number) => `₮${amount.toLocaleString()}`;

    const filteredSubscriptions = subscriptions.filter(sub =>
        !searchTerm ||
        sub.shops?.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        sub.plans?.name?.toLowerCase().includes(searchTerm.toLowerCase())
    );

    return (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Subscriptions</h1>
                    <p className="text-sm text-gray-500 mt-1">Бүх subscription удирдах</p>
                </div>
            </div>

            {/* Filters */}
            <Card className="border-gray-100 shadow-sm rounded-2xl bg-white">
                <CardContent className="p-4">
                    <div className="flex flex-col md:flex-row gap-4">
                        <div className="flex-1 relative">
                            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4.5 h-4.5 text-gray-400" />
                            <input
                                type="text"
                                placeholder="Дэлгүүр хайх..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="w-full pl-10 pr-4 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500 transition-all bg-gray-50 focus:bg-white"
                            />
                        </div>
                        <select
                            value={statusFilter}
                            onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
                            className="px-4 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500 transition-all bg-gray-50 focus:bg-white cursor-pointer"
                        >
                            <option value="">Бүх статус</option>
                            <option value="active">Active</option>
                            <option value="trialing">Trialing</option>
                            <option value="past_due">Past Due</option>
                            <option value="canceled">Canceled</option>
                        </select>
                    </div>
                </CardContent>
            </Card>

            {/* Table */}
            <Card className="border-gray-100 shadow-sm rounded-2xl bg-white overflow-hidden overflow-x-auto">
                <CardContent className="p-0">
                    {loading ? (
                        <div className="flex items-center justify-center h-64">
                            <div className="animate-spin w-8 h-8 border-4 border-violet-600/20 border-t-violet-600 rounded-full" />
                        </div>
                    ) : filteredSubscriptions.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
                            <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mb-4">
                                <CreditCard className="w-8 h-8 text-gray-400" />
                            </div>
                            <h3 className="text-sm font-semibold text-gray-900">Subscription олдсонгүй</h3>
                            <p className="text-sm text-gray-500 mt-1">Одоогоор харуулах дата байхгүй байна.</p>
                        </div>
                    ) : (
                        <div className="overflow-x-auto custom-scrollbar">
                            <table className="w-full min-w-[800px]">
                                <thead className="bg-gray-50/50 border-b border-gray-100">
                                    <tr>
                                        <th className="text-left px-6 py-4 text-[11px] font-bold text-gray-500 uppercase tracking-wider">Дэлгүүр</th>
                                        <th className="text-left px-6 py-4 text-[11px] font-bold text-gray-500 uppercase tracking-wider">Багц</th>
                                        <th className="text-left px-6 py-4 text-[11px] font-bold text-gray-500 uppercase tracking-wider">Үнэ</th>
                                        <th className="text-left px-6 py-4 text-[11px] font-bold text-gray-500 uppercase tracking-wider">Статус</th>
                                        <th className="text-left px-6 py-4 text-[11px] font-bold text-gray-500 uppercase tracking-wider">Дуусах огноо</th>
                                        <th className="text-left px-6 py-4 text-[11px] font-bold text-gray-500 uppercase tracking-wider">Үйлдэл</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                    {filteredSubscriptions.map((sub) => (
                                        <tr key={sub.id} className="hover:bg-gray-50/80 transition-colors group">
                                            <td className="px-6 py-4">
                                                <div className="flex flex-col">
                                                    <span className="text-sm font-semibold text-gray-900 group-hover:text-violet-600 transition-colors">{sub.shops?.name}</span>
                                                    <span className="text-xs text-gray-500 mt-0.5">{sub.shops?.email}</span>
                                                </div>
                                            </td>
                                            <td className="px-6 py-4">
                                                <span className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-medium bg-gray-100 text-gray-700">
                                                    {sub.plans?.name || '-'}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4">
                                                <div className="flex flex-col">
                                                    <span className="text-sm font-bold text-gray-900 tracking-tight">
                                                        {formatMoney(sub.plans?.price_monthly || 0)}
                                                    </span>
                                                    <span className="text-[10px] text-gray-500 uppercase tracking-wider">/ Сар</span>
                                                </div>
                                            </td>
                                            <td className="px-6 py-4">
                                                <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider border border-transparent ${sub.status === 'active' ? 'bg-green-50 text-green-700 border-green-200/50' :
                                                        sub.status === 'trialing' ? 'bg-blue-50 text-blue-700 border-blue-200/50' :
                                                            sub.status === 'past_due' ? 'bg-yellow-50 text-yellow-700 border-yellow-200/50' :
                                                                'bg-red-50 text-red-700 border-red-200/50'
                                                    }`}>
                                                    {getStatusIcon(sub.status)}
                                                    {sub.status === 'active' ? 'Идэвхтэй' :
                                                        sub.status === 'trialing' ? 'Туршилтын' :
                                                            sub.status === 'past_due' ? 'Хугацаа хэтэрсэн' : 'Цуцлагдсан'}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4">
                                                <span className="text-sm text-gray-600">
                                                    {sub.current_period_end ? new Date(sub.current_period_end).toLocaleDateString('mn-MN') : '-'}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4">
                                                <select
                                                    value={sub.status}
                                                    onChange={(e) => updateStatus(sub.id, e.target.value)}
                                                    className="text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500 transition-all outline-none bg-white cursor-pointer hover:border-gray-300"
                                                >
                                                    <option value="active">Active</option>
                                                    <option value="trialing">Trialing</option>
                                                    <option value="past_due">Past Due</option>
                                                    <option value="canceled">Canceled</option>
                                                </select>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}

                    {/* Pagination */}
                    {totalPages > 1 && (
                        <div className="flex items-center justify-between px-6 py-4 border-t border-gray-100 bg-gray-50/50">
                            <button
                                onClick={() => setPage(p => Math.max(1, p - 1))}
                                disabled={page === 1}
                                className="flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-gray-600 hover:text-gray-900 hover:bg-white border border-transparent hover:border-gray-200 rounded-lg disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:border-transparent transition-all"
                            >
                                <ChevronLeft className="w-4 h-4" /> Өмнөх
                            </button>
                            <span className="text-xs font-medium text-gray-500 bg-white px-3 py-1.5 rounded-lg border border-gray-200">
                                Хуудас {page} / {totalPages}
                            </span>
                            <button
                                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                                disabled={page === totalPages}
                                className="flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-gray-600 hover:text-gray-900 hover:bg-white border border-transparent hover:border-gray-200 rounded-lg disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:border-transparent transition-all"
                            >
                                Дараах <ChevronRight className="w-4 h-4" />
                            </button>
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}

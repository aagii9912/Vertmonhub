'use client';
import { logger } from '@/lib/utils/logger';

import { useEffect, useState } from 'react';
import { Card, CardContent } from '@/components/ui/Card';
import {
    FileText, Search, Plus, ChevronLeft, ChevronRight,
    CheckCircle, Clock, AlertCircle, Download
} from 'lucide-react';

interface Invoice {
    id: string;
    shop_id: string;
    subscription_id: string;
    amount: number;
    status: 'pending' | 'paid' | 'overdue' | 'canceled';
    due_date: string;
    paid_at: string | null;
    created_at: string;
    shops: { id: string; name: string; email: string };
    subscriptions?: { id: string; status: string; plans: { name: string } };
}

interface Totals {
    total: number;
    paid: number;
    pending: number;
    overdue: number;
}

export default function AdminInvoicesPage() {
    const [invoices, setInvoices] = useState<Invoice[]>([]);
    const [totals, setTotals] = useState<Totals>({ total: 0, paid: 0, pending: 0, overdue: 0 });
    const [loading, setLoading] = useState(true);
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [statusFilter, setStatusFilter] = useState('');
    const [searchTerm, setSearchTerm] = useState('');

    useEffect(() => {
        fetchInvoices();
    }, [page, statusFilter]);

    async function fetchInvoices() {
        try {
            setLoading(true);
            const params = new URLSearchParams({ page: page.toString(), limit: '10' });
            if (statusFilter) params.append('status', statusFilter);

            const res = await fetch(`/api/admin/invoices?${params}`);
            if (res.ok) {
                const data = await res.json();
                setInvoices(data.invoices || []);
                setTotals(data.totals || { total: 0, paid: 0, pending: 0, overdue: 0 });
                setTotalPages(data.totalPages || 1);
            }
        } catch (error: unknown) {
            logger.error('Fetch error:', { error: error });
        } finally {
            setLoading(false);
        }
    }

    async function updateStatus(invoiceId: string, newStatus: string) {
        try {
            const res = await fetch('/api/admin/invoices', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ invoice_id: invoiceId, status: newStatus })
            });
            if (res.ok) {
                fetchInvoices();
            }
        } catch (error: unknown) {
            logger.error('Update error:', { error: error });
        }
    }

    const getStatusBadge = (status: string) => {
        const styles: Record<string, string> = {
            paid: 'bg-green-100 text-green-700',
            pending: 'bg-yellow-100 text-yellow-700',
            overdue: 'bg-red-100 text-red-700',
            canceled: 'bg-gray-100 text-gray-700'
        };
        return styles[status] || 'bg-gray-100 text-gray-700';
    };

    const getStatusIcon = (status: string) => {
        switch (status) {
            case 'paid': return <CheckCircle className="w-4 h-4 text-green-500" />;
            case 'pending': return <Clock className="w-4 h-4 text-yellow-500" />;
            case 'overdue': return <AlertCircle className="w-4 h-4 text-red-500" />;
            default: return null;
        }
    };

    const formatMoney = (amount: number) => `₮${amount.toLocaleString()}`;

    const filteredInvoices = invoices.filter(inv =>
        !searchTerm ||
        inv.shops?.name?.toLowerCase().includes(searchTerm.toLowerCase())
    );

    return (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Invoices</h1>
                    <p className="text-sm text-gray-500 mt-1">Төлбөрийн нэхэмжлэл удирдах</p>
                </div>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <Card className="border-gray-100 shadow-sm rounded-2xl bg-white transition-all hover:shadow-md">
                    <CardContent className="p-4 flex flex-col gap-1">
                        <p className="text-sm font-medium text-gray-500">Нийт</p>
                        <p className="text-2xl font-bold text-gray-900 tracking-tight">{formatMoney(totals.total)}</p>
                    </CardContent>
                </Card>
                <Card className="border-gray-100 shadow-sm rounded-2xl bg-white transition-all hover:shadow-md">
                    <CardContent className="p-4 flex flex-col gap-1">
                        <p className="text-sm font-medium text-gray-500">Төлөгдсөн</p>
                        <p className="text-2xl font-bold text-green-600 tracking-tight">{formatMoney(totals.paid)}</p>
                    </CardContent>
                </Card>
                <Card className="border-gray-100 shadow-sm rounded-2xl bg-white transition-all hover:shadow-md">
                    <CardContent className="p-4 flex flex-col gap-1">
                        <p className="text-sm font-medium text-gray-500">Хүлээгдэж буй</p>
                        <p className="text-2xl font-bold text-yellow-600 tracking-tight">{formatMoney(totals.pending)}</p>
                    </CardContent>
                </Card>
                <Card className="border-gray-100 shadow-sm rounded-2xl bg-white transition-all hover:shadow-md">
                    <CardContent className="p-4 flex flex-col gap-1">
                        <p className="text-sm font-medium text-gray-500">Хугацаа хэтэрсэн</p>
                        <p className="text-2xl font-bold text-red-600 tracking-tight">{formatMoney(totals.overdue)}</p>
                    </CardContent>
                </Card>
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
                            <option value="paid">Төлөгдсөн</option>
                            <option value="pending">Хүлээгдэж буй</option>
                            <option value="overdue">Хугацаа хэтэрсэн</option>
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
                    ) : filteredInvoices.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
                            <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mb-4">
                                <FileText className="w-8 h-8 text-gray-400" />
                            </div>
                            <h3 className="text-sm font-semibold text-gray-900">Invoice олдсонгүй</h3>
                            <p className="text-sm text-gray-500 mt-1">Одоогоор харуулах нэхэмжлэл байхгүй байна.</p>
                        </div>
                    ) : (
                        <div className="overflow-x-auto custom-scrollbar">
                            <table className="w-full min-w-[800px]">
                                <thead className="bg-gray-50/50 border-b border-gray-100">
                                    <tr>
                                        <th className="text-left px-6 py-4 text-[11px] font-bold text-gray-500 uppercase tracking-wider">Дэлгүүр</th>
                                        <th className="text-left px-6 py-4 text-[11px] font-bold text-gray-500 uppercase tracking-wider">Багц</th>
                                        <th className="text-left px-6 py-4 text-[11px] font-bold text-gray-500 uppercase tracking-wider">Дүн</th>
                                        <th className="text-left px-6 py-4 text-[11px] font-bold text-gray-500 uppercase tracking-wider">Статус</th>
                                        <th className="text-left px-6 py-4 text-[11px] font-bold text-gray-500 uppercase tracking-wider">Төлөх огноо</th>
                                        <th className="text-left px-6 py-4 text-[11px] font-bold text-gray-500 uppercase tracking-wider">Үйлдэл</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                    {filteredInvoices.map((inv) => (
                                        <tr key={inv.id} className="hover:bg-gray-50/80 transition-colors group">
                                            <td className="px-6 py-4">
                                                <div className="flex flex-col">
                                                    <span className="text-sm font-semibold text-gray-900 group-hover:text-violet-600 transition-colors">{inv.shops?.name}</span>
                                                    <span className="text-xs text-gray-500 mt-0.5">{inv.shops?.email}</span>
                                                </div>
                                            </td>
                                            <td className="px-6 py-4">
                                                <span className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-medium bg-gray-100 text-gray-700">
                                                    {inv.subscriptions?.plans?.name || '-'}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4">
                                                <span className="text-sm font-bold text-gray-900 tracking-tight">
                                                    {formatMoney(inv.amount)}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4">
                                                <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider border border-transparent ${inv.status === 'paid' ? 'bg-green-50 text-green-700 border-green-200/50' :
                                                        inv.status === 'pending' ? 'bg-yellow-50 text-yellow-700 border-yellow-200/50' :
                                                            'bg-red-50 text-red-700 border-red-200/50'
                                                    }`}>
                                                    {getStatusIcon(inv.status)}
                                                    {inv.status === 'paid' ? 'Төлөгдсөн' : inv.status === 'pending' ? 'Хүлээгдэж буй' : 'Хугацаа хэтэрсэн'}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4">
                                                <span className="text-sm text-gray-600">
                                                    {inv.due_date ? new Date(inv.due_date).toLocaleDateString('mn-MN') : '-'}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4">
                                                <select
                                                    value={inv.status}
                                                    onChange={(e) => updateStatus(inv.id, e.target.value)}
                                                    className="text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500 transition-all outline-none bg-white cursor-pointer hover:border-gray-300"
                                                >
                                                    <option value="pending">Хүлээгдэж буй</option>
                                                    <option value="paid">Төлөгдсөн</option>
                                                    <option value="overdue">Хугацаа хэтэрсэн</option>
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

'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import {
    Search, User, Phone, Mail,
    Tag, X, MessageSquare, Clock, ChevronDown,
    Edit2, Save, Loader2
} from 'lucide-react';

interface Customer {
    id: string;
    name: string | null;
    phone: string | null;
    email?: string | null;
    address: string | null;
    notes?: string | null;
    tags?: string[];
    message_count?: number;
    last_contact_at?: string | null;
    created_at: string;
    chat_history?: Array<{ message: string; response: string; created_at: string }>;
}

const PREDEFINED_TAGS = ['New', 'Lead', 'Inactive', 'Hot', 'Regular'];

export default function CustomersPage() {
    const [customers, setCustomers] = useState<Customer[]>([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedTag, setSelectedTag] = useState<string | null>(null);
    const [sortBy, setSortBy] = useState('created_at');
    const [loading, setLoading] = useState(true);
    const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
    const [isDetailOpen, setIsDetailOpen] = useState(false);
    const [editMode, setEditMode] = useState(false);
    const [saving, setSaving] = useState(false);

    // Edit form state
    const [editForm, setEditForm] = useState({
        name: '',
        phone: '',
        email: '',
        notes: ''
    });

    useEffect(() => {
        fetchCustomers();
    }, [selectedTag, sortBy]);

    async function fetchCustomers() {
        try {
            setLoading(true);
            const params = new URLSearchParams();
            if (selectedTag) params.set('tag', selectedTag);
            params.set('sortBy', sortBy);

            const res = await fetch(`/api/dashboard/customers?${params}`, {
                headers: {
                    'x-shop-id': localStorage.getItem('vertmonhub_active_shop_id') || ''
                }
            });
            const data = await res.json();
            setCustomers(data.customers || []);
        } catch (error) {
            console.error('Failed to fetch customers:', error);
        } finally {
            setLoading(false);
        }
    }

    async function fetchCustomerDetail(id: string) {
        try {
            const res = await fetch(`/api/dashboard/customers/${id}`, {
                headers: {
                    'x-shop-id': localStorage.getItem('vertmonhub_active_shop_id') || ''
                }
            });
            const data = await res.json();
            setSelectedCustomer(data.customer);
            setEditForm({
                name: data.customer.name || '',
                phone: data.customer.phone || '',
                email: data.customer.email || '',
                notes: data.customer.notes || ''
            });
            setIsDetailOpen(true);
        } catch (error) {
            console.error('Failed to fetch customer detail:', error);
        }
    }

    async function saveCustomer() {
        if (!selectedCustomer) return;
        setSaving(true);
        try {
            await fetch('/api/dashboard/customers', {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                    'x-shop-id': localStorage.getItem('vertmonhub_active_shop_id') || ''
                },
                body: JSON.stringify({
                    id: selectedCustomer.id,
                    ...editForm
                })
            });
            setEditMode(false);
            fetchCustomers();
            fetchCustomerDetail(selectedCustomer.id);
        } catch (error) {
            console.error('Failed to save customer:', error);
        } finally {
            setSaving(false);
        }
    }

    const filteredCustomers = customers.filter(c => {
        const matchesSearch = (c.name || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
            (c.phone || '').includes(searchQuery);
        return matchesSearch;
    });

    const formatDate = (date: string | null) => {
        if (!date) return '-';
        return new Date(date).toLocaleDateString('mn-MN');
    };

    const formatTime = (date: string | null) => {
        if (!date) return '';
        const d = new Date(date);
        const now = new Date();
        const diff = now.getTime() - d.getTime();
        const days = Math.floor(diff / (1000 * 60 * 60 * 24));
        if (days === 0) return 'Өнөөдөр';
        if (days === 1) return 'Өчигдөр';
        if (days < 7) return `${days} өдрийн өмнө`;
        return formatDate(date);
    };

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">Харилцагчид (CRM)</h1>
                    <p className="text-gray-500 mt-1">Нийт {customers.length} харилцагч</p>
                </div>
            </div>

            {/* Filters */}
            <Card>
                <CardContent className="py-4">
                    <div className="flex flex-wrap items-center gap-4">
                        {/* Search */}
                        <div className="relative flex-1 min-w-[200px] max-w-md">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                            <input
                                type="text"
                                placeholder="Нэр, утас хайх..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="w-full pl-10 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
                            />
                        </div>

                        {/* Tag Filter */}
                        <div className="flex items-center gap-2">
                            <Tag className="w-4 h-4 text-gray-400" />
                            <select
                                value={selectedTag || ''}
                                onChange={(e) => setSelectedTag(e.target.value || null)}
                                className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
                            >
                                <option value="">Бүх Tag</option>
                                {PREDEFINED_TAGS.map(tag => (
                                    <option key={tag} value={tag}>{tag}</option>
                                ))}
                            </select>
                        </div>

                        {/* Sort */}
                        <div className="flex items-center gap-2">
                            <ChevronDown className="w-4 h-4 text-gray-400" />
                            <select
                                value={sortBy}
                                onChange={(e) => setSortBy(e.target.value)}
                                className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
                            >
                                <option value="created_at">Бүртгэсэн огноо</option>
                                <option value="last_contact_at">Сүүлд харьцсан</option>
                            </select>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {loading ? (
                <div className="flex items-center justify-center h-48">
                    <Loader2 className="w-8 h-8 animate-spin text-violet-500" />
                </div>
            ) : (
                /* Customers Table */
                <Card>
                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead className="bg-gray-50 border-b border-gray-200">
                                <tr>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Харилцагч</th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Tags</th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Сүүлд харьцсан</th>
                                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Харилцсан</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {filteredCustomers.map((customer) => (
                                    <tr
                                        key={customer.id}
                                        className="hover:bg-gray-50 cursor-pointer transition-colors"
                                        onClick={() => fetchCustomerDetail(customer.id)}
                                    >
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-3">
                                                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-violet-100 to-indigo-100 flex items-center justify-center">
                                                    <User className="w-5 h-5 text-violet-600" />
                                                </div>
                                                <div>
                                                    <p className="font-medium text-gray-900">{customer.name || 'Харилцагч'}</p>
                                                    <p className="text-sm text-gray-500">{customer.phone || '-'}</p>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="flex flex-wrap gap-1">
                                                {(customer.tags || []).map((tag) => (
                                                    <span key={tag} className="px-2 py-0.5 rounded-full text-xs font-medium bg-violet-100 text-violet-700">
                                                        {tag}
                                                    </span>
                                                ))}
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-1 text-sm text-gray-600">
                                                <Clock className="w-4 h-4 text-gray-400" />
                                                {formatTime(customer.last_contact_at || customer.created_at)}
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            <span className="text-sm text-gray-600">{customer.message_count || 0} удаа</span>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </Card>
            )}

            {/* Customer Detail Modal */}
            {isDetailOpen && selectedCustomer && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
                        {/* Modal Header */}
                        <div className="flex items-center justify-between p-6 border-b border-gray-100">
                            <div className="flex items-center gap-3">
                                <div className="w-12 h-12 rounded-full bg-gradient-to-br from-violet-100 to-indigo-100 flex items-center justify-center">
                                    <User className="w-6 h-6 text-violet-600" />
                                </div>
                                <div>
                                    <h2 className="text-lg font-bold text-gray-900">
                                        {selectedCustomer.name || 'Харилцагч'}
                                    </h2>
                                    <p className="text-sm text-gray-500">
                                        Бүртгэсэн: {formatDate(selectedCustomer.created_at)}
                                    </p>
                                </div>
                            </div>
                            <div className="flex items-center gap-2">
                                {editMode ? (
                                    <button
                                        onClick={saveCustomer}
                                        disabled={saving}
                                        className="flex items-center gap-2 px-4 py-2 bg-violet-600 text-white rounded-xl text-sm font-medium hover:bg-violet-700 disabled:opacity-50"
                                    >
                                        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                                        Хадгалах
                                    </button>
                                ) : (
                                    <button
                                        onClick={() => setEditMode(true)}
                                        className="flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-700 rounded-xl text-sm font-medium hover:bg-gray-200"
                                    >
                                        <Edit2 className="w-4 h-4" />
                                        Засах
                                    </button>
                                )}
                                <button
                                    onClick={() => { setIsDetailOpen(false); setEditMode(false); }}
                                    className="p-2 hover:bg-gray-100 rounded-xl"
                                >
                                    <X className="w-5 h-5 text-gray-500" />
                                </button>
                            </div>
                        </div>

                        {/* Modal Content */}
                        <div className="p-6 space-y-6">
                            {/* Contact Info */}
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Нэр</label>
                                    {editMode ? (
                                        <input
                                            type="text"
                                            value={editForm.name}
                                            onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                                            className="w-full px-3 py-2 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-violet-500"
                                        />
                                    ) : (
                                        <p className="text-gray-900">{selectedCustomer.name || '-'}</p>
                                    )}
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Утас</label>
                                    {editMode ? (
                                        <input
                                            type="text"
                                            value={editForm.phone}
                                            onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
                                            className="w-full px-3 py-2 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-violet-500"
                                        />
                                    ) : (
                                        <p className="flex items-center gap-2 text-gray-900">
                                            <Phone className="w-4 h-4 text-gray-400" />
                                            {selectedCustomer.phone || '-'}
                                        </p>
                                    )}
                                </div>
                                <div className="col-span-2">
                                    <label className="block text-sm font-medium text-gray-700 mb-1">И-мэйл</label>
                                    {editMode ? (
                                        <input
                                            type="email"
                                            value={editForm.email}
                                            onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                                            className="w-full px-3 py-2 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-violet-500"
                                        />
                                    ) : (
                                        <p className="flex items-center gap-2 text-gray-900">
                                            <Mail className="w-4 h-4 text-gray-400" />
                                            {selectedCustomer.email || '-'}
                                        </p>
                                    )}
                                </div>
                            </div>

                            {/* Tags */}
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">Tags</label>
                                <div className="flex flex-wrap gap-2">
                                    {(selectedCustomer.tags || []).length > 0 ? (
                                        selectedCustomer.tags!.map((tag) => (
                                            <span key={tag} className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-sm font-medium bg-violet-100 text-violet-700">
                                                {tag}
                                            </span>
                                        ))
                                    ) : (
                                        <span className="text-sm text-gray-500">Tag байхгүй</span>
                                    )}
                                </div>
                            </div>

                            {/* Notes */}
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">Тэмдэглэл</label>
                                <p className="text-gray-600 bg-gray-50 p-3 rounded-xl whitespace-pre-wrap">
                                    {selectedCustomer.notes || 'Тэмдэглэл байхгүй'}
                                </p>
                            </div>

                            {/* Stats */}
                            <div className="grid grid-cols-2 gap-4">
                                <div className="bg-emerald-50 p-4 rounded-xl text-center">
                                    <p className="text-2xl font-bold text-emerald-600">
                                        {selectedCustomer.message_count || 0}
                                    </p>
                                    <p className="text-sm text-gray-600">Харилцсан</p>
                                </div>
                                <div className="bg-blue-50 p-4 rounded-xl text-center">
                                    <p className="text-2xl font-bold text-blue-600">
                                        {formatTime(selectedCustomer.created_at)}
                                    </p>
                                    <p className="text-sm text-gray-600">Бүртгэсэн</p>
                                </div>
                            </div>

                            {/* Recent Chat */}
                            {selectedCustomer.chat_history && selectedCustomer.chat_history.length > 0 && (
                                <div>
                                    <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-2">
                                        <MessageSquare className="w-4 h-4" />
                                        Сүүлийн харилцаа
                                    </label>
                                    <div className="space-y-2 max-h-48 overflow-y-auto bg-gray-50 p-3 rounded-xl">
                                        {selectedCustomer.chat_history.slice(0, 5).map((chat, i) => (
                                            <div key={i} className="text-sm">
                                                <p className="text-gray-600"><span className="font-medium">Хэрэглэгч:</span> {chat.message}</p>
                                                <p className="text-violet-600"><span className="font-medium">AI:</span> {chat.response}</p>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

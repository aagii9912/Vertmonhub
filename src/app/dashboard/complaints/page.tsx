'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import {
    AlertTriangle,
    MessageSquare,
    CheckCircle,
    Clock,
    Search,
    XCircle,
    Package,
    Truck,
    HeadphonesIcon,
    DollarSign,
    MoreHorizontal
} from 'lucide-react';

interface Complaint {
    id: string;
    shop_id: string;
    customer_id: string;
    complaint_type: 'product_quality' | 'delivery' | 'service' | 'price' | 'other';
    description: string;
    severity: 'low' | 'medium' | 'high';
    status: 'new' | 'in_progress' | 'resolved' | 'dismissed';
    resolution_notes: string | null;
    created_at: string;
    updated_at: string;
    customers?: {
        name: string | null;
        phone: string | null;
    };
}

const complaintTypeLabels: Record<string, { label: string; icon: React.ReactNode }> = {
    product_quality: { label: 'Барааны чанар', icon: <Package className="w-3.5 h-3.5" strokeWidth={1.5} /> },
    delivery: { label: 'Хүргэлт', icon: <Truck className="w-3.5 h-3.5" strokeWidth={1.5} /> },
    service: { label: 'Үйлчилгээ', icon: <HeadphonesIcon className="w-3.5 h-3.5" strokeWidth={1.5} /> },
    price: { label: 'Үнэ', icon: <DollarSign className="w-3.5 h-3.5" strokeWidth={1.5} /> },
    other: { label: 'Бусад', icon: <MoreHorizontal className="w-3.5 h-3.5" strokeWidth={1.5} /> },
};

const severityLabels: Record<string, { label: string }> = {
    low: { label: 'Бага' },
    medium: { label: 'Дунд' },
    high: { label: 'Өндөр' },
};

const statusLabels: Record<string, { label: string; icon: React.ReactNode }> = {
    new: { label: 'Шинэ', icon: <AlertTriangle className="w-3.5 h-3.5" strokeWidth={1.5} /> },
    in_progress: { label: 'Шийдвэрлэж байна', icon: <Clock className="w-3.5 h-3.5" strokeWidth={1.5} /> },
    resolved: { label: 'Шийдэгдсэн', icon: <CheckCircle className="w-3.5 h-3.5" strokeWidth={1.5} /> },
    dismissed: { label: 'Хаагдсан', icon: <XCircle className="w-3.5 h-3.5" strokeWidth={1.5} /> },
};

export default function ComplaintsPage() {
    const { shop } = useAuth();
    const queryClient = useQueryClient();
    const [statusFilter, setStatusFilter] = useState<string>('all');
    const [searchQuery, setSearchQuery] = useState('');

    const { data: complaints = [], isLoading } = useQuery<Complaint[]>({
        queryKey: ['complaints', shop?.id],
        queryFn: async () => {
            const res = await fetch('/api/dashboard/complaints', {
                headers: { 'x-shop-id': shop?.id || '' }
            });
            if (!res.ok) throw new Error('Failed to fetch complaints');
            const data = await res.json();
            return data.complaints || [];
        },
        enabled: !!shop?.id,
    });

    const updateStatusMutation = useMutation({
        mutationFn: async ({ id, status, resolution_notes }: { id: string; status: string; resolution_notes?: string }) => {
            const res = await fetch('/api/dashboard/complaints', {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                    'x-shop-id': shop?.id || ''
                },
                body: JSON.stringify({ id, status, resolution_notes })
            });
            if (!res.ok) throw new Error('Failed to update');
            return res.json();
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['complaints'] });
        }
    });

    const filteredComplaints = complaints.filter(c => {
        const matchesStatus = statusFilter === 'all' || c.status === statusFilter;
        const matchesSearch = !searchQuery ||
            c.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
            c.customers?.name?.toLowerCase().includes(searchQuery.toLowerCase());
        return matchesStatus && matchesSearch;
    });

    const stats = {
        total: complaints.length,
        new: complaints.filter(c => c.status === 'new').length,
        inProgress: complaints.filter(c => c.status === 'in_progress').length,
        resolved: complaints.filter(c => c.status === 'resolved').length,
    };

    return (
        <div className="space-y-5">
            {/* Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {[
                    { label: 'Нийт', value: stats.total, icon: MessageSquare },
                    { label: 'Шинэ', value: stats.new, icon: AlertTriangle, highlight: stats.new > 0 },
                    { label: 'Шийдвэрлэж буй', value: stats.inProgress, icon: Clock },
                    { label: 'Шийдэгдсэн', value: stats.resolved, icon: CheckCircle },
                ].map((stat) => (
                    <div key={stat.label} className="bg-[#0F0B2E] rounded-lg border border-white/[0.08] p-4">
                        <div className="flex items-center gap-3">
                            <stat.icon className="w-4 h-4 text-white/20" strokeWidth={1.5} />
                            <div>
                                <p className={`text-xl font-semibold tabular-nums tracking-[-0.02em] ${stat.highlight ? 'text-red-500' : 'text-foreground'}`}>
                                    {stat.value}
                                </p>
                                <p className="text-[11px] text-white/40 tracking-[-0.01em]">{stat.label}</p>
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            {/* Filters */}
            <div className="bg-[#0F0B2E] rounded-lg border border-white/[0.08] p-4">
                <div className="flex flex-col md:flex-row gap-3">
                    <div className="relative flex-1">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/30" strokeWidth={1.5} />
                        <input
                            type="text"
                            placeholder="Хайх..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full pl-9 pr-4 py-2 border border-white/[0.08] rounded-md text-[13px] bg-transparent focus:outline-none focus:border-[#4A7CE7] transition-colors tracking-[-0.01em] placeholder:text-white/30"
                        />
                    </div>
                    <select
                        value={statusFilter}
                        onChange={(e) => setStatusFilter(e.target.value)}
                        className="px-3 py-2 border border-white/[0.08] rounded-md text-[13px] bg-transparent focus:outline-none focus:border-[#4A7CE7] transition-colors tracking-[-0.01em]"
                    >
                        <option value="all">Бүгд</option>
                        <option value="new">Шинэ</option>
                        <option value="in_progress">Шийдвэрлэж буй</option>
                        <option value="resolved">Шийдэгдсэн</option>
                        <option value="dismissed">Хаагдсан</option>
                    </select>
                </div>
            </div>

            {/* Complaints List */}
            <div className="bg-[#0F0B2E] rounded-lg border border-white/[0.08] overflow-hidden">
                <div className="flex items-center gap-2 px-5 py-3.5 border-b border-white/[0.08]">
                    <AlertTriangle className="w-4 h-4 text-white/20" strokeWidth={1.5} />
                    <span className="text-sm font-semibold text-foreground tracking-[-0.01em]">Гомдлын жагсаалт</span>
                </div>
                <div>
                    {isLoading ? (
                        <div className="text-center py-8 text-[13px] text-white/40">Уншиж байна...</div>
                    ) : filteredComplaints.length === 0 ? (
                        <div className="text-center py-12">
                            <MessageSquare className="w-10 h-10 text-white/10 mx-auto mb-3" strokeWidth={1.5} />
                            <p className="text-[13px] text-white/40 tracking-[-0.01em]">Гомдол байхгүй байна</p>
                            <p className="text-[11px] text-white/30 mt-1">AI чатбот харилцагчдаас гомдол хүлээн авахад энд харагдана</p>
                        </div>
                    ) : (
                        <div className="divide-y divide-white/[0.04]">
                            {filteredComplaints.map((complaint) => {
                                const typeInfo = complaintTypeLabels[complaint.complaint_type] || complaintTypeLabels.other;
                                const severityInfo = severityLabels[complaint.severity] || severityLabels.medium;
                                const statusInfo = statusLabels[complaint.status] || statusLabels.new;

                                return (
                                    <div key={complaint.id} className="px-5 py-4 hover:bg-[#0D0928] transition-colors">
                                        <div className="flex items-start justify-between gap-4">
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-2 mb-2 flex-wrap">
                                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium bg-[#151040] text-foreground">
                                                        {typeInfo.icon}
                                                        {typeInfo.label}
                                                    </span>
                                                    <span className={`px-2 py-0.5 rounded-md text-[11px] font-medium ${complaint.severity === 'high'
                                                        ? 'bg-red-900/20 text-red-400'
                                                        : complaint.severity === 'medium'
                                                            ? 'bg-blue-900/20 text-blue-400'
                                                            : 'bg-[#151040] text-white/50'
                                                        }`}>
                                                        {severityInfo.label}
                                                    </span>
                                                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium ${complaint.status === 'new'
                                                        ? 'bg-red-900/20 text-red-400'
                                                        : complaint.status === 'resolved'
                                                            ? 'bg-emerald-900/20 text-emerald-400'
                                                            : 'bg-[#151040] text-white/50'
                                                        }`}>
                                                        {statusInfo.icon}
                                                        {statusInfo.label}
                                                    </span>
                                                </div>
                                                <p className="text-[13px] text-foreground mb-1 tracking-[-0.01em]">{complaint.description}</p>
                                                <div className="flex items-center gap-4 text-[12px] text-white/40">
                                                    <span>{complaint.customers?.name || 'Үл мэдэгдэх'}</span>
                                                    <span>{new Date(complaint.created_at).toLocaleDateString('mn-MN')}</span>
                                                </div>
                                            </div>
                                            {complaint.status !== 'resolved' && complaint.status !== 'dismissed' && (
                                                <div className="flex items-center gap-1.5 shrink-0">
                                                    {complaint.status === 'new' && (
                                                        <button
                                                            onClick={() => updateStatusMutation.mutate({
                                                                id: complaint.id,
                                                                status: 'in_progress'
                                                            })}
                                                            disabled={updateStatusMutation.isPending}
                                                            className="px-3 py-1.5 text-[12px] font-medium border border-white/[0.08] rounded-md hover:border-white/[0.15] transition-colors text-foreground tracking-[-0.01em]"
                                                        >
                                                            Хүлээн авах
                                                        </button>
                                                    )}
                                                    <button
                                                        onClick={() => updateStatusMutation.mutate({
                                                            id: complaint.id,
                                                            status: 'resolved',
                                                            resolution_notes: 'Шийдэгдсэн'
                                                        })}
                                                        disabled={updateStatusMutation.isPending}
                                                        className="px-3 py-1.5 text-[12px] font-medium bg-[#4A7CE7] text-white rounded-md hover:bg-[#3A6BD4] transition-colors tracking-[-0.01em]"
                                                    >
                                                        Шийдсэн
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { Calendar, MapPin, Phone, User, X, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/dashboard/PageHeader';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { Spinner } from '@/components/ui/Spinner';
import { cn } from '@/lib/utils';

interface Viewing {
    id: string;
    scheduled_at: string;
    status: 'scheduled' | 'completed' | 'cancelled' | 'no_show';
    lead_id: string;
    property_id: string;
    customer_feedback: string | null;
    agent_notes: string | null;
    lead?: { customer_name: string; customer_phone: string };
    property?: { name: string; district: string };
}

type StatusKey = Viewing['status'];

const STATUS_BADGES: Record<StatusKey, { label: string; variant: 'info' | 'success' | 'danger' | 'default' }> = {
    scheduled: { label: 'Товлосон', variant: 'info' },
    completed: { label: 'Дуусгасан', variant: 'success' },
    cancelled: { label: 'Цуцалсан', variant: 'danger' },
    no_show: { label: 'Ирээгүй', variant: 'default' },
};

export default function ViewingsPage() {
    const { shop } = useAuth();
    const [viewings, setViewings] = useState<Viewing[]>([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState<string>('all');

    useEffect(() => {
        if (!shop?.id) return;
        fetchViewings();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [shop?.id]);

    async function fetchViewings() {
        const { data } = await supabase
            .from('property_viewings')
            .select('*, leads(customer_name, customer_phone), properties(name, district)')
            .eq('shop_id', shop!.id)
            .order('scheduled_at', { ascending: true });

        setViewings(
            (data || []).map((v: any) => ({
                ...v,
                lead: v.leads,
                property: v.properties,
            })),
        );
        setLoading(false);
    }

    async function updateStatus(id: string, status: string) {
        const { error } = await supabase
            .from('property_viewings')
            .update({ status })
            .eq('id', id);
        if (error) {
            toast.error('Алдаа');
            return;
        }
        setViewings((prev) => prev.map((v) => (v.id === id ? { ...v, status: status as StatusKey } : v)));
        toast.success('Статус шинэчилсэн');
    }

    const filtered = filter === 'all' ? viewings : viewings.filter((v) => v.status === filter);
    const upcoming = viewings.filter((v) => v.status === 'scheduled' && new Date(v.scheduled_at) > new Date());

    const today = new Date().toDateString();
    const todayViewings = viewings.filter((v) => new Date(v.scheduled_at).toDateString() === today);

    return (
        <div>
            <PageHeader
                eyebrow="Үзлэг"
                title="Үзлэгүүд"
                subtitle={`Өнөөдөр ${todayViewings.length} үзлэг, нийт ${upcoming.length} хүлээгдэж байна`}
            />

            {/* Stat filter buttons */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
                {(Object.entries(STATUS_BADGES) as [StatusKey, typeof STATUS_BADGES[StatusKey]][]).map(([key, badge]) => {
                    const count = viewings.filter((v) => v.status === key).length;
                    const active = filter === key;
                    return (
                        <button
                            key={key}
                            onClick={() => setFilter(active ? 'all' : key)}
                            className={cn(
                                'p-4 rounded-xl border transition-colors text-left',
                                active ? 'border-brand bg-brand-soft/40' : 'border-border bg-surface hover:border-border-strong',
                            )}
                        >
                            <p className="heading-display text-2xl text-foreground tabular-nums">{count}</p>
                            <p className="text-xs font-medium uppercase tracking-[0.06em] text-muted-foreground/80 mt-1">
                                {badge.label}
                            </p>
                        </button>
                    );
                })}
            </div>

            {/* Viewings List */}
            <div className="space-y-2">
                {loading ? (
                    <Card>
                        <div className="flex items-center justify-center py-16">
                            <Spinner size="lg" />
                        </div>
                    </Card>
                ) : filtered.length === 0 ? (
                    <Card>
                        <div className="py-12">
                            <EmptyState icon={<Calendar className="w-7 h-7" />} title="Үзлэг олдсонгүй" />
                        </div>
                    </Card>
                ) : (
                    filtered.map((v) => {
                        const isToday = new Date(v.scheduled_at).toDateString() === today;
                        const badge = STATUS_BADGES[v.status] || STATUS_BADGES.scheduled;

                        return (
                            <div
                                key={v.id}
                                className={cn(
                                    'bg-surface rounded-xl border p-4 transition-colors',
                                    isToday ? 'border-brand ring-2 ring-brand-soft/40' : 'border-border hover:border-border-strong',
                                )}
                            >
                                <div className="flex items-start justify-between gap-3">
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center flex-wrap gap-2 mb-2">
                                            <Calendar className="w-4 h-4 text-muted-foreground/70" />
                                            <span
                                                className={cn(
                                                    'text-sm font-semibold tabular-nums',
                                                    isToday ? 'text-brand-strong' : 'text-foreground',
                                                )}
                                            >
                                                {new Date(v.scheduled_at).toLocaleDateString('mn-MN')}
                                            </span>
                                            <span className="text-xs text-muted-foreground tabular-nums">
                                                {new Date(v.scheduled_at).toLocaleTimeString('mn-MN', {
                                                    hour: '2-digit',
                                                    minute: '2-digit',
                                                })}
                                            </span>
                                            {isToday && (
                                                <Badge variant="brand" size="sm">
                                                    ӨНӨӨДӨР
                                                </Badge>
                                            )}
                                        </div>
                                        <p className="text-sm font-medium text-foreground flex items-center gap-1.5">
                                            <User className="w-3.5 h-3.5 text-muted-foreground/70" />
                                            {v.lead?.customer_name || 'Тодорхойгүй'}
                                        </p>
                                        {v.lead?.customer_phone && (
                                            <p className="text-xs text-muted-foreground flex items-center gap-1.5 mt-1">
                                                <Phone className="w-3 h-3" /> {v.lead.customer_phone}
                                            </p>
                                        )}
                                        {v.property && (
                                            <p className="text-xs text-muted-foreground flex items-center gap-1.5 mt-0.5">
                                                <MapPin className="w-3 h-3" /> {v.property.name} • {v.property.district}
                                            </p>
                                        )}
                                    </div>
                                    <div className="flex flex-col items-end gap-2 shrink-0">
                                        <Badge variant={badge.variant}>{badge.label}</Badge>
                                        {v.status === 'scheduled' && (
                                            <div className="flex gap-1">
                                                <button
                                                    onClick={() => updateStatus(v.id, 'completed')}
                                                    className="p-1.5 hover:bg-status-success-soft rounded-md text-status-success transition-colors"
                                                    title="Дуусгасан"
                                                >
                                                    <CheckCircle2 className="w-4 h-4" />
                                                </button>
                                                <button
                                                    onClick={() => updateStatus(v.id, 'no_show')}
                                                    className="p-1.5 hover:bg-surface-2 rounded-md text-muted-foreground transition-colors"
                                                    title="Ирээгүй"
                                                >
                                                    <X className="w-4 h-4" />
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        );
                    })
                )}
            </div>
        </div>
    );
}

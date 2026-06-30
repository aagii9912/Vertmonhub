'use client';

import { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { Calendar, MapPin, Phone, User, X, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/dashboard/PageHeader';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { StatusPill } from '@/components/ui/StatusPill';
import { DateText } from '@/components/ui/DateText';
import {
    Sheet,
    SheetContent,
    SheetHeader,
    SheetFooter,
    SheetTitle,
    SheetDescription,
} from '@/components/ui/Sheet';
import { EmptyState } from '@/components/ui/EmptyState';
import { Spinner } from '@/components/ui/Spinner';
import { useReducedMotion } from '@/hooks/useReducedMotion';
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

const STATUS_BADGES: Record<
    StatusKey,
    { label: string; variant: 'info' | 'success' | 'danger' | 'neutral' }
> = {
    scheduled: { label: 'Товлосон', variant: 'info' },
    completed: { label: 'Дуусгасан', variant: 'success' },
    cancelled: { label: 'Цуцалсан', variant: 'danger' },
    no_show: { label: 'Ирээгүй', variant: 'neutral' },
};

export default function ViewingsPage() {
    const { shop } = useAuth();
    const [viewings, setViewings] = useState<Viewing[]>([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState<string>('all');
    const [selected, setSelected] = useState<Viewing | null>(null);
    const reduced = useReducedMotion();

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
            .is('deleted_at', null)
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
        setSelected((prev) => (prev && prev.id === id ? { ...prev, status: status as StatusKey } : prev));
        toast.success('Статус шинэчилсэн');
    }

    const filtered = filter === 'all' ? viewings : viewings.filter((v) => v.status === filter);
    const upcoming = viewings.filter((v) => v.status === 'scheduled' && new Date(v.scheduled_at) > new Date());

    const today = new Date().toDateString();
    const todayViewings = viewings.filter((v) => new Date(v.scheduled_at).toDateString() === today);

    const selectedBadge = selected ? STATUS_BADGES[selected.status] || STATUS_BADGES.scheduled : null;

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
                                'p-4 rounded-xl border transition-colors text-left outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40 focus-visible:ring-offset-2 focus-visible:ring-offset-background',
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
                    filtered.map((v, i) => {
                        const isToday = new Date(v.scheduled_at).toDateString() === today;
                        const badge = STATUS_BADGES[v.status] || STATUS_BADGES.scheduled;

                        return (
                            <motion.div
                                key={v.id}
                                initial={reduced ? false : { opacity: 0, y: 6 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={reduced ? { duration: 0 } : { duration: 0.22, delay: Math.min(i * 0.03, 0.3) }}
                                role="button"
                                tabIndex={0}
                                onClick={() => setSelected(v)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter' || e.key === ' ') {
                                        e.preventDefault();
                                        setSelected(v);
                                    }
                                }}
                                className={cn(
                                    'bg-surface rounded-xl border p-4 transition-colors cursor-pointer outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40 focus-visible:ring-offset-2 focus-visible:ring-offset-background',
                                    isToday ? 'border-brand ring-2 ring-brand-soft/40' : 'border-border hover:border-border-strong',
                                )}
                            >
                                <div className="flex items-start justify-between gap-3">
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center flex-wrap gap-2 mb-2">
                                            <Calendar className="w-4 h-4 text-muted-foreground/70" />
                                            <DateText
                                                value={v.scheduled_at}
                                                className={cn(
                                                    'text-sm font-semibold',
                                                    isToday ? 'text-brand-strong' : 'text-foreground',
                                                )}
                                            />
                                            <DateText
                                                value={v.scheduled_at}
                                                format="datetime"
                                                className="text-xs text-muted-foreground"
                                            />
                                            {isToday && (
                                                <StatusPill variant="brand">ӨНӨӨДӨР</StatusPill>
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
                                        <StatusPill variant={badge.variant}>{badge.label}</StatusPill>
                                        {v.status === 'scheduled' && (
                                            <div className="flex gap-1">
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        updateStatus(v.id, 'completed');
                                                    }}
                                                    className="p-1.5 hover:bg-status-success-soft rounded-md text-status-success transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                                                    title="Дуусгасан"
                                                >
                                                    <CheckCircle2 className="w-4 h-4" />
                                                </button>
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        updateStatus(v.id, 'no_show');
                                                    }}
                                                    className="p-1.5 hover:bg-surface-2 rounded-md text-muted-foreground transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                                                    title="Ирээгүй"
                                                >
                                                    <X className="w-4 h-4" />
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </motion.div>
                        );
                    })
                )}
            </div>

            {/* Viewing detail drawer */}
            <Sheet open={!!selected} onOpenChange={(open) => !open && setSelected(null)}>
                <SheetContent side="right">
                    {selected && (
                        <>
                            <SheetHeader>
                                <SheetTitle>Үзлэгийн дэлгэрэнгүй</SheetTitle>
                                <SheetDescription>
                                    {selected.lead?.customer_name || 'Тодорхойгүй'}
                                </SheetDescription>
                            </SheetHeader>

                            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
                                <div className="flex items-center justify-between gap-3">
                                    {selectedBadge && (
                                        <StatusPill variant={selectedBadge.variant} dot>
                                            {selectedBadge.label}
                                        </StatusPill>
                                    )}
                                    <DateText
                                        value={selected.scheduled_at}
                                        format="datetime"
                                        className="text-sm font-semibold text-foreground"
                                    />
                                </div>

                                <div className="space-y-3">
                                    <div className="flex items-start gap-2.5">
                                        <Calendar className="w-4 h-4 text-muted-foreground/70 mt-0.5 shrink-0" />
                                        <div className="min-w-0">
                                            <p className="text-2xs uppercase tracking-[0.08em] text-muted-foreground/80">
                                                Огноо
                                            </p>
                                            <DateText
                                                value={selected.scheduled_at}
                                                format="datetime"
                                                className="text-sm text-foreground"
                                            />
                                        </div>
                                    </div>

                                    <div className="flex items-start gap-2.5">
                                        <User className="w-4 h-4 text-muted-foreground/70 mt-0.5 shrink-0" />
                                        <div className="min-w-0">
                                            <p className="text-2xs uppercase tracking-[0.08em] text-muted-foreground/80">
                                                Харилцагч
                                            </p>
                                            <p className="text-sm text-foreground">
                                                {selected.lead?.customer_name || 'Тодорхойгүй'}
                                            </p>
                                        </div>
                                    </div>

                                    {selected.lead?.customer_phone && (
                                        <div className="flex items-start gap-2.5">
                                            <Phone className="w-4 h-4 text-muted-foreground/70 mt-0.5 shrink-0" />
                                            <div className="min-w-0">
                                                <p className="text-2xs uppercase tracking-[0.08em] text-muted-foreground/80">
                                                    Утас
                                                </p>
                                                <p className="text-sm text-foreground tabular-nums">
                                                    {selected.lead.customer_phone}
                                                </p>
                                            </div>
                                        </div>
                                    )}

                                    {selected.property && (
                                        <div className="flex items-start gap-2.5">
                                            <MapPin className="w-4 h-4 text-muted-foreground/70 mt-0.5 shrink-0" />
                                            <div className="min-w-0">
                                                <p className="text-2xs uppercase tracking-[0.08em] text-muted-foreground/80">
                                                    Үл хөдлөх
                                                </p>
                                                <p className="text-sm text-foreground">
                                                    {selected.property.name} • {selected.property.district}
                                                </p>
                                            </div>
                                        </div>
                                    )}
                                </div>

                                {selected.agent_notes && (
                                    <div className="rounded-xl border border-border bg-surface-2 p-3">
                                        <p className="text-2xs uppercase tracking-[0.08em] text-muted-foreground/80 mb-1">
                                            Агентын тэмдэглэл
                                        </p>
                                        <p className="text-sm text-foreground whitespace-pre-wrap">
                                            {selected.agent_notes}
                                        </p>
                                    </div>
                                )}

                                {selected.customer_feedback && (
                                    <div className="rounded-xl border border-border bg-surface-2 p-3">
                                        <p className="text-2xs uppercase tracking-[0.08em] text-muted-foreground/80 mb-1">
                                            Харилцагчийн санал
                                        </p>
                                        <p className="text-sm text-foreground whitespace-pre-wrap">
                                            {selected.customer_feedback}
                                        </p>
                                    </div>
                                )}
                            </div>

                            {selected.status === 'scheduled' && (
                                <SheetFooter>
                                    <Button
                                        variant="outline"
                                        onClick={() => updateStatus(selected.id, 'no_show')}
                                    >
                                        <X className="w-4 h-4" />
                                        Ирээгүй
                                    </Button>
                                    <Button
                                        variant="primary"
                                        onClick={() => updateStatus(selected.id, 'completed')}
                                    >
                                        <CheckCircle2 className="w-4 h-4" />
                                        Дуусгасан
                                    </Button>
                                </SheetFooter>
                            )}
                        </>
                    )}
                </SheetContent>
            </Sheet>
        </div>
    );
}

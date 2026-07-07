'use client';

import { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { useAuth } from '@/contexts/AuthContext';
import { useDashboardMode } from '@/hooks/useDashboardMode';
import { supabase } from '@/lib/supabase';
import {
    Calendar, MapPin, Phone, User, X, CheckCircle2, Plus, Star, Search,
    Building2, UserPlus, Briefcase, FileText,
} from 'lucide-react';
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
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter,
} from '@/components/ui/Dialog';
import {
    Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/Select';
import { FormField } from '@/components/ui/FormField';
import { EmptyState } from '@/components/ui/EmptyState';
import { Spinner } from '@/components/ui/Spinner';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { cn } from '@/lib/utils';

type MeetingType = 'new_customer' | 'repeat_customer' | 'existing_buyer';

interface Viewing {
    id: string;
    scheduled_at: string;
    status: 'scheduled' | 'completed' | 'cancelled' | 'no_show';
    lead_id: string | null;
    property_id: string | null;
    customer_feedback: string | null;
    agent_notes: string | null;
    meeting_type: MeetingType | null;
    interest_level: number | null;
    completed_at: string | null;
    sales_manager_name: string | null;
    lead?: { customer_name: string; customer_phone: string } | null;
    property?: { name: string; district: string } | null;
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

const MEETING_TYPE_LABELS: Record<MeetingType, { label: string; variant: 'info' | 'brand' | 'success' }> = {
    new_customer: { label: 'Шинэ харилцагч', variant: 'info' },
    repeat_customer: { label: 'Давтан', variant: 'brand' },
    existing_buyer: { label: 'Худалдан авагч', variant: 'success' },
};

/** Date → "YYYY-MM-DDTHH:mm" (datetime-local input-д). */
function toLocalInput(d: Date): string {
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function ViewingsPage() {
    const { shop, user } = useAuth();
    // Хариуцагч менежерийн КАНОН нэр (сервер user_profiles/roster-оос) —
    // client user_metadata-тай зөрөхөөс сэргийлж attribution-д үүнийг тамгална.
    const { data: dashMode } = useDashboardMode();
    const managerName = dashMode?.managerName || user?.fullName || null;
    const [viewings, setViewings] = useState<Viewing[]>([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState<string>('all');
    const [selected, setSelected] = useState<Viewing | null>(null);
    const [showCreate, setShowCreate] = useState(false);
    const [outcomeFor, setOutcomeFor] = useState<Viewing | null>(null);
    const reduced = useReducedMotion();

    async function fetchViewings() {
        if (!shop?.id) return;
        const { data } = await supabase
            .from('property_viewings')
            .select('*, leads(customer_name, customer_phone), properties(name, district)')
            .eq('shop_id', shop.id)
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

    useEffect(() => {
        if (!shop?.id) return;
        fetchViewings();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [shop?.id]);

    async function updateStatus(id: string, status: string) {
        const patch: Record<string, unknown> = { status };
        if (status === 'completed') patch.completed_at = new Date().toISOString();
        const { error } = await supabase
            .from('property_viewings')
            .update(patch)
            .eq('id', id);
        if (error) {
            toast.error('Алдаа');
            return;
        }
        setViewings((prev) => prev.map((v) => (v.id === id ? { ...v, status: status as StatusKey } : v)));
        setSelected((prev) => (prev && prev.id === id ? { ...prev, status: status as StatusKey } : prev));
        toast.success('Статус шинэчилсэн');
    }

    /** Дуусгах + үр дүн (сонирхол, санал) бүртгэх. */
    async function completeWithOutcome(id: string, interest: number, feedback: string) {
        const nowIso = new Date().toISOString();
        const { error } = await supabase
            .from('property_viewings')
            .update({
                status: 'completed',
                completed_at: nowIso,
                interest_level: interest || null,
                customer_feedback: feedback.trim() || null,
            })
            .eq('id', id);
        if (error) {
            toast.error('Алдаа: ' + error.message);
            return;
        }
        setViewings((prev) =>
            prev.map((v) =>
                v.id === id
                    ? { ...v, status: 'completed', completed_at: nowIso, interest_level: interest || null, customer_feedback: feedback.trim() || null }
                    : v,
            ),
        );
        setOutcomeFor(null);
        toast.success('Уулзалт дуусгаж, үр дүн бүртгэлээ');
    }

    /** Шинэ уулзалт / walk-in бүртгэх. */
    async function createMeeting(form: CreateForm): Promise<boolean> {
        if (!shop?.id) return false;

        // 1) Лийд: нэр өгсөн бол олох, эс бөгөөс автоматаар үүсгэх (walk-in шийдвэр).
        let leadId: string | null = null;
        const name = form.customerName.trim();
        if (name) {
            const { data: existing } = await supabase
                .from('leads')
                .select('id')
                .eq('shop_id', shop.id)
                .is('deleted_at', null)
                .ilike('customer_name', name)
                .limit(1);
            if (existing && existing.length) {
                leadId = existing[0].id;
            } else {
                const { data: newLead, error: leadErr } = await supabase
                    .from('leads')
                    .insert({
                        shop_id: shop.id,
                        customer_name: name,
                        customer_phone: form.customerPhone.trim() || null,
                        status: form.walkIn ? 'contacted' : 'viewing_scheduled',
                        source: 'other',
                        sales_manager_name: managerName,
                    })
                    .select('id')
                    .single();
                if (leadErr) {
                    toast.error('Лийд үүсгэхэд алдаа: ' + leadErr.message);
                    return false;
                }
                leadId = newLead.id;
            }
        }

        // 2) Уулзалт
        const nowIso = new Date().toISOString();
        const scheduledIso = form.walkIn
            ? nowIso
            : (form.scheduledAt ? new Date(form.scheduledAt).toISOString() : nowIso);

        const { error } = await supabase.from('property_viewings').insert({
            shop_id: shop.id,
            property_id: form.propertyId || null,
            lead_id: leadId,
            scheduled_at: scheduledIso,
            status: form.walkIn ? 'completed' : 'scheduled',
            meeting_type: form.meetingType,
            agent_notes: form.notes.trim() || null,
            sales_manager_name: managerName,
            completed_at: form.walkIn ? nowIso : null,
            interest_level: form.walkIn && form.interest ? form.interest : null,
            customer_feedback: form.walkIn ? (form.feedback.trim() || null) : null,
        });
        if (error) {
            toast.error('Алдаа: ' + error.message);
            return false;
        }
        toast.success(form.walkIn ? 'Ирсэн уулзалт бүртгэгдлээ' : 'Уулзалт товлолоо');
        fetchViewings();
        return true;
    }

    const filtered = filter === 'all' ? viewings : viewings.filter((v) => v.status === filter);
    const upcoming = viewings.filter((v) => v.status === 'scheduled' && new Date(v.scheduled_at) > new Date());

    const today = new Date().toDateString();
    const todayViewings = viewings.filter((v) => new Date(v.scheduled_at).toDateString() === today);

    // Өнөөдөр / Удахгүй / Өнгөрсөн бүлэглэл
    const groups: { key: string; label: string; items: Viewing[] }[] = (() => {
        const now = new Date();
        const todayG: Viewing[] = [];
        const futureG: Viewing[] = [];
        const pastG: Viewing[] = [];
        for (const v of filtered) {
            const d = new Date(v.scheduled_at);
            if (d.toDateString() === today) todayG.push(v);
            else if (d > now) futureG.push(v);
            else pastG.push(v);
        }
        return [
            { key: 'today', label: 'Өнөөдөр', items: todayG },
            { key: 'future', label: 'Удахгүй', items: futureG },
            { key: 'past', label: 'Өнгөрсөн', items: pastG.reverse() },
        ].filter((g) => g.items.length > 0);
    })();

    const selectedBadge = selected ? STATUS_BADGES[selected.status] || STATUS_BADGES.scheduled : null;

    return (
        <div>
            <PageHeader
                eyebrow="Уулзалт"
                title="Уулзалтууд"
                subtitle={`Өнөөдөр ${todayViewings.length} уулзалт, нийт ${upcoming.length} хүлээгдэж байна`}
                primaryAction={
                    <Button onClick={() => setShowCreate(true)} variant="primary" size="md">
                        <Plus className="w-4 h-4" /> Шинэ уулзалт
                    </Button>
                }
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

            {/* Viewings List (Өнөөдөр / Удахгүй / Өнгөрсөн бүлэглэлтэй) */}
            <div className="space-y-6">
                {loading ? (
                    <Card>
                        <div className="flex items-center justify-center py-16">
                            <Spinner size="lg" />
                        </div>
                    </Card>
                ) : filtered.length === 0 ? (
                    <Card>
                        <div className="py-12">
                            <EmptyState
                                icon={<Calendar className="w-7 h-7" />}
                                title="Уулзалт олдсонгүй"
                                action={
                                    <Button onClick={() => setShowCreate(true)} variant="primary" size="sm">
                                        <Plus className="w-4 h-4" /> Шинэ уулзалт
                                    </Button>
                                }
                            />
                        </div>
                    </Card>
                ) : (
                    groups.map((group) => (
                        <div key={group.key} className="space-y-2">
                            <h3 className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground/80 px-1">
                                {group.label} <span className="text-muted-foreground/50">· {group.items.length}</span>
                            </h3>
                            {group.items.map((v, i) => {
                                const isToday = new Date(v.scheduled_at).toDateString() === today;
                                const badge = STATUS_BADGES[v.status] || STATUS_BADGES.scheduled;
                                const mt = v.meeting_type ? MEETING_TYPE_LABELS[v.meeting_type] : null;

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
                                                    {mt && <StatusPill variant={mt.variant}>{mt.label}</StatusPill>}
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
                                                <p className="text-xs text-muted-foreground flex items-center gap-1.5 mt-0.5">
                                                    {v.property ? (
                                                        <><MapPin className="w-3 h-3" /> {v.property.name} • {v.property.district}</>
                                                    ) : (
                                                        <><Briefcase className="w-3 h-3" /> Оффисын уулзалт (байргүй)</>
                                                    )}
                                                </p>
                                            </div>
                                            <div className="flex flex-col items-end gap-2 shrink-0">
                                                <StatusPill variant={badge.variant}>{badge.label}</StatusPill>
                                                {v.status === 'scheduled' && (
                                                    <div className="flex gap-1">
                                                        <button
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                setOutcomeFor(v);
                                                            }}
                                                            className="p-1.5 hover:bg-status-success-soft rounded-md text-status-success transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                                                            title="Дуусгаж, үр дүн бүртгэх"
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
                                                {v.status === 'completed' && v.interest_level ? (
                                                    <div className="flex items-center gap-0.5" title={`Сонирхол: ${v.interest_level}/5`}>
                                                        {[1, 2, 3, 4, 5].map((s) => (
                                                            <Star
                                                                key={s}
                                                                className={cn(
                                                                    'w-3 h-3',
                                                                    s <= (v.interest_level || 0) ? 'text-status-pending fill-current' : 'text-muted-foreground/40',
                                                                )}
                                                            />
                                                        ))}
                                                    </div>
                                                ) : null}
                                            </div>
                                        </div>
                                    </motion.div>
                                );
                            })}
                        </div>
                    ))
                )}
            </div>

            {/* Шинэ уулзалт / walk-in форм */}
            <CreateMeetingSheet
                open={showCreate}
                shopId={shop?.id || ''}
                onClose={() => setShowCreate(false)}
                onCreate={createMeeting}
            />

            {/* Дуусгах + үр дүн */}
            <OutcomeDialog
                viewing={outcomeFor}
                onClose={() => setOutcomeFor(null)}
                onSubmit={completeWithOutcome}
            />

            {/* Уулзалтын дэлгэрэнгүй drawer */}
            <Sheet open={!!selected} onOpenChange={(open) => !open && setSelected(null)}>
                <SheetContent side="right">
                    {selected && (
                        <>
                            <SheetHeader>
                                <SheetTitle>Уулзалтын дэлгэрэнгүй</SheetTitle>
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

                                    {selected.meeting_type && (
                                        <div className="flex items-start gap-2.5">
                                            <UserPlus className="w-4 h-4 text-muted-foreground/70 mt-0.5 shrink-0" />
                                            <div className="min-w-0">
                                                <p className="text-2xs uppercase tracking-[0.08em] text-muted-foreground/80">
                                                    Уулзалтын төрөл
                                                </p>
                                                <p className="text-sm text-foreground">
                                                    {MEETING_TYPE_LABELS[selected.meeting_type].label}
                                                </p>
                                            </div>
                                        </div>
                                    )}

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

                                    <div className="flex items-start gap-2.5">
                                        {selected.property ? <MapPin className="w-4 h-4 text-muted-foreground/70 mt-0.5 shrink-0" /> : <Briefcase className="w-4 h-4 text-muted-foreground/70 mt-0.5 shrink-0" />}
                                        <div className="min-w-0">
                                            <p className="text-2xs uppercase tracking-[0.08em] text-muted-foreground/80">
                                                Үл хөдлөх
                                            </p>
                                            <p className="text-sm text-foreground">
                                                {selected.property ? `${selected.property.name} • ${selected.property.district}` : 'Оффисын уулзалт (байргүй)'}
                                            </p>
                                        </div>
                                    </div>

                                    {selected.interest_level ? (
                                        <div className="flex items-start gap-2.5">
                                            <Star className="w-4 h-4 text-muted-foreground/70 mt-0.5 shrink-0" />
                                            <div className="min-w-0">
                                                <p className="text-2xs uppercase tracking-[0.08em] text-muted-foreground/80">
                                                    Сонирхол
                                                </p>
                                                <div className="flex items-center gap-0.5 mt-0.5">
                                                    {[1, 2, 3, 4, 5].map((s) => (
                                                        <Star
                                                            key={s}
                                                            className={cn('w-3.5 h-3.5', s <= (selected.interest_level || 0) ? 'text-status-pending fill-current' : 'text-muted-foreground/40')}
                                                        />
                                                    ))}
                                                </div>
                                            </div>
                                        </div>
                                    ) : null}

                                    {selected.sales_manager_name && (
                                        <div className="flex items-start gap-2.5">
                                            <User className="w-4 h-4 text-muted-foreground/70 mt-0.5 shrink-0" />
                                            <div className="min-w-0">
                                                <p className="text-2xs uppercase tracking-[0.08em] text-muted-foreground/80">
                                                    Менежер
                                                </p>
                                                <p className="text-sm text-foreground">{selected.sales_manager_name}</p>
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
                                        onClick={() => { setOutcomeFor(selected); setSelected(null); }}
                                    >
                                        <CheckCircle2 className="w-4 h-4" />
                                        Дуусгах
                                    </Button>
                                </SheetFooter>
                            )}
                            {selected.status === 'completed' && (
                                <SheetFooter>
                                    <Button
                                        variant="secondary"
                                        href={`/dashboard/contracts/generate?${new URLSearchParams({
                                            ...(selected.lead?.customer_name ? { buyerName: selected.lead.customer_name } : {}),
                                            ...(selected.lead?.customer_phone ? { buyerPhone: selected.lead.customer_phone } : {}),
                                            ...(selected.property?.name ? { propertyName: selected.property.name } : {}),
                                        }).toString()}`}
                                    >
                                        <FileText className="w-4 h-4" />
                                        Гэрээ үүсгэх
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

// ============================================
// Sub-components
// ============================================

interface CreateForm {
    walkIn: boolean;
    customerName: string;
    customerPhone: string;
    propertyId: string;
    scheduledAt: string;
    meetingType: MeetingType;
    notes: string;
    interest: number;
    feedback: string;
}

function CreateMeetingSheet({ open, shopId, onClose, onCreate }: {
    open: boolean;
    shopId: string;
    onClose: () => void;
    onCreate: (form: CreateForm) => Promise<boolean>;
}) {
    const blank: CreateForm = {
        walkIn: false,
        customerName: '',
        customerPhone: '',
        propertyId: '',
        scheduledAt: toLocalInput(new Date()),
        meetingType: 'new_customer',
        notes: '',
        interest: 0,
        feedback: '',
    };
    const [form, setForm] = useState<CreateForm>(blank);
    const [propLabel, setPropLabel] = useState('');
    const [submitting, setSubmitting] = useState(false);

    // Sheet нээгдэх бүрт цэвэрлэнэ
    useEffect(() => {
        if (open) {
            setForm({ ...blank, scheduledAt: toLocalInput(new Date()) });
            setPropLabel('');
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open]);

    async function handleSubmit() {
        if (!form.walkIn && !form.scheduledAt) {
            toast.error('Огноо/цаг сонгоно уу');
            return;
        }
        if (!form.customerName.trim()) {
            toast.error('Харилцагчийн нэр оруулна уу');
            return;
        }
        setSubmitting(true);
        const ok = await onCreate(form);
        setSubmitting(false);
        if (ok) onClose();
    }

    return (
        <Sheet open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
            <SheetContent side="right">
                <SheetHeader>
                    <SheetTitle>Шинэ уулзалт</SheetTitle>
                    <SheetDescription>
                        Товлосон эсвэл одоо ирсэн (walk-in) уулзалт бүртгэх
                    </SheetDescription>
                </SheetHeader>

                <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
                    {/* Walk-in toggle */}
                    <div className="flex items-center justify-between rounded-xl border border-border bg-surface-2 p-3">
                        <div>
                            <p className="text-sm font-medium text-foreground">Одоо ирсэн (walk-in)</p>
                            <p className="text-2xs text-muted-foreground">Ширээн дээр ирсэн хүнийг шууд бүртгэнэ</p>
                        </div>
                        <button
                            type="button"
                            role="switch"
                            aria-checked={form.walkIn}
                            onClick={() => setForm((f) => ({ ...f, walkIn: !f.walkIn }))}
                            className={cn(
                                'relative h-6 w-11 rounded-full transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40',
                                form.walkIn ? 'bg-brand' : 'bg-surface-3 border border-border',
                            )}
                        >
                            <span className={cn('absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform', form.walkIn ? 'translate-x-5' : 'translate-x-0.5')} />
                        </button>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <FormField label="Харилцагчийн нэр" htmlFor="m-name" required>
                            <input
                                id="m-name"
                                type="text"
                                value={form.customerName}
                                onChange={(e) => setForm({ ...form, customerName: e.target.value })}
                                placeholder="Нэр"
                                className="w-full px-3 py-2 bg-surface-2 border border-border rounded-md text-sm text-foreground placeholder:text-muted-foreground/60 outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40"
                            />
                        </FormField>
                        <FormField label="Утас" htmlFor="m-phone">
                            <input
                                id="m-phone"
                                type="text"
                                value={form.customerPhone}
                                onChange={(e) => setForm({ ...form, customerPhone: e.target.value })}
                                placeholder="9911..."
                                className="w-full px-3 py-2 bg-surface-2 border border-border rounded-md text-sm text-foreground placeholder:text-muted-foreground/60 outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40"
                            />
                        </FormField>
                    </div>
                    <p className="text-2xs text-muted-foreground -mt-2">
                        Энэ нэртэй лийд байхгүй бол автоматаар үүснэ.
                    </p>

                    {/* Property typeahead (заавал биш) */}
                    <PropertySearch
                        shopId={shopId}
                        label={propLabel}
                        onSelect={(p) => { setForm((f) => ({ ...f, propertyId: p?.id || '' })); setPropLabel(p ? `${p.name}${p.district ? ' • ' + p.district : ''}` : ''); }}
                    />

                    {!form.walkIn && (
                        <FormField label="Огноо ба цаг" htmlFor="m-when" required>
                            <input
                                id="m-when"
                                type="datetime-local"
                                value={form.scheduledAt}
                                onChange={(e) => setForm({ ...form, scheduledAt: e.target.value })}
                                className="w-full px-3 py-2 bg-surface-2 border border-border rounded-md text-sm text-foreground outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40"
                            />
                        </FormField>
                    )}

                    <FormField label="Уулзалтын төрөл" htmlFor="m-type">
                        <Select
                            value={form.meetingType}
                            onValueChange={(value) => setForm({ ...form, meetingType: value as MeetingType })}
                        >
                            <SelectTrigger id="m-type" className="text-sm">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="new_customer">Шинэ харилцагч</SelectItem>
                                <SelectItem value="repeat_customer">Давтан</SelectItem>
                                <SelectItem value="existing_buyer">Худалдан авагч</SelectItem>
                            </SelectContent>
                        </Select>
                    </FormField>

                    {/* Walk-in үед үр дүнг шууд авна */}
                    {form.walkIn && (
                        <div className="rounded-xl border border-border bg-surface-2 p-3 space-y-3">
                            <p className="text-2xs uppercase tracking-[0.08em] text-muted-foreground/80">Уулзалтын үр дүн</p>
                            <div>
                                <p className="text-xs text-muted-foreground mb-1.5">Сонирхлын түвшин</p>
                                <StarPicker value={form.interest} onChange={(n) => setForm({ ...form, interest: n })} />
                            </div>
                            <FormField label="Санал / тэмдэглэл" htmlFor="m-feedback">
                                <textarea
                                    id="m-feedback"
                                    value={form.feedback}
                                    onChange={(e) => setForm({ ...form, feedback: e.target.value })}
                                    rows={2}
                                    placeholder="Харилцагчийн санал, дараагийн алхам..."
                                    className="w-full px-3 py-2 bg-surface border border-border rounded-md text-sm text-foreground outline-none resize-none focus-visible:ring-[3px] focus-visible:ring-ring/40"
                                />
                            </FormField>
                        </div>
                    )}

                    <FormField label="Тэмдэглэл" htmlFor="m-notes">
                        <textarea
                            id="m-notes"
                            value={form.notes}
                            onChange={(e) => setForm({ ...form, notes: e.target.value })}
                            rows={2}
                            placeholder="Дотоод тэмдэглэл (заавал биш)"
                            className="w-full px-3 py-2 bg-surface-2 border border-border rounded-md text-sm text-foreground outline-none resize-none focus-visible:ring-[3px] focus-visible:ring-ring/40"
                        />
                    </FormField>
                </div>

                <SheetFooter>
                    <Button type="button" onClick={onClose} variant="ghost" size="md">
                        Болих
                    </Button>
                    <Button
                        type="button"
                        onClick={handleSubmit}
                        disabled={submitting || !form.customerName.trim()}
                        isLoading={submitting}
                        variant="primary"
                        size="md"
                    >
                        {!submitting && <CheckCircle2 className="w-4 h-4" />}
                        {form.walkIn ? 'Ирсэн уулзалт бүртгэх' : 'Уулзалт товлох'}
                    </Button>
                </SheetFooter>
            </SheetContent>
        </Sheet>
    );
}

/** Байр хайх typeahead (заавал биш — оффисын уулзалтад хоосон үлдээнэ). */
function PropertySearch({ shopId, label, onSelect }: {
    shopId: string;
    label: string;
    onSelect: (p: { id: string; name: string; district: string | null } | null) => void;
}) {
    const [q, setQ] = useState('');
    const [results, setResults] = useState<Array<{ id: string; name: string; district: string | null }>>([]);
    const [openList, setOpenList] = useState(false);
    const [searching, setSearching] = useState(false);

    useEffect(() => {
        if (label) return; // сонгогдсон үед хайхгүй
        const term = q.trim();
        if (term.length < 2) { setResults([]); return; }
        let cancel = false;
        setSearching(true);
        const t = setTimeout(async () => {
            const { data } = await supabase
                .from('properties')
                .select('id, name, district')
                .eq('shop_id', shopId)
                .is('deleted_at', null)
                .ilike('name', `%${term}%`)
                .limit(8);
            if (!cancel) {
                setResults(data || []);
                setOpenList(true);
                setSearching(false);
            }
        }, 300);
        return () => { cancel = true; clearTimeout(t); };
    }, [q, shopId, label]);

    if (label) {
        return (
            <div>
                <p className="text-xs font-medium text-foreground mb-1.5">Үл хөдлөх</p>
                <div className="flex items-center justify-between rounded-md border border-border bg-surface-2 px-3 py-2">
                    <span className="text-sm text-foreground truncate flex items-center gap-1.5">
                        <Building2 className="w-3.5 h-3.5 text-muted-foreground/70" /> {label}
                    </span>
                    <button
                        type="button"
                        onClick={() => { onSelect(null); setQ(''); setResults([]); }}
                        className="text-muted-foreground hover:text-foreground p-1"
                        title="Цэвэрлэх"
                    >
                        <X className="w-3.5 h-3.5" />
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="relative">
            <p className="text-xs font-medium text-foreground mb-1.5">
                Үл хөдлөх <span className="text-muted-foreground/60 font-normal">(заавал биш)</span>
            </p>
            <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground/60" />
                <input
                    type="text"
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    onFocus={() => results.length && setOpenList(true)}
                    placeholder="Байрны нэрээр хайх... (хоосон = оффисын уулзалт)"
                    className="w-full pl-9 pr-3 py-2 bg-surface-2 border border-border rounded-md text-sm text-foreground placeholder:text-muted-foreground/60 outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40"
                />
            </div>
            {openList && (q.trim().length >= 2) && (
                <div className="absolute z-10 mt-1 w-full rounded-md border border-border bg-surface shadow-lg max-h-52 overflow-y-auto">
                    {searching ? (
                        <div className="px-3 py-2 text-sm text-muted-foreground">Хайж байна...</div>
                    ) : results.length === 0 ? (
                        <div className="px-3 py-2 text-sm text-muted-foreground">Олдсонгүй</div>
                    ) : (
                        results.map((p) => (
                            <button
                                key={p.id}
                                type="button"
                                onClick={() => { onSelect(p); setOpenList(false); }}
                                className="w-full text-left px-3 py-2 text-sm text-foreground hover:bg-surface-2 flex items-center gap-2"
                            >
                                <Building2 className="w-3.5 h-3.5 text-muted-foreground/70 shrink-0" />
                                <span className="truncate">{p.name}{p.district ? ` • ${p.district}` : ''}</span>
                            </button>
                        ))
                    )}
                </div>
            )}
        </div>
    );
}

function StarPicker({ value, onChange }: { value: number; onChange: (n: number) => void }) {
    return (
        <div className="flex items-center gap-1">
            {[1, 2, 3, 4, 5].map((s) => (
                <button
                    key={s}
                    type="button"
                    onClick={() => onChange(s === value ? 0 : s)}
                    className="p-0.5 outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40 rounded"
                    title={`${s}/5`}
                >
                    <Star className={cn('w-6 h-6', s <= value ? 'text-status-pending fill-current' : 'text-muted-foreground/40')} />
                </button>
            ))}
        </div>
    );
}

function OutcomeDialog({ viewing, onClose, onSubmit }: {
    viewing: Viewing | null;
    onClose: () => void;
    onSubmit: (id: string, interest: number, feedback: string) => Promise<void>;
}) {
    const [interest, setInterest] = useState(0);
    const [feedback, setFeedback] = useState('');
    const [submitting, setSubmitting] = useState(false);

    useEffect(() => {
        if (viewing) { setInterest(viewing.interest_level || 0); setFeedback(viewing.customer_feedback || ''); }
    }, [viewing]);

    async function handle() {
        if (!viewing) return;
        setSubmitting(true);
        await onSubmit(viewing.id, interest, feedback);
        setSubmitting(false);
    }

    return (
        <Dialog open={!!viewing} onOpenChange={(o) => { if (!o) onClose(); }}>
            <DialogContent className="rounded-2xl sm:max-w-md">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <CheckCircle2 className="w-5 h-5 text-status-success" />
                        Уулзалт дуусгах
                    </DialogTitle>
                    <DialogDescription>
                        {viewing?.lead?.customer_name || 'Харилцагч'} — сонирхол ба саналыг бүртгэнэ
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-4 py-2">
                    <div>
                        <p className="text-xs text-muted-foreground mb-1.5">Сонирхлын түвшин</p>
                        <StarPicker value={interest} onChange={setInterest} />
                    </div>
                    <FormField label="Санал / тэмдэглэл" htmlFor="o-feedback">
                        <textarea
                            id="o-feedback"
                            value={feedback}
                            onChange={(e) => setFeedback(e.target.value)}
                            rows={3}
                            placeholder="Харилцагчийн санал, дараагийн алхам..."
                            className="w-full px-3 py-2 bg-surface-2 border border-border rounded-md text-sm text-foreground outline-none resize-none focus-visible:ring-[3px] focus-visible:ring-ring/40"
                        />
                    </FormField>
                </div>

                <DialogFooter>
                    <Button type="button" onClick={onClose} variant="ghost" size="md">Болих</Button>
                    <Button type="button" onClick={handle} isLoading={submitting} variant="primary" size="md">
                        {!submitting && <CheckCircle2 className="w-4 h-4" />}
                        Дуусгах
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

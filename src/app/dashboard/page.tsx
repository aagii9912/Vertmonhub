'use client';

import { useState } from 'react';
import Link from 'next/link';
import { motion } from 'motion/react';
import { StatsCard } from '@/components/dashboard/StatsCard';
import { AskAIHero } from '@/components/dashboard/AskAIHero';
import { SalesTargetWidget } from '@/components/dashboard/SalesTargetWidget';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { StatusPill } from '@/components/ui/StatusPill';
import { EmptyState } from '@/components/ui/EmptyState';
import { PullToRefresh } from '@/components/ui/PullToRefresh';
import { KpiGridSkeleton } from '@/components/ui/LoadingSkeleton';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/Select';
import { useAuth } from '@/contexts/AuthContext';
import { useDashboard } from '@/hooks/useDashboard';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { formatTimeAgo, formatShortDate } from '@/lib/utils/date';
import { cn } from '@/lib/utils';
import {
    Building2,
    Users,
    FileText,
    Clock,
    ArrowRight,
    RefreshCw,
    Calendar,
    Eye,
    MapPin,
} from 'lucide-react';

const TIME_FILTER_OPTIONS = [
    { value: 'today', label: 'Өнөөдөр' },
    { value: 'week', label: '7 хоног' },
    { value: 'month', label: 'Сар' },
] as const;

type TimeFilter = (typeof TIME_FILTER_OPTIONS)[number]['value'];

const LEAD_STATUS_VARIANT: Record<
    string,
    { label: string; variant: 'info' | 'pending' | 'success' | 'neutral' }
> = {
    new: { label: 'Шинэ', variant: 'info' },
    contacted: { label: 'Холбогдсон', variant: 'pending' },
    qualified: { label: 'Баталгаажсан', variant: 'success' },
};

export default function DashboardPage() {
    const { loading: authLoading } = useAuth();
    const reduced = useReducedMotion();
    const [timeFilter, setTimeFilter] = useState<TimeFilter>('today');

    const { data, isLoading, isError, refetch, isRefetching } = useDashboard(timeFilter);

    const stats = data?.stats || { totalProperties: 0, totalLeads: 0, monthlyViewings: 0, pendingContracts: 0 };
    const recentLeads = data?.recentLeads || [];
    const upcomingViewings = data?.upcomingViewings || [];

    if (isLoading || authLoading) {
        return <KpiGridSkeleton />;
    }

    const handleRefresh = async () => {
        await refetch();
    };

    if (isError) {
        return (
            <div className="flex flex-col items-center justify-center gap-4 py-20 text-center">
                <div className="w-12 h-12 rounded-full bg-status-danger-soft flex items-center justify-center">
                    <RefreshCw className="w-6 h-6 text-status-danger" />
                </div>
                <div>
                    <p className="font-medium text-foreground">Мэдээлэл ачаалахад алдаа гарлаа</p>
                    <p className="text-sm text-muted-foreground mt-1">Сүлжээгээ шалгаад дахин оролдоно уу</p>
                </div>
                <Button onClick={() => refetch()} variant="secondary" size="sm">
                    <RefreshCw className="w-4 h-4 mr-2" /> Дахин оролдох
                </Button>
            </div>
        );
    }

    const STAT_CARDS = [
        { title: 'Нийт байр', value: stats.totalProperties.toString(), icon: Building2, iconColor: 'brand' as const },
        { title: 'Нийт лийд', value: stats.totalLeads.toString(), icon: Users, iconColor: 'success' as const },
        { title: 'Уулзалт (сар)', value: stats.monthlyViewings.toString(), icon: Eye, iconColor: 'info' as const },
        {
            title: 'Хүлээгдэж буй гэрээ',
            value: stats.pendingContracts.toString(),
            icon: FileText,
            iconColor: 'warning' as const,
        },
    ];

    return (
        <PullToRefresh onRefresh={handleRefresh}>
            <div className="mx-auto w-full max-w-[1440px] space-y-6 md:space-y-8">
                {/* AI Orchestrator launcher — нүүрэн дээрх гол хэрэгсэл */}
                <AskAIHero />

                {/* Toolbar */}
                <div className="flex items-center justify-end gap-2">
                    <Select value={timeFilter} onValueChange={(v) => setTimeFilter(v as TimeFilter)}>
                        <SelectTrigger className="h-9 w-36" aria-label="Хугацааны шүүлтүүр">
                            <span className="flex items-center gap-2">
                                <Calendar className="size-4 text-muted-foreground/70" />
                                <SelectValue />
                            </span>
                        </SelectTrigger>
                        <SelectContent>
                            {TIME_FILTER_OPTIONS.map((option) => (
                                <SelectItem key={option.value} value={option.value}>
                                    {option.label}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>

                    <Button
                        onClick={() => refetch()}
                        disabled={isRefetching}
                        variant="secondary"
                        size="sm"
                        className="h-9 w-9 p-0"
                        title="Шинэчлэх"
                    >
                        <RefreshCw className={cn('w-4 h-4', isRefetching && 'animate-spin')} />
                    </Button>
                </div>

                {/* Stats Grid */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
                    {STAT_CARDS.map((card, i) => (
                        <motion.div
                            key={card.title}
                            initial={reduced ? false : { opacity: 0, y: 8 }}
                            animate={reduced ? undefined : { opacity: 1, y: 0 }}
                            transition={reduced ? undefined : { duration: 0.26, delay: i * 0.03, ease: 'easeOut' }}
                        >
                            <StatsCard title={card.title} value={card.value} icon={card.icon} iconColor={card.iconColor} />
                        </motion.div>
                    ))}
                </div>

                {/* Main Content Grid */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    {/* Recent Leads */}
                    <div className="lg:col-span-2">
                        <Card>
                            <CardHeader className="flex flex-row items-center justify-between py-3 md:py-4">
                                <CardTitle className="flex items-center gap-2 text-base md:text-lg">
                                    <Users className="w-4 h-4 md:w-5 md:h-5 text-brand" />
                                    Сүүлийн лийдүүд
                                </CardTitle>
                                <Link href="/dashboard/leads">
                                    <Button variant="ghost" size="sm" className="h-8 text-xs md:text-sm">
                                        Бүгдийг <ArrowRight className="w-3 h-3 md:w-4 md:h-4 ml-1" />
                                    </Button>
                                </Link>
                            </CardHeader>
                            <CardContent className="p-0">
                                <div className="divide-y divide-border/60">
                                    {recentLeads.length > 0 ? (
                                        recentLeads.slice(0, 5).map((lead: any, i: number) => {
                                            const status = LEAD_STATUS_VARIANT[lead.status] || {
                                                label: lead.status || 'Шинэ',
                                                variant: 'neutral' as const,
                                            };
                                            return (
                                                <motion.div
                                                    key={lead.id}
                                                    initial={reduced ? false : { opacity: 0, y: 6 }}
                                                    animate={reduced ? undefined : { opacity: 1, y: 0 }}
                                                    transition={
                                                        reduced
                                                            ? undefined
                                                            : { duration: 0.22, delay: i * 0.03, ease: 'easeOut' }
                                                    }
                                                >
                                                    <Link
                                                        href="/dashboard/leads"
                                                        className="px-4 md:px-6 py-3 md:py-4 flex items-center justify-between hover:bg-surface-2/60 transition-colors block"
                                                    >
                                                        <div className="flex items-center gap-3 md:gap-4 overflow-hidden">
                                                            <div className="w-9 h-9 md:w-10 md:h-10 rounded-md bg-brand-soft flex items-center justify-center flex-shrink-0">
                                                                <Users className="w-4 h-4 md:w-5 md:h-5 text-brand-strong" />
                                                            </div>
                                                            <div className="min-w-0">
                                                                <p className="font-medium text-sm md:text-base text-foreground truncate">
                                                                    {lead.customer_name || 'Лийд'}
                                                                </p>
                                                                <p className="text-xs text-muted-foreground truncate">
                                                                    {lead.customer_phone || lead.customer_email || 'Холбоо барих'} • {formatTimeAgo(lead.created_at)}
                                                                </p>
                                                            </div>
                                                        </div>
                                                        <div className="flex items-center gap-2 pl-2">
                                                            <StatusPill variant={status.variant}>{status.label}</StatusPill>
                                                        </div>
                                                    </Link>
                                                </motion.div>
                                            );
                                        })
                                    ) : (
                                        <EmptyState
                                            icon={<Users className="w-7 h-7" />}
                                            title="Лийд байхгүй"
                                            description="Шинэ лийд орж ирэхэд энд харагдана"
                                        />
                                    )}
                                </div>
                            </CardContent>
                        </Card>
                    </div>

                    {/* Upcoming Viewings + My Sales Target */}
                    <div className="space-y-6">
                        {/* Менежерийн борлуулалтын төлөвлөгөө (тохируулсан үед л харагдана) */}
                        <SalesTargetWidget />

                        <Card>
                            <CardHeader className="py-3">
                                <CardTitle className="flex items-center gap-2 text-base">
                                    <Eye className="w-4 h-4 text-status-info" />
                                    Ойролцоох уулзалтууд
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="p-0">
                                <div className="divide-y divide-border/60">
                                    {upcomingViewings.length > 0 ? (
                                        upcomingViewings.slice(0, 3).map((v: any, i: number) => (
                                            <motion.div
                                                key={v.id}
                                                initial={reduced ? false : { opacity: 0, y: 6 }}
                                                animate={reduced ? undefined : { opacity: 1, y: 0 }}
                                                transition={
                                                    reduced
                                                        ? undefined
                                                        : { duration: 0.22, delay: i * 0.03, ease: 'easeOut' }
                                                }
                                            >
                                                <Link
                                                    href={
                                                        v.property_id
                                                            ? `/dashboard/properties/${v.property_id}`
                                                            : '/dashboard/viewings'
                                                    }
                                                    className="block px-4 py-3 hover:bg-surface-2/60 transition-colors"
                                                >
                                                    <div className="flex items-center gap-2">
                                                        <Clock className="w-3.5 h-3.5 text-muted-foreground/70" />
                                                        <span className="text-sm font-medium text-foreground tabular-nums">
                                                            {v.scheduled_at ? formatShortDate(v.scheduled_at) : 'TBD'}
                                                        </span>
                                                    </div>
                                                    <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                                                        <MapPin className="w-3 h-3" />
                                                        {v.properties?.name || v.agent_notes || 'Уулзалт'}
                                                    </p>
                                                </Link>
                                            </motion.div>
                                        ))
                                    ) : (
                                        <EmptyState
                                            icon={<Eye className="w-7 h-7" />}
                                            title="Товлосон уулзалт байхгүй"
                                        />
                                    )}
                                </div>
                            </CardContent>
                        </Card>
                    </div>
                </div>
            </div>
        </PullToRefresh>
    );
}

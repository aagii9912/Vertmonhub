'use client';

import { useState } from 'react';
import Link from 'next/link';
import { StatsCard } from '@/components/dashboard/StatsCard';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { PullToRefresh } from '@/components/ui/PullToRefresh';
import { DashboardSkeleton } from '@/components/ui/LoadingSkeleton';
import { useAuth } from '@/contexts/AuthContext';
import { useDashboard } from '@/hooks/useDashboard';
import { formatTimeAgo } from '@/lib/utils/date';
import { cn } from '@/lib/utils';
import {
    Building2,
    Users,
    FileText,
    Clock,
    ArrowRight,
    RefreshCw,
    Calendar,
    ChevronDown,
    Eye,
    MapPin,
} from 'lucide-react';

const TIME_FILTER_OPTIONS = [
    { value: 'today', label: 'Өнөөдөр' },
    { value: 'week', label: '7 хоног' },
    { value: 'month', label: 'Сар' },
] as const;

type TimeFilter = (typeof TIME_FILTER_OPTIONS)[number]['value'];

const LEAD_STATUS_VARIANT: Record<string, { label: string; variant: 'info' | 'warning' | 'success' | 'default' }> = {
    new: { label: 'Шинэ', variant: 'info' },
    contacted: { label: 'Холбогдсон', variant: 'warning' },
    qualified: { label: 'Баталгаажсан', variant: 'success' },
};

export default function DashboardPage() {
    const { loading: authLoading } = useAuth();
    const [timeFilter, setTimeFilter] = useState<TimeFilter>('today');

    const { data, isLoading, refetch, isRefetching } = useDashboard(timeFilter);

    const stats = data?.stats || { totalProperties: 0, totalLeads: 0, monthlyViewings: 0, pendingContracts: 0 };
    const recentLeads = data?.recentLeads || [];
    const upcomingViewings = data?.upcomingViewings || [];

    if (isLoading || authLoading) {
        return <DashboardSkeleton />;
    }

    const handleRefresh = async () => {
        await refetch();
    };

    return (
        <PullToRefresh onRefresh={handleRefresh}>
            <div className="space-y-6 md:space-y-8">
                {/* Toolbar */}
                <div className="flex items-center justify-end gap-2">
                    <div className="relative">
                        <button
                            onClick={() => document.getElementById('time-filter-dropdown')?.classList.toggle('hidden')}
                            onBlur={() =>
                                setTimeout(() => document.getElementById('time-filter-dropdown')?.classList.add('hidden'), 200)
                            }
                            className="flex items-center gap-2 px-3 py-2 bg-surface rounded-md border border-border text-sm font-medium text-foreground hover:bg-surface-2 transition-colors"
                        >
                            <Calendar className="w-4 h-4 text-muted-foreground/70" />
                            {TIME_FILTER_OPTIONS.find((o) => o.value === timeFilter)?.label}
                            <ChevronDown className="w-3 h-3 text-muted-foreground/70" />
                        </button>
                        <div
                            id="time-filter-dropdown"
                            className="hidden absolute right-0 mt-1 w-32 bg-surface rounded-md shadow-lg border border-border z-10 overflow-hidden"
                        >
                            {TIME_FILTER_OPTIONS.map((option) => (
                                <button
                                    key={option.value}
                                    onClick={() => setTimeFilter(option.value)}
                                    className={cn(
                                        'w-full text-left px-4 py-2 text-sm hover:bg-surface-2 transition-colors',
                                        timeFilter === option.value
                                            ? 'text-brand-strong font-medium bg-brand-soft/40'
                                            : 'text-foreground',
                                    )}
                                >
                                    {option.label}
                                </button>
                            ))}
                        </div>
                    </div>

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
                    <StatsCard title="Нийт байр" value={stats.totalProperties.toString()} icon={Building2} iconColor="brand" />
                    <StatsCard title="Нийт лийд" value={stats.totalLeads.toString()} icon={Users} iconColor="success" />
                    <StatsCard title="Үзлэг (сар)" value={stats.monthlyViewings.toString()} icon={Eye} iconColor="info" />
                    <StatsCard
                        title="Хүлээгдэж буй гэрээ"
                        value={stats.pendingContracts.toString()}
                        icon={FileText}
                        iconColor="warning"
                    />
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
                                        recentLeads.slice(0, 5).map((lead: any) => {
                                            const status = LEAD_STATUS_VARIANT[lead.status] || {
                                                label: lead.status || 'Шинэ',
                                                variant: 'default' as const,
                                            };
                                            return (
                                                <Link
                                                    key={lead.id}
                                                    href="/dashboard/leads"
                                                    className="px-4 md:px-6 py-3 md:py-4 flex items-center justify-between hover:bg-surface-2/60 transition-colors block"
                                                >
                                                    <div className="flex items-center gap-3 md:gap-4 overflow-hidden">
                                                        <div className="w-9 h-9 md:w-10 md:h-10 rounded-md bg-brand-soft flex items-center justify-center flex-shrink-0">
                                                            <Users className="w-4 h-4 md:w-5 md:h-5 text-brand-strong" />
                                                        </div>
                                                        <div className="min-w-0">
                                                            <p className="font-medium text-sm md:text-base text-foreground truncate">
                                                                {lead.name || 'Лийд'}
                                                            </p>
                                                            <p className="text-xs text-muted-foreground truncate">
                                                                {lead.phone || lead.email || 'Холбоо барих'} • {formatTimeAgo(lead.created_at)}
                                                            </p>
                                                        </div>
                                                    </div>
                                                    <div className="flex items-center gap-2 pl-2">
                                                        <Badge variant={status.variant}>{status.label}</Badge>
                                                    </div>
                                                </Link>
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

                    {/* Upcoming Viewings */}
                    <div className="space-y-6">
                        <Card>
                            <CardHeader className="py-3">
                                <CardTitle className="flex items-center gap-2 text-base">
                                    <Eye className="w-4 h-4 text-status-info" />
                                    Ойролцоох үзлэгүүд
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="p-0">
                                <div className="divide-y divide-border/60">
                                    {upcomingViewings.length > 0 ? (
                                        upcomingViewings.slice(0, 3).map((v: any) => (
                                            <div key={v.id} className="px-4 py-3 hover:bg-surface-2/60 transition-colors">
                                                <div className="flex items-center gap-2">
                                                    <Clock className="w-3.5 h-3.5 text-muted-foreground/70" />
                                                    <span className="text-sm font-medium text-foreground tabular-nums">
                                                        {v.scheduled_at ? new Date(v.scheduled_at).toLocaleDateString('mn-MN') : 'TBD'}
                                                    </span>
                                                </div>
                                                <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                                                    <MapPin className="w-3 h-3" />
                                                    {v.properties?.title || v.notes || 'Үзлэг'}
                                                </p>
                                            </div>
                                        ))
                                    ) : (
                                        <EmptyState
                                            icon={<Eye className="w-7 h-7" />}
                                            title="Товлосон үзлэг байхгүй"
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

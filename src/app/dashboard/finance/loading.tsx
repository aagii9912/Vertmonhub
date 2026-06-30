import {
    StatsCardSkeleton,
    ChartSkeleton,
    TableSkeleton,
    Skeleton,
} from '@/components/ui/LoadingSkeleton';

export default function Loading() {
    return (
        <div className="space-y-4 md:space-y-6">
            {/* Header */}
            <div className="flex items-start justify-between gap-4">
                <div className="space-y-2">
                    <Skeleton className="h-7 w-48" />
                    <Skeleton className="h-4 w-64" />
                </div>
                <Skeleton className="h-10 w-28 rounded-md" />
            </div>

            {/* KPI row */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-6">
                <StatsCardSkeleton />
                <StatsCardSkeleton />
                <StatsCardSkeleton />
                <StatsCardSkeleton />
            </div>

            {/* Chart + breakdown */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <ChartSkeleton className="lg:col-span-2" />
                <div className="bg-surface rounded-xl border border-border p-4 md:p-6">
                    <Skeleton className="h-5 w-32 mb-4" />
                    <TableSkeleton rows={4} />
                </div>
            </div>
        </div>
    );
}

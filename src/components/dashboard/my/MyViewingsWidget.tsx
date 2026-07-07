'use client';

import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { formatDate } from '@/lib/utils/date';
import type { MyStatsViewing } from '@/hooks/useMyStats';
import { Eye, Clock, MapPin } from 'lucide-react';

/** «Миний уулзалтууд» — товлогдсон ойрын уулзалтууд. */
export function MyViewingsWidget({ viewings }: { viewings: MyStatsViewing[] }) {
    return (
        <Card>
            <CardHeader className="py-3">
                <CardTitle className="flex items-center gap-2 text-base">
                    <Eye className="w-4 h-4 text-status-info" />
                    Миний уулзалтууд
                </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
                <div className="divide-y divide-border/60">
                    {viewings.length > 0 ? (
                        viewings.map((v) => (
                            <Link
                                key={v.id}
                                href="/dashboard/viewings"
                                className="block px-4 py-3 hover:bg-surface-2/60 transition-colors"
                            >
                                <div className="flex items-center gap-2">
                                    <Clock className="w-3.5 h-3.5 text-muted-foreground/70" />
                                    <span className="text-sm font-medium text-foreground tabular-nums">
                                        {formatDate(v.scheduled_at)}
                                    </span>
                                </div>
                                <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                                    <MapPin className="w-3 h-3" />
                                    {v.property_name || 'Уулзалт'}
                                    {v.customer_name ? ` · ${v.customer_name}` : ''}
                                </p>
                            </Link>
                        ))
                    ) : (
                        <EmptyState icon={<Eye className="w-7 h-7" />} title="Товлосон уулзалт байхгүй" />
                    )}
                </div>
            </CardContent>
        </Card>
    );
}

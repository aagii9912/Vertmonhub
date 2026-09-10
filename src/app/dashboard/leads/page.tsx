'use client';

import { Suspense } from 'react';
import { LeadsPage } from '@/components/leads/LeadsPage';
import { KpiGridSkeleton } from '@/components/ui/LoadingSkeleton';

/**
 * /dashboard/leads — v2 лидийн жагсаалт (хүснэгт / split view).
 * useSearchParams() шаардлагаар Suspense-д ороосон.
 */
export default function LeadsRoute() {
    return (
        <Suspense fallback={<KpiGridSkeleton />}>
            <LeadsPage />
        </Suspense>
    );
}

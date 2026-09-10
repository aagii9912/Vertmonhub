'use client';

import { Suspense } from 'react';
import { ViewingsPage } from '@/components/viewings/ViewingsPage';
import { KpiGridSkeleton } from '@/components/ui/LoadingSkeleton';

/** /dashboard/viewings — v2 уулзалтын жагсаалт (өдрөөр), товлох/үр дүн sheet. */
export default function ViewingsRoute() {
    return (
        <Suspense fallback={<KpiGridSkeleton />}>
            <ViewingsPage />
        </Suspense>
    );
}

'use client';

import { Suspense } from 'react';
import { ViewingsPage } from '@/components/viewings/ViewingsPage';
import { KpiGridSkeleton } from '@/components/ui/LoadingSkeleton';

/** /dashboard/viewings — v3 «Уулзалт»: өдрийн хуваарь, ойрын 7 хоног, товлох/үр дүн sheet. */
export default function ViewingsRoute() {
    return (
        <Suspense fallback={<KpiGridSkeleton />}>
            <ViewingsPage />
        </Suspense>
    );
}

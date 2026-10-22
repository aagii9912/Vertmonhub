'use client';

import { Suspense } from 'react';
import { ContractsPage } from '@/components/contracts/ContractsPage';
import { PageSkeleton } from '@/components/ui/LoadingSkeleton';

/** /dashboard/contracts — гэрээний жагсаалт (HUB загвар). useSearchParams() (`?filter=`) шаардлагаар Suspense-д ороосон. */
export default function ContractsRoute() {
    return (
        <Suspense fallback={<PageSkeleton rows={8} showStats />}>
            <ContractsPage />
        </Suspense>
    );
}

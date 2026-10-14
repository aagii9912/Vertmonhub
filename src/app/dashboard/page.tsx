'use client';

import { Suspense, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { useAuth } from '@/contexts/AuthContext';
import { useDashboardMode } from '@/hooks/useDashboardMode';
import { KpiGridSkeleton } from '@/components/ui/LoadingSkeleton';
import { TodayDashboard } from '@/components/dashboard/today/TodayDashboard';
import { DirectorDashboard } from '@/components/dashboard/director/DirectorDashboard';
import { MarketingDashboard } from '@/components/dashboard/marketing/MarketingDashboard';
import { ManagerSelector } from '@/components/dashboard/ManagerSelector';
import { WorkspaceIntro, type DashboardView } from '@/components/dashboard/today/WorkspaceIntro';

/**
 * Дашбоардын нүүр — role-aware router (сервер /api/dashboard/mode шийднэ):
 * • personal — борлуулалтын менежер «Өнөөдөр»-өө харна: уулзалт, залгах лид,
 *   сануулга нэг жагсаалтаар + сарын зорилт.
 * • marketingHome — маркетингийн менежер «Маркетингийн самбар»: контент төлөвлөгөө,
 *   Facebook хуудас, төсөв (лид/гэрээгээр хэмжихгүй).
 * • org — захирал/админ «Захирлын самбар»: борлуулалт vs зорилт, leaderboard,
 *   funnel, авлага. reports эрхтэй бол менежер сонгогчоор аль ч менежерийн
 *   «Өнөөдөр»-ийг Sheet дотор нээнэ. marketing-roi эрхтэй бол `?view=marketing`-ээр
 *   маркетингийн самбар руу сэлгэнэ.
 */
export default function DashboardPage() {
    return <Suspense fallback={<KpiGridSkeleton />}><DashboardHome /></Suspense>;
}

function DashboardHome() {
    const { loading: authLoading, shop, refreshShops } = useAuth();
    const { data: mode, isLoading: modeLoading, isError, isFetching, refetch } = useDashboardMode();
    const [selectedManager, setSelectedManager] = useState<string | null>(null);
    const search = useSearchParams();
    const router = useRouter();
    const pathname = usePathname();

    if (authLoading || modeLoading) {
        return <KpiGridSkeleton />;
    }

    if (!shop || isError || !mode) {
        return <Alert variant="danger">
            {!shop ? 'Байгууллагын мэдээллийг ачаалж чадсангүй.' : 'Самбарын мэдээллийг ачаалж чадсангүй.'}
            <Button size="sm" variant="secondary" disabled={isFetching} onClick={() => void (shop ? refetch() : refreshShops())}>Дахин оролдох</Button>
        </Alert>;
    }

    if (mode.mode === 'personal') {
        return <div className="mx-auto max-w-[1240px]"><WorkspaceIntro /><TodayDashboard /></div>;
    }

    if (mode.marketingHome) {
        return <div className="mx-auto max-w-[1240px]"><WorkspaceIntro variant="marketing" /><MarketingDashboard /></div>;
    }

    const view: DashboardView = mode.canViewMarketing && search.get('view') === 'marketing' ? 'marketing' : 'sales';
    const switchView = mode.canViewMarketing
        ? (next: DashboardView) => router.replace(next === 'marketing' ? `${pathname}?view=marketing` : pathname, { scroll: false })
        : undefined;
    return (
        <div className="mx-auto max-w-[1240px]">
            <WorkspaceIntro variant={view} onViewChange={switchView} />
            {view === 'marketing' ? <MarketingDashboard /> : <DirectorDashboard
                actions={mode.canViewTeam ? <ManagerSelector selected={selectedManager} onSelect={setSelectedManager} /> : undefined}
            />}
        </div>
    );
}

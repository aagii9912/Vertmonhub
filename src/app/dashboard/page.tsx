'use client';

import { useState } from 'react';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { useAuth } from '@/contexts/AuthContext';
import { useDashboardMode } from '@/hooks/useDashboardMode';
import { KpiGridSkeleton } from '@/components/ui/LoadingSkeleton';
import { TodayDashboard } from '@/components/dashboard/today/TodayDashboard';
import { DirectorDashboard } from '@/components/dashboard/director/DirectorDashboard';
import { ManagerSelector } from '@/components/dashboard/ManagerSelector';

/**
 * Дашбоардын нүүр — role-aware router (сервер /api/dashboard/mode шийднэ):
 * • personal — борлуулалтын менежер «Өнөөдөр»-өө харна: уулзалт, залгах лид,
 *   сануулга нэг жагсаалтаар + сарын зорилт.
 * • org — захирал/админ «Захирлын самбар»: борлуулалт vs зорилт, leaderboard,
 *   funnel, авлага. reports эрхтэй бол менежер сонгогчоор аль ч менежерийн
 *   «Өнөөдөр»-ийг Sheet дотор нээнэ.
 */
export default function DashboardPage() {
    const { loading: authLoading, shop, refreshShops } = useAuth();
    const { data: mode, isLoading: modeLoading, isError, isFetching, refetch } = useDashboardMode();
    const [selectedManager, setSelectedManager] = useState<string | null>(null);

    if (authLoading || modeLoading) {
        return <KpiGridSkeleton />;
    }

    if (!shop || isError || !mode) {
        return <Alert variant="danger">
            {!shop ? 'Байгууллагын мэдээллийг ачаалж чадсангүй.' : 'Самбарын мэдээллийг ачаалж чадсангүй.'}
            <Button size="sm" variant="secondary" disabled={isFetching} onClick={() => void (shop ? refetch() : refreshShops())}>Дахин оролдох</Button>
        </Alert>;
    }

    if (mode?.mode === 'personal') {
        return <TodayDashboard />;
    }

    return (
        <DirectorDashboard
            actions={mode?.canViewTeam ? <ManagerSelector selected={selectedManager} onSelect={setSelectedManager} /> : undefined}
        />
    );
}

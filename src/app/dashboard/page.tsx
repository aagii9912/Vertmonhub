'use client';

import { useState } from 'react';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { useAuth } from '@/contexts/AuthContext';
import { useDashboardMode } from '@/hooks/useDashboardMode';
import { KpiGridSkeleton } from '@/components/ui/LoadingSkeleton';
import { TodayDashboard } from '@/components/dashboard/today/TodayDashboard';
import { MarketingToday } from '@/components/dashboard/today/MarketingToday';
import { DirectorDashboard } from '@/components/dashboard/director/DirectorDashboard';
import { ManagerSelector } from '@/components/dashboard/ManagerSelector';

/**
 * «Өнөөдөр» — role-aware нүүр (сервер /api/dashboard/mode шийднэ):
 * • personal — борлуулалтын менежер: дараагийн ажил (уулзалт, залгах лид, сануулга),
 *   «Дууссан» → үр дүн + дараагийн алхам, өнөөдөр ирсэн лид, сарын зорилт.
 * • org + face 'marketing' — маркетингийн ажилтан: сарын лид, суваг, зардал, засах бүртгэл.
 * • org — захирал/админ: анхаарах ажил (хуваарилах, хоцролт, авлага), KPI, менежерүүд,
 *   юүлүүр. reports эрхтэй бол менежер сонгогчоор аль ч менежерийн «Өнөөдөр»-ийг Sheet дотор нээнэ.
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

    return (
        <div className="mx-auto max-w-[1240px]">
            {mode.mode === 'personal' ? <TodayDashboard />
                : mode.face === 'marketing' ? <MarketingToday />
                    : <DirectorDashboard actions={mode.canViewTeam ? <ManagerSelector selected={selectedManager} onSelect={setSelectedManager} /> : undefined} />}
        </div>
    );
}

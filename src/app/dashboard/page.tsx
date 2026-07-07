'use client';

import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useDashboardMode } from '@/hooks/useDashboardMode';
import { KpiGridSkeleton } from '@/components/ui/LoadingSkeleton';
import { OrgDashboard } from '@/components/dashboard/OrgDashboard';
import { ManagerDashboard } from '@/components/dashboard/my/ManagerDashboard';
import { TeamOverview } from '@/components/dashboard/TeamOverview';
import { ManagerSelector } from '@/components/dashboard/ManagerSelector';

/**
 * Дашбоардын нүүр — role-aware router (сервер /api/dashboard/mode шийднэ):
 * • personal — борлуулалтын менежер «Миний самбар»-аа харна (өөрийн лид,
 *   уулзалт, гэрээ, зорилт, хийх ажлууд; виджетээ тохируулах боломжтой).
 * • org — админ болон бусад role нэгдсэн самбараа хэвээр харна; reports
 *   эрхтэй бол доор нь «Багийн гүйцэтгэл» + менежер сонгогч нэмэгдэнэ
 *   (мөр/сонголтоор аль ч менежерийн хувийн самбарыг нээнэ).
 */
export default function DashboardPage() {
    const { loading: authLoading } = useAuth();
    const { data: mode, isLoading: modeLoading } = useDashboardMode();
    const [selectedManager, setSelectedManager] = useState<string | null>(null);

    if (authLoading || modeLoading) {
        return <KpiGridSkeleton />;
    }

    if (mode?.mode === 'personal') {
        return <ManagerDashboard />;
    }

    return (
        <OrgDashboard
            extra={
                mode?.canViewTeam ? (
                    <TeamOverview
                        onSelectManager={setSelectedManager}
                        actions={
                            <ManagerSelector selected={selectedManager} onSelect={setSelectedManager} />
                        }
                    />
                ) : undefined
            }
        />
    );
}

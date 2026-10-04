'use client';

import { useState } from 'react';
import { FileSpreadsheet, History } from 'lucide-react';
import { PageHeader } from '@/components/dashboard/PageHeader';
import { SectionCard } from '@/components/ui/SectionCard';
import { Button } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Alert';
import { Spinner } from '@/components/ui/Spinner';
import { useAuth } from '@/contexts/AuthContext';
import { useDashboardQuery } from '@/hooks/useDashboardQuery';
import { ChannelReportImport, CHANNEL_REPORTS_ENDPOINT } from '@/components/marketing/ChannelReportImport';
import { ChannelReportList, type ChannelReportsListResponse, type ChannelSourceFilter } from '@/components/marketing/ChannelReportList';

/**
 * «Сувгийн экспорт импорт» — Meta Ads Manager, Facebook хуудас, CallPro, масс SMS-ийн экспорт
 * файлаас тухайн төслийн (shop) долоо хоногийн маркетингийн үзүүлэлтийг хадгална.
 */
export default function ChannelReportsPage() {
    const { shop, user, loading } = useAuth();
    const canRead = !!user && (user.role === 'super_admin' || user.permissions.modules.includes('marketing-roi'));
    const canWrite = canRead && !!user?.permissions.canWrite;
    const canDelete = canRead && !!user?.permissions.canDelete;
    const [filter, setFilter] = useState<ChannelSourceFilter>('all');
    const url = canRead ? `${CHANNEL_REPORTS_ENDPOINT}${filter === 'all' ? '' : `?source=${filter}`}` : null;
    const reports = useDashboardQuery<ChannelReportsListResponse>(['marketing-channel-reports'], url, { keepPreviousData: true });

    return <div className="mx-auto flex min-w-0 max-w-[1200px] flex-col gap-5">
        <PageHeader title="Сувгийн экспорт импорт"
            subtitle="Meta Ads, Facebook хуудас, CallPro, масс SMS-ийн экспорт файлаас хурлын долоо хоногийн маркетингийн тайланг бэлдэнэ."
            secondaryActions={<><Button href="/marketing" variant="secondary">Маркетинг</Button>{user?.permissions.modules.includes('dashboard') && <Button href="/dashboard/weekly" variant="secondary">Хурлын бэлтгэл</Button>}</>} />
        {!loading && !canRead && <Alert variant="warning">Маркетингийн тайлан харах эрх шаардлагатай.</Alert>}
        {canWrite && shop && <SectionCard icon={FileSpreadsheet} title="Экспорт файл оруулах"
            description={`${shop.name ? `${shop.name} төслийн` : 'Идэвхтэй төслийн'} тайлан. Нэг эх үүсвэр, нэг хугацаанд нэг тайлан хадгалагдана — дахин оруулбал шинэчлэгдэнэ.`}>
            <ChannelReportImport key={shop.id} shopId={shop.id} />
        </SectionCard>}
        {canRead && <SectionCard icon={History} title="Хадгалсан тайлан" description="Сүүлийн тайланг ижил урттай өмнөх тайлантай харьцуулна. Тооцоогүй үзүүлэлт 0 биш.">
            {reports.isPending && <Spinner label="Тайлан уншиж байна…" />}
            {reports.isError && <Alert variant="danger">{reports.error.message} <Button size="sm" variant="secondary" onClick={() => void reports.refetch()}>Дахин оролдох</Button></Alert>}
            {reports.data && shop && <ChannelReportList data={reports.data} filter={filter} onFilter={setFilter} canDelete={canDelete} shopId={shop.id} />}
        </SectionCard>}
    </div>;
}

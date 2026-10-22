'use client';

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Archive, ArrowLeft, BadgePercent, PencilLine } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useModuleAccess } from '@/hooks/useModuleAccess';
import { useDashboardQuery } from '@/hooks/useDashboardQuery';
import type { PricingSheet } from '@/lib/sales/pricing-history';
import { PageHeader } from '@/components/dashboard/PageHeader';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { DateText } from '@/components/ui/DateText';
import { EmptyState } from '@/components/ui/EmptyState';
import { Spinner } from '@/components/ui/Spinner';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/Tabs';
import { PricingVersionView, pricingDay } from '@/components/pricing/PricingVersionView';
import { ProjectPricingSettings } from '@/components/admin/ProjectPricingSettings';

type Tab = 'current' | 'archive' | 'edit';

function usePricingSheet(version: number | null, enabled = true) {
    return useDashboardQuery<PricingSheet>(['pricing-sheet'], version ? `/api/dashboard/pricing?version=${version}` : '/api/dashboard/pricing', { enabled });
}

function LoadState({ query }: { query: ReturnType<typeof usePricingSheet> }) {
    if (query.isPending) return <div className="flex justify-center py-16"><Spinner /></div>;
    return <Alert variant="danger">{query.error?.message ?? 'Үнийн мэдээлэл уншиж чадсангүй'} <button type="button" className="ml-2 font-semibold underline" onClick={() => void query.refetch()}>Дахин ачаалах</button></Alert>;
}

export default function PricingPage() {
    const { shop } = useAuth();
    const { isSuperAdmin } = useModuleAccess();
    const queryClient = useQueryClient();
    const [tab, setTab] = useState<Tab>('current');
    // Tied to the project it was opened in: switching projects returns to the archive list.
    const [opened, setOpened] = useState<{ shopId: string; version: number } | null>(null);
    const archived = opened && opened.shopId === shop?.id ? opened.version : null;
    const current = usePricingSheet(null);
    const detail = usePricingSheet(archived, archived !== null);
    const history = current.data?.history ?? [];
    const archive = history.filter(row => row.status === 'archived');

    return <div className="mx-auto max-w-6xl space-y-6">
        <PageHeader
            title="Үнэ, төлбөрийн нөхцөл"
            subtitle="Төслийн баталсан хүчинтэй үнэ, урьдчилгааны нөхцөл. Үнэ өөрчлөгдөхөд өмнөх хувилбар архивт хэвээр хадгалагдана."
        />
        <Tabs value={tab} onValueChange={value => setTab(value as Tab)}>
            <TabsList>
                <TabsTrigger value="current"><BadgePercent />Хүчинтэй үнэ</TabsTrigger>
                <TabsTrigger value="archive"><Archive />Архив{current.data ? ` (${archive.length})` : ''}</TabsTrigger>
                {isSuperAdmin && <TabsTrigger value="edit"><PencilLine />Засах</TabsTrigger>}
            </TabsList>

            <TabsContent value="current" className="mt-4">
                {!current.data ? <LoadState query={current} />
                    : current.data.selected ? <PricingVersionView version={current.data.selected} />
                        : <div className="rounded-xl border border-border bg-surface"><EmptyState icon={<BadgePercent />} title="Баталсан үнэ байхгүй"
                            description={isSuperAdmin ? '«Засах» табаас үнийн мөрүүдийг оруулж, хянаад идэвхжүүлнэ.' : 'Удирдлага үнийг баталж идэвхжүүлсний дараа энд харагдана.'} /></div>}
            </TabsContent>

            <TabsContent value="archive" className="mt-4">
                {!current.data ? <LoadState query={current} />
                    : archived !== null ? <div className="space-y-4">
                        <Button variant="secondary" onClick={() => setOpened(null)}><ArrowLeft />Архивын жагсаалт</Button>
                        {detail.data?.selected ? <PricingVersionView version={detail.data.selected} /> : <LoadState query={detail} />}
                    </div>
                    : archive.length === 0 ? <div className="rounded-xl border border-border bg-surface"><EmptyState icon={<Archive />} title="Архив хоосон"
                        description="Шинэ үнэ идэвхжихэд одоогийн хувилбар энд автоматаар шилжинэ." /></div>
                    : <div className="overflow-x-auto rounded-xl border border-border bg-surface">
                        <table className="w-full min-w-[720px] border-collapse text-sm">
                            <caption className="sr-only">Архивласан үнийн хувилбарууд</caption>
                            <thead><tr className="text-left text-xs text-muted-foreground">
                                <th scope="col" className="border-b border-border px-4 py-2.5 font-medium">Хувилбар</th>
                                <th scope="col" className="border-b border-border px-4 py-2.5 font-medium">Эх сурвалж</th>
                                <th scope="col" className="border-b border-border px-4 py-2.5 font-medium">Хүчинтэй хугацаа</th>
                                <th scope="col" className="border-b border-border px-4 py-2.5 font-medium">Идэвхжүүлсэн</th>
                                <th scope="col" className="border-b border-border px-4 py-2.5 font-medium">Архивт шилжсэн</th>
                                <th scope="col" className="border-b border-border px-4 py-2.5"><span className="sr-only">Үйлдэл</span></th>
                            </tr></thead>
                            <tbody>{archive.map(row => <tr key={row.id} className="border-b border-border last:border-b-0">
                                <td className="num px-4 py-2.5 font-medium">{row.version}</td>
                                <td className="px-4 py-2.5">{row.source || '—'}</td>
                                <td className="num px-4 py-2.5">{pricingDay(row.valid_from)} – {pricingDay(row.valid_until)}</td>
                                <td className="px-4 py-2.5"><DateText value={row.activated_at} format="datetime" />{row.activated_by ? ` · ${row.activated_by}` : ''}</td>
                                <td className="px-4 py-2.5"><DateText value={row.archived_at} format="datetime" /></td>
                                <td className="px-4 py-2.5 text-right"><Button variant="ghost" onClick={() => shop && setOpened({ shopId: shop.id, version: row.version })} aria-label={`Хувилбар ${row.version}-ийг харах`}>Харах</Button></td>
                            </tr>)}</tbody>
                        </table>
                    </div>}
            </TabsContent>

            {isSuperAdmin && shop && <TabsContent value="edit" className="mt-4">
                <ProjectPricingSettings key={shop.id} shopId={shop.id} projectName={shop.name}
                    onSaved={() => void queryClient.invalidateQueries({ queryKey: ['pricing-sheet'] })} />
            </TabsContent>}
        </Tabs>
    </div>;
}

'use client';

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Archive, ArrowLeft, BadgePercent, PencilLine } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useModuleAccess } from '@/hooks/useModuleAccess';
import { useDashboardQuery } from '@/hooks/useDashboardQuery';
import type { PricingSheet, PricingValidity } from '@/lib/sales/pricing-history';
import { PageHeader } from '@/components/dashboard/PageHeader';
import { Alert } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { DateText } from '@/components/ui/DateText';
import { EmptyState } from '@/components/ui/EmptyState';
import { Spinner } from '@/components/ui/Spinner';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/Tabs';
import { PricingVersionView, pricingDay } from '@/components/pricing/PricingVersionView';
import { ProjectPricingSettings } from '@/components/admin/ProjectPricingSettings';

type Tab = 'current' | 'archive' | 'edit';
const PRICE_LIST_STATE: Record<PricingValidity, { label: string; variant: 'success' | 'pending' | 'danger' }> = {
    valid: { label: 'Хүчинтэй', variant: 'success' },
    upcoming: { label: 'Эхлээгүй', variant: 'pending' },
    expired: { label: 'Хугацаа дууссан', variant: 'danger' },
};

/** One list's sheet: its active version, or `version` from its archive. No list = the project's first list with an active price. */
function usePricingSheet(list: string | null, version: number | null, enabled = true) {
    const params = new URLSearchParams();
    if (list) params.set('list', list);
    if (version) params.set('version', String(version));
    const query = params.toString();
    return useDashboardQuery<PricingSheet>(['pricing-sheet'], query ? `/api/dashboard/pricing?${query}` : '/api/dashboard/pricing', { enabled });
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
    // Tied to the project it was opened in: switching projects returns to the archive list and the first price list.
    const [opened, setOpened] = useState<{ shopId: string; list: string; version: number } | null>(null);
    const archived = opened && opened.shopId === shop?.id ? opened : null;
    const [chosen, setChosen] = useState<{ shopId: string; list: string } | null>(null);
    const list = chosen && chosen.shopId === shop?.id ? chosen.list : null;
    const current = usePricingSheet(list, null);
    const detail = usePricingSheet(archived?.list ?? null, archived?.version ?? null, archived !== null);
    const history = current.data?.history ?? [];
    const archive = history.filter(row => row.status === 'archived');
    const lists = current.data?.lists ?? [];
    // A project with one price list looks as before: no list chooser, no list column.
    const several = lists.length > 1;
    const shown = current.data?.selected?.list_key ?? list ?? lists[0]?.key ?? null;
    const shownList = lists.find(item => item.key === shown) ?? null;

    return <div className="mx-auto max-w-6xl space-y-6">
        <PageHeader
            title="Үнэ, төлбөрийн нөхцөл"
            subtitle="Төслийн баталсан хүчинтэй үнэ, урьдчилгааны нөхцөл. Өөр хугацаатай үнэ тусдаа жагсаалтаар харагдана; үнэ өөрчлөгдөхөд өмнөх хувилбар архивт хэвээр хадгалагдана."
        />
        <Tabs value={tab} onValueChange={value => setTab(value as Tab)}>
            <TabsList>
                <TabsTrigger value="current"><BadgePercent />Хүчинтэй үнэ</TabsTrigger>
                <TabsTrigger value="archive"><Archive />Архив{current.data ? ` (${archive.length})` : ''}</TabsTrigger>
                {isSuperAdmin && <TabsTrigger value="edit"><PencilLine />Засах</TabsTrigger>}
            </TabsList>

            <TabsContent value="current" className="mt-4">
                {!current.data ? <LoadState query={current} /> : <div className="space-y-4">
                    {several && <div role="group" aria-label="Үнийн жагсаалт" className="flex flex-wrap gap-2">
                        {lists.map(item => <Button key={item.key} type="button" size="sm" variant={item.key === shown ? 'primary' : 'secondary'}
                            aria-pressed={item.key === shown} onClick={() => shop && setChosen({ shopId: shop.id, list: item.key })}>
                            {item.name}
                            <Badge variant={item.validity ? PRICE_LIST_STATE[item.validity].variant : 'neutral'} className="ml-1.5">{item.validity ? PRICE_LIST_STATE[item.validity].label : 'Идэвхгүй'}</Badge>
                        </Button>)}
                    </div>}
                    {current.data.selected ? <PricingVersionView version={current.data.selected} showList={several} />
                        : shownList ? <div className="rounded-xl border border-border bg-surface"><EmptyState icon={<BadgePercent />} title={`«${shownList.name}» жагсаалтад идэвхтэй үнэ алга`}
                            description="Энэ жагсаалтын үнийг идэвхгүй болгосон. Өмнөх хувилбарууд «Архив» табт байна." /></div>
                        : <div className="rounded-xl border border-border bg-surface"><EmptyState icon={<BadgePercent />} title="Баталсан үнэ байхгүй"
                            description={isSuperAdmin ? '«Засах» табаас үнийн мөрүүдийг оруулж, хянаад идэвхжүүлнэ.' : 'Удирдлага үнийг баталж идэвхжүүлсний дараа энд харагдана.'} /></div>}
                </div>}
            </TabsContent>

            <TabsContent value="archive" className="mt-4">
                {!current.data ? <LoadState query={current} />
                    : archived !== null ? <div className="space-y-4">
                        <Button variant="secondary" onClick={() => setOpened(null)}><ArrowLeft />Архивын жагсаалт</Button>
                        {detail.data?.selected ? <PricingVersionView version={detail.data.selected} showList={several} /> : <LoadState query={detail} />}
                    </div>
                    : archive.length === 0 ? <div className="rounded-xl border border-border bg-surface"><EmptyState icon={<Archive />} title="Архив хоосон"
                        description="Шинэ үнэ идэвхжих эсвэл үнийг идэвхгүй болгоход одоогийн хувилбар энд автоматаар шилжинэ." /></div>
                    : <div className="overflow-x-auto rounded-xl border border-border bg-surface">
                        <table className="w-full min-w-[720px] border-collapse text-sm">
                            <caption className="sr-only">Архивласан үнийн хувилбарууд</caption>
                            <thead><tr className="text-left text-xs text-muted-foreground">
                                {several && <th scope="col" className="border-b border-border px-4 py-2.5 font-medium">Жагсаалт</th>}
                                <th scope="col" className="border-b border-border px-4 py-2.5 font-medium">Хувилбар</th>
                                <th scope="col" className="border-b border-border px-4 py-2.5 font-medium">Эх сурвалж</th>
                                <th scope="col" className="border-b border-border px-4 py-2.5 font-medium">Хүчинтэй хугацаа</th>
                                <th scope="col" className="border-b border-border px-4 py-2.5 font-medium">Идэвхжүүлсэн</th>
                                <th scope="col" className="border-b border-border px-4 py-2.5 font-medium">Архивт шилжсэн</th>
                                <th scope="col" className="border-b border-border px-4 py-2.5"><span className="sr-only">Үйлдэл</span></th>
                            </tr></thead>
                            <tbody>{archive.map(row => <tr key={row.id} className="border-b border-border last:border-b-0">
                                {several && <td className="px-4 py-2.5">{row.list_name}</td>}
                                <td className="num px-4 py-2.5 font-medium">{row.version}</td>
                                <td className="px-4 py-2.5">{row.source || '—'}</td>
                                <td className="num px-4 py-2.5">{pricingDay(row.valid_from)} – {pricingDay(row.valid_until)}</td>
                                <td className="px-4 py-2.5"><DateText value={row.activated_at} format="datetime" />{row.activated_by ? ` · ${row.activated_by}` : ''}</td>
                                <td className="px-4 py-2.5"><DateText value={row.archived_at} format="datetime" /></td>
                                <td className="px-4 py-2.5 text-right"><Button variant="ghost" onClick={() => shop && setOpened({ shopId: shop.id, list: row.list_key, version: row.version })}
                                    aria-label={several ? `«${row.list_name}» хувилбар ${row.version}-ийг харах` : `Хувилбар ${row.version}-ийг харах`}>Харах</Button></td>
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

'use client';

import React, { useState } from 'react';
import { Megaphone, Plus, Search, Play, DollarSign } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { dashboardMutate } from '@/lib/api/dashboardFetch';
import { useDashboardQuery } from '@/hooks/useDashboardQuery';
import { PageHeader } from '@/components/dashboard/PageHeader';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { StatsCard } from '@/components/dashboard/StatsCard';
import { Spinner } from '@/components/ui/Spinner';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/Alert';
import {
    DataTable,
    type DataTableColumn,
    Money,
    DateText,
    StatusPill,
} from '@/components/ui/DataTable';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from '@/components/ui/Dialog';
import { FormField, FieldGroup } from '@/components/ui/FormField';
import { ubDateStr } from '@/lib/utils/date';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/Select';

interface Campaign {
    id: string;
    name: string;
    type: string;
    status: string;
    budget: number;
    spend: number;
    start_date: string;
    end_date: string;
    metrics: Record<string, number>;
}

const statusVariants: Record<string, 'neutral' | 'success' | 'pending' | 'info' | 'danger'> = {
    draft: 'neutral',
    active: 'success',
    paused: 'pending',
    completed: 'info',
    cancelled: 'danger',
};

const statusLabels: Record<string, string> = {
    draft: 'Ноорог',
    active: 'Идэвхтэй',
    paused: 'Зогссон',
    completed: 'Дууссан',
    cancelled: 'Цуцлагдсан',
};

export default function CampaignsPage() {
    const { shop } = useAuth();
    const { data, isLoading, error, isFetching, refetch } = useDashboardQuery<{ rows: Campaign[] }>(
        ['marketing-campaigns'],
        '/api/marketing/data/marketing_campaigns?order=created_at.desc',
    );
    const campaigns = data?.rows ?? [];
    const [searchQuery, setSearchQuery] = useState('');
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [creating, setCreating] = useState(false);
    const [newCampaign, setNewCampaign] = useState({ name: '', type: 'social', budget: 0, start_date: ubDateStr(), end_date: '' });

    const handleCreate = async () => {
        if (!shop?.id || !newCampaign.name.trim()) return;
        setCreating(true);
        try {
            await dashboardMutate('/api/marketing/data/marketing_campaigns', 'POST', {
                name: newCampaign.name.trim(), type: newCampaign.type,
                status: 'draft', budget: newCampaign.budget, spend: 0,
                start_date: newCampaign.start_date || null, end_date: newCampaign.end_date || null, metrics: {},
            });
            void refetch();
            setShowCreateModal(false);
            setNewCampaign({ name: '', type: 'social', budget: 0, start_date: ubDateStr(), end_date: '' });
        } catch (err) { console.error('Create error:', err); }
        finally { setCreating(false); }
    };

    const filteredCampaigns = campaigns.filter(c =>
        c.name.toLowerCase().includes(searchQuery.toLowerCase())
    );

    const activeCampaigns = campaigns.filter(c => c.status === 'active').length;
    const totalBudget = campaigns.reduce((sum, c) => sum + (c.budget || 0), 0);
    const totalSpend = campaigns.reduce((sum, c) => sum + (c.spend || 0), 0);

    const columns: DataTableColumn<Campaign>[] = [
        {
            key: 'name',
            header: 'Нэр',
            sortable: true,
            accessor: (c) => c.name,
            cell: (c) => <span className="font-medium text-foreground">{c.name}</span>,
        },
        {
            key: 'type',
            header: 'Төрөл',
            accessor: (c) => c.type,
            cell: (c) => <span className="text-muted-foreground">{c.type}</span>,
        },
        {
            key: 'status',
            header: 'Төлөв',
            cell: (c) => (
                <StatusPill variant={statusVariants[c.status] ?? 'neutral'}>
                    {statusLabels[c.status] || c.status}
                </StatusPill>
            ),
        },
        {
            key: 'budget',
            header: 'Төсөв',
            align: 'right',
            sortable: true,
            accessor: (c) => c.budget,
            cell: (c) => <Money value={c.budget} compact />,
        },
        {
            key: 'spend',
            header: 'Зарцуулалт',
            align: 'right',
            sortable: true,
            accessor: (c) => c.spend,
            cell: (c) => <Money value={c.spend} compact />,
        },
        {
            key: 'start_date',
            header: 'Хугацаа',
            align: 'right',
            cell: (c) => <DateText value={c.start_date} className="text-muted-foreground" />,
        },
    ];

    if (isLoading) {
        return (
            <div className="flex items-center justify-center min-h-[400px]">
                <div className="flex items-center gap-3">
                    <Spinner />
                    <span className="text-muted-foreground">Татаж байна...</span>
                </div>
            </div>
        );
    }

    return (
        <div>
            <PageHeader
                eyebrow="Маркетинг"
                title="Кампанит ажил"
                subtitle="Маркетингийн кампанит ажлууд"
                secondaryActions={
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                        <Input
                            type="text"
                            placeholder="Хайх..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="pl-10 w-full sm:w-64"
                        />
                    </div>
                }
                primaryAction={
                    <Button onClick={() => setShowCreateModal(true)}>
                        <Plus className="w-4 h-4" />
                        Шинэ кампани
                    </Button>
                }
            />

            {error && !data ? (
                <Alert variant="danger">
                    <AlertTitle>Кампанит ажлууд татахад алдаа гарлаа</AlertTitle>
                    <AlertDescription>{error.message}</AlertDescription>
                    <Button variant="secondary" size="sm" className="mt-1 self-start" disabled={isFetching} onClick={() => void refetch()}>Дахин оролдох</Button>
                </Alert>
            ) : (
                <>
                    {/* Stats */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                        <StatsCard title="Нийт кампани" value={campaigns.length} icon={Megaphone} iconColor="info" />
                        <StatsCard title="Идэвхтэй" value={activeCampaigns} icon={Play} iconColor="success" />
                        <StatsCard
                            title="Нийт зарцуулалт"
                            value={<Money value={totalSpend} compact />}
                            icon={DollarSign}
                            iconColor="brand"
                        />
                    </div>

                    {/* Campaigns Table */}
                    <DataTable
                        columns={columns}
                        data={filteredCampaigns}
                        getRowId={(c) => c.id}
                        caption="Кампанит ажлууд"
                        emptyMessage="Кампанит ажил нэмэхийн тулд “Шинэ кампани” товчийг дарна уу."
                    />
                </>
            )}

            {/* Create Modal */}
            <Dialog open={showCreateModal} onOpenChange={setShowCreateModal}>
                <DialogContent showCloseButton={false} className="rounded-xl sm:max-w-md max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle className="heading-section text-lg text-foreground">Шинэ кампани</DialogTitle>
                    </DialogHeader>
                    <FieldGroup>
                        <FormField label="Нэр" htmlFor="campaign-name" required>
                            <Input id="campaign-name" value={newCampaign.name} onChange={e => setNewCampaign(p => ({ ...p, name: e.target.value }))} placeholder="Кампанийн нэр" />
                        </FormField>
                        <FormField label="Төрөл" htmlFor="campaign-type">
                            <Select value={newCampaign.type} onValueChange={v => setNewCampaign(p => ({ ...p, type: v }))}>
                                <SelectTrigger id="campaign-type">
                                    <SelectValue placeholder="— Сонгох —" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="social">Сошиал</SelectItem>
                                    <SelectItem value="search">Хайлт</SelectItem>
                                    <SelectItem value="display">Дэлгэц</SelectItem>
                                    <SelectItem value="email">Имэйл</SelectItem>
                                    <SelectItem value="event">Эвент</SelectItem>
                                </SelectContent>
                            </Select>
                        </FormField>
                        <FormField label="Төсөв (₮)" htmlFor="campaign-budget">
                            <Input id="campaign-budget" type="number" value={newCampaign.budget} onChange={e => setNewCampaign(p => ({ ...p, budget: Number(e.target.value) }))} />
                        </FormField>
                        <div className="grid grid-cols-2 gap-3">
                            <FormField label="Эхлэх" htmlFor="campaign-start">
                                <Input id="campaign-start" type="date" value={newCampaign.start_date} onChange={e => setNewCampaign(p => ({ ...p, start_date: e.target.value }))} />
                            </FormField>
                            <FormField label="Дуусах" htmlFor="campaign-end">
                                <Input id="campaign-end" type="date" value={newCampaign.end_date} onChange={e => setNewCampaign(p => ({ ...p, end_date: e.target.value }))} />
                            </FormField>
                        </div>
                    </FieldGroup>
                    <DialogFooter>
                        <Button variant="secondary" onClick={() => setShowCreateModal(false)}>Болих</Button>
                        <Button onClick={handleCreate} disabled={!newCampaign.name.trim() || creating} isLoading={creating}>
                            {!creating && <Plus className="w-4 h-4" />}
                            Үүсгэх
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}

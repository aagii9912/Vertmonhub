'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import {
    Globe, Plus, Search, FileText, Loader2, Layers, CheckCircle2, Wallet,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { Input } from '@/components/ui/Input';
import { Textarea } from '@/components/ui/Textarea';
import { FormField } from '@/components/ui/FormField';
import { StatsCard } from '@/components/dashboard/StatsCard';
import { Spinner } from '@/components/ui/Spinner';
import { EmptyState } from '@/components/ui/EmptyState';
import { PageHeader } from '@/components/dashboard/PageHeader';
import { DataTable, StatusPill, type DataTableColumn } from '@/components/ui/DataTable';
import {
    Sheet,
    SheetContent,
    SheetHeader,
    SheetFooter,
    SheetTitle,
    SheetDescription,
} from '@/components/ui/Sheet';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/Select';

interface MarketingChannel {
    id: string;
    name: string;
    type: string;
    status: string;
    description: string;
    created_at: string;
}

interface ChannelContract {
    id: string;
    channel_id: string;
    start_date: string;
    end_date: string;
    budget: number;
    currency: string;
    kpi_target: string;
    status: string;
}

const typeLabels: Record<string, string> = {
    social: 'Сошиал',
    search: 'Хайлт',
    affiliate: 'Партнер',
    direct: 'Шууд',
    influencer: 'Инфлүүнсер',
    traditional: 'Уламжлалт',
};

const statusVariants: Record<string, 'success' | 'pending' | 'neutral'> = {
    active: 'success',
    paused: 'pending',
    archived: 'neutral',
};

const statusLabels: Record<string, string> = {
    active: 'Идэвхтэй',
    paused: 'Зогссон',
    archived: 'Архивлагдсан',
};

export default function SourcesPage() {
    const { shop } = useAuth();
    const [channels, setChannels] = useState<MarketingChannel[]>([]);
    const [contracts, setContracts] = useState<ChannelContract[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [creating, setCreating] = useState(false);
    const [newChannel, setNewChannel] = useState({ name: '', type: 'social', description: '' });

    const handleCreate = async () => {
        if (!newChannel.name.trim()) return;
        setCreating(true);
        try {
            const { data, error } = await supabase.from('marketing_channels').insert([{
                name: newChannel.name.trim(), type: newChannel.type,
                status: 'active', description: newChannel.description || null,
            }]).select().single();
            if (error) throw error;
            setChannels(prev => [data, ...prev]);
            setShowCreateModal(false);
            setNewChannel({ name: '', type: 'social', description: '' });
        } catch (err) { console.error('Create error:', err); }
        finally { setCreating(false); }
    };

    useEffect(() => {
        const fetch = async () => {
            setLoading(true);
            try {
                const [channelsRes, contractsRes] = await Promise.all([
                    supabase.from('marketing_channels').select('*').order('created_at', { ascending: false }),
                    supabase.from('channel_contracts').select('*').eq('status', 'active'),
                ]);
                if (channelsRes.error) throw channelsRes.error;
                if (contractsRes.error) throw contractsRes.error;
                setChannels(channelsRes.data || []);
                setContracts(contractsRes.data || []);
            } catch (error) {
                console.error('Error:', error);
            } finally {
                setLoading(false);
            }
        };
        fetch();
    }, []);

    const filteredChannels = channels.filter(c =>
        c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (c.type && c.type.toLowerCase().includes(searchQuery.toLowerCase()))
    );

    const activeChannels = channels.filter(c => c.status === 'active').length;
    const totalBudget = contracts.reduce((sum, c) => sum + (c.budget || 0), 0);

    const formatCurrency = (v: number) => v >= 1000000 ? `${(v / 1000000).toFixed(1)}M₮` : v >= 1000 ? `${(v / 1000).toFixed(0)}K₮` : v.toLocaleString() + '₮';

    const getContractsForChannel = (channelId: string) => contracts.filter(c => c.channel_id === channelId);

    const channelBudget = (channelId: string) =>
        getContractsForChannel(channelId).reduce((s, c) => s + (c.budget || 0), 0);

    const columns: DataTableColumn<MarketingChannel>[] = [
        {
            key: 'name',
            header: 'Суваг',
            sortable: true,
            accessor: (c) => c.name,
            cell: (c) => (
                <div className="min-w-0">
                    <div className="font-medium text-foreground truncate">{c.name}</div>
                    {c.description && (
                        <div className="text-xs text-muted-foreground line-clamp-1 mt-0.5">{c.description}</div>
                    )}
                </div>
            ),
        },
        {
            key: 'type',
            header: 'Төрөл',
            sortable: true,
            accessor: (c) => typeLabels[c.type] || c.type,
            cell: (c) => (
                <span className="text-sm text-muted-foreground">{typeLabels[c.type] || c.type}</span>
            ),
        },
        {
            key: 'contracts',
            header: 'Гэрээ',
            align: 'center',
            sortable: true,
            accessor: (c) => getContractsForChannel(c.id).length,
            cell: (c) => (
                <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground tabular-nums">
                    <FileText className="w-3.5 h-3.5" />
                    {getContractsForChannel(c.id).length}
                </span>
            ),
        },
        {
            key: 'budget',
            header: 'Төсөв',
            align: 'right',
            sortable: true,
            accessor: (c) => channelBudget(c.id),
            cell: (c) => {
                const b = channelBudget(c.id);
                return b > 0
                    ? <span className="font-medium text-foreground tabular-nums">{formatCurrency(b)}</span>
                    : <span className="text-muted-foreground">—</span>;
            },
        },
        {
            key: 'status',
            header: 'Төлөв',
            align: 'right',
            sortable: true,
            accessor: (c) => c.status,
            cell: (c) => (
                <StatusPill variant={statusVariants[c.status] || 'neutral'}>
                    {statusLabels[c.status] || c.status}
                </StatusPill>
            ),
        },
    ];

    return (
        <div>
            <PageHeader
                eyebrow="Маркетинг"
                title="Маркетингийн сувгууд"
                subtitle="Сурталчилгааны сувгууд болон гэрээнүүд"
                primaryAction={
                    <Button onClick={() => setShowCreateModal(true)} variant="primary" size="md">
                        <Plus className="w-4 h-4" /> Шинэ суваг
                    </Button>
                }
            />

            {loading ? (
                <div className="flex items-center justify-center py-24"><Spinner size="lg" /></div>
            ) : (
                <>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                        <StatsCard title="Нийт суваг" value={channels.length} icon={Layers} iconColor="brand" />
                        <StatsCard title="Идэвхтэй" value={activeChannels} icon={CheckCircle2} iconColor="success" />
                        <StatsCard title="Нийт төсөв" value={formatCurrency(totalBudget)} icon={Wallet} iconColor="info" />
                    </div>

                    <div className="relative mb-4 max-w-xs">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/70" />
                        <Input
                            type="text"
                            placeholder="Хайх..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="pl-9"
                        />
                    </div>

                    {filteredChannels.length === 0 ? (
                        <Card>
                            <CardContent className="py-12">
                                <EmptyState
                                    icon={<Globe className="w-7 h-7" />}
                                    title="Мэдээлэл байхгүй"
                                    description="Маркетингийн суваг нэмнэ үү."
                                    action={
                                        <Button onClick={() => setShowCreateModal(true)} variant="primary" size="sm">
                                            <Plus className="w-4 h-4" /> Шинэ суваг
                                        </Button>
                                    }
                                />
                            </CardContent>
                        </Card>
                    ) : (
                        <DataTable
                            columns={columns}
                            data={filteredChannels}
                            getRowId={(c) => c.id}
                            caption="Маркетингийн сувгуудын жагсаалт"
                        />
                    )}
                </>
            )}

            <Sheet open={showCreateModal} onOpenChange={(open) => !open && setShowCreateModal(false)}>
                <SheetContent side="right">
                    <SheetHeader>
                        <SheetTitle>Шинэ суваг</SheetTitle>
                        <SheetDescription>Маркетингийн суваг нэмэх</SheetDescription>
                    </SheetHeader>

                    <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
                        <FormField label="Нэр" htmlFor="channel_name" required>
                            <Input
                                id="channel_name"
                                value={newChannel.name}
                                onChange={e => setNewChannel(p => ({ ...p, name: e.target.value }))}
                                placeholder="Сувгийн нэр"
                            />
                        </FormField>
                        <FormField label="Төрөл" htmlFor="channel_type">
                            <Select
                                value={newChannel.type}
                                onValueChange={value => setNewChannel(p => ({ ...p, type: value }))}
                            >
                                <SelectTrigger id="channel_type">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="social">Сошиал</SelectItem>
                                    <SelectItem value="search">Хайлт</SelectItem>
                                    <SelectItem value="affiliate">Партнер</SelectItem>
                                    <SelectItem value="direct">Шууд</SelectItem>
                                    <SelectItem value="influencer">Инфлүүнсер</SelectItem>
                                    <SelectItem value="traditional">Уламжлалт</SelectItem>
                                </SelectContent>
                            </Select>
                        </FormField>
                        <FormField label="Тайлбар" htmlFor="channel_description" hint="Заавал биш">
                            <Textarea
                                id="channel_description"
                                value={newChannel.description}
                                onChange={e => setNewChannel(p => ({ ...p, description: e.target.value }))}
                                placeholder="Тайлбар (заавал биш)"
                                rows={3}
                            />
                        </FormField>
                    </div>

                    <SheetFooter>
                        <Button variant="secondary" onClick={() => setShowCreateModal(false)}>Болих</Button>
                        <Button
                            variant="primary"
                            onClick={handleCreate}
                            disabled={!newChannel.name.trim() || creating}
                        >
                            {creating ? <><Loader2 className="w-4 h-4 animate-spin" />Үүсгэж байна...</> : <><Plus className="w-4 h-4" />Үүсгэх</>}
                        </Button>
                    </SheetFooter>
                </SheetContent>
            </Sheet>
        </div>
    );
}

'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import {
    Globe, Plus, Search, FileText, Loader2, Layers, CheckCircle2, Wallet, CalendarClock,
} from 'lucide-react';
import { toast } from 'sonner';
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
import { Money } from '@/components/ui/Money';
import { daysUntil } from '@/lib/marketing/budget';
import { formatShortDate } from '@/lib/utils/date';
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
    end_date: string | null;
    budget: number;
    currency: string;
    kpi_target: string | null;
    status: string;
}

const typeLabels: Record<string, string> = {
    social: 'Сошиал',
    search: 'Хайлт',
    affiliate: 'Партнер',
    direct: 'Шууд',
    influencer: 'Инфлүүнсер',
    traditional: 'Уламжлалт (билборд, радио, ТВ)',
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

/** Гэрээний хугацааны badge: дууссан/дуусах гэж буй/идэвхтэй. */
function ContractDueBadge({ endDate }: { endDate: string | null }) {
    const days = daysUntil(endDate, new Date());
    if (days === null) return <StatusPill variant="neutral">Хугацаагүй</StatusPill>;
    if (days < 0) return <StatusPill variant="neutral">Дууссан</StatusPill>;
    if (days === 0) return <StatusPill variant="danger">Өнөөдөр дуусна</StatusPill>;
    if (days <= 7) return <StatusPill variant="danger">{days} хоног үлдсэн</StatusPill>;
    if (days <= 30) return <StatusPill variant="pending">{days} хоног үлдсэн</StatusPill>;
    return <StatusPill variant="success">{days} хоног</StatusPill>;
}

/** Оны 12 сарын хэрчим дээрх гэрээний бар (эхлэл→төгсгөл). */
function TimelineBar({ contract, year }: { contract: ChannelContract; year: number }) {
    const yearStart = new Date(year, 0, 1).getTime();
    const yearEnd = new Date(year + 1, 0, 1).getTime();
    const span = yearEnd - yearStart;
    const start = new Date(contract.start_date).getTime();
    const end = contract.end_date ? new Date(contract.end_date).getTime() : yearEnd;
    if (Number.isNaN(start) || end < yearStart || start > yearEnd) return null;

    const left = Math.max(0, ((start - yearStart) / span) * 100);
    const width = Math.max(1.5, ((Math.min(end, yearEnd) - Math.max(start, yearStart)) / span) * 100);
    const days = daysUntil(contract.end_date, new Date());
    const color =
        days !== null && days < 0
            ? 'bg-surface-3'
            : days !== null && days <= 7
              ? 'bg-status-danger'
              : days !== null && days <= 30
                ? 'bg-status-pending'
                : 'bg-status-success';

    return (
        <div className="relative h-3 rounded-full bg-surface-2 overflow-hidden">
            <div
                className={`absolute top-0 h-full rounded-full ${color}`}
                style={{ left: `${left}%`, width: `${width}%` }}
            />
        </div>
    );
}

export default function SourcesPage() {
    const { shop } = useAuth();
    const [channels, setChannels] = useState<MarketingChannel[]>([]);
    const [contracts, setContracts] = useState<ChannelContract[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [creating, setCreating] = useState(false);
    const [newChannel, setNewChannel] = useState({ name: '', type: 'social', description: '' });

    // Гэрээ нэмэх Sheet
    const [showContractModal, setShowContractModal] = useState(false);
    const [creatingContract, setCreatingContract] = useState(false);
    const [newContract, setNewContract] = useState({
        channel_id: '',
        start_date: new Date().toISOString().slice(0, 10),
        end_date: '',
        budget: '',
        kpi_target: '',
    });

    const fetchData = useCallback(async () => {
        if (!shop?.id) return;
        setLoading(true);
        try {
            // ЗААВАЛ shop_id-гаар шүүнэ (өмнө нь шүүлтгүй байсан — cross-tenant алдаа)
            const [channelsRes, contractsRes] = await Promise.all([
                supabase
                    .from('marketing_channels')
                    .select('*')
                    .eq('shop_id', shop.id)
                    .order('created_at', { ascending: false }),
                supabase
                    .from('channel_contracts')
                    .select('*')
                    .eq('shop_id', shop.id)
                    .order('end_date', { ascending: true, nullsFirst: false }),
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
    }, [shop?.id]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    const handleCreate = async () => {
        if (!newChannel.name.trim() || !shop?.id) return;
        setCreating(true);
        try {
            const { data, error } = await supabase.from('marketing_channels').insert([{
                shop_id: shop.id,
                name: newChannel.name.trim(), type: newChannel.type,
                status: 'active', description: newChannel.description || null,
            }]).select().single();
            if (error) throw error;
            setChannels(prev => [data, ...prev]);
            setShowCreateModal(false);
            setNewChannel({ name: '', type: 'social', description: '' });
            toast.success('Суваг нэмэгдлээ');
        } catch (err) {
            console.error('Create error:', err);
            toast.error('Суваг үүсгэж чадсангүй');
        }
        finally { setCreating(false); }
    };

    const handleCreateContract = async () => {
        if (!newContract.channel_id || !newContract.start_date || !shop?.id) return;
        setCreatingContract(true);
        try {
            const res = await fetch('/api/marketing/contracts', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'x-shop-id': shop.id },
                body: JSON.stringify({
                    channel_id: newContract.channel_id,
                    start_date: newContract.start_date,
                    end_date: newContract.end_date || null,
                    budget: Math.max(0, Number(newContract.budget) || 0),
                    kpi_target: newContract.kpi_target || undefined,
                    status: 'active',
                }),
            });
            if (!res.ok) throw new Error((await res.json().catch(() => null))?.error || 'Алдаа');
            setShowContractModal(false);
            setNewContract({
                channel_id: '',
                start_date: new Date().toISOString().slice(0, 10),
                end_date: '',
                budget: '',
                kpi_target: '',
            });
            toast.success('Гэрээ бүртгэгдлээ — дуусахаас 7 хоногийн өмнө сануулга ирнэ');
            fetchData();
        } catch (err) {
            toast.error(err instanceof Error ? err.message : 'Гэрээ үүсгэж чадсангүй');
        } finally {
            setCreatingContract(false);
        }
    };

    const filteredChannels = channels.filter(c =>
        c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (c.type && c.type.toLowerCase().includes(searchQuery.toLowerCase()))
    );

    const activeChannels = channels.filter(c => c.status === 'active').length;
    const activeContracts = contracts.filter(c => c.status === 'active');
    const totalBudget = activeContracts.reduce((sum, c) => sum + (c.budget || 0), 0);
    const endingSoon = activeContracts.filter((c) => {
        const d = daysUntil(c.end_date, new Date());
        return d !== null && d >= 0 && d <= 30;
    }).length;

    const formatCurrency = (v: number) => v >= 1000000 ? `${(v / 1000000).toFixed(1)}M₮` : v >= 1000 ? `${(v / 1000).toFixed(0)}K₮` : v.toLocaleString() + '₮';

    const getContractsForChannel = (channelId: string) => contracts.filter(c => c.channel_id === channelId);
    const channelName = (channelId: string) => channels.find((c) => c.id === channelId)?.name || 'Суваг';

    const channelBudget = (channelId: string) =>
        getContractsForChannel(channelId).filter(c => c.status === 'active').reduce((s, c) => s + (c.budget || 0), 0);

    const currentYear = new Date().getFullYear();
    const timelineContracts = contracts.filter((c) => {
        const start = new Date(c.start_date).getFullYear();
        const end = c.end_date ? new Date(c.end_date).getFullYear() : currentYear;
        return start <= currentYear && end >= currentYear;
    });

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
                subtitle="Сурталчилгааны сувгууд, гэрээнүүд болон хугацааны хяналт (билборд, радио...)"
                primaryAction={
                    <Button onClick={() => setShowCreateModal(true)} variant="primary" size="md">
                        <Plus className="w-4 h-4" /> Шинэ суваг
                    </Button>
                }
                secondaryActions={
                    <Button
                        onClick={() => setShowContractModal(true)}
                        variant="secondary"
                        size="md"
                        disabled={channels.length === 0}
                    >
                        <FileText className="w-4 h-4" /> Гэрээ нэмэх
                    </Button>
                }
            />

            {loading ? (
                <div className="flex items-center justify-center py-24"><Spinner size="lg" /></div>
            ) : (
                <>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                        <StatsCard title="Нийт суваг" value={channels.length} icon={Layers} iconColor="brand" />
                        <StatsCard title="Идэвхтэй" value={activeChannels} icon={CheckCircle2} iconColor="success" />
                        <StatsCard title="Идэвхтэй төсөв" value={formatCurrency(totalBudget)} icon={Wallet} iconColor="info" />
                        <StatsCard title="30 хоногт дуусах гэрээ" value={endingSoon} icon={CalendarClock} iconColor={endingSoon > 0 ? 'warning' : 'success'} />
                    </div>

                    {/* Гэрээний хугацааны таймлайн — билборд/радио зэрэг төлбөртэй сувгийг мартахгүй */}
                    {timelineContracts.length > 0 && (
                        <Card className="mb-6">
                            <CardHeader className="py-3">
                                <CardTitle className="text-base flex items-center gap-2">
                                    <CalendarClock className="w-4 h-4 text-brand" />
                                    Гэрээний хугацаа — {currentYear}
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-3">
                                <div className="grid grid-cols-12 text-[10px] text-muted-foreground">
                                    {Array.from({ length: 12 }, (_, i) => (
                                        <span key={i} className="text-center">{i + 1}с</span>
                                    ))}
                                </div>
                                {timelineContracts.map((c) => (
                                    <div key={c.id} className="space-y-1">
                                        <div className="flex items-center justify-between gap-2 text-sm">
                                            <span className="truncate">
                                                {channelName(c.channel_id)}
                                                <span className="text-muted-foreground text-xs">
                                                    {' '}· {formatShortDate(c.start_date)}
                                                    {c.end_date ? ` — ${formatShortDate(c.end_date)}` : ' —'}
                                                    {c.budget ? <> · <Money value={c.budget} compact /></> : null}
                                                </span>
                                            </span>
                                            <ContractDueBadge endDate={c.end_date} />
                                        </div>
                                        <TimelineBar contract={c} year={currentYear} />
                                    </div>
                                ))}
                            </CardContent>
                        </Card>
                    )}

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
                                    description="Маркетингийн суваг нэмнэ үү (билборд, радио, сошиал...)."
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
                                placeholder="ж: Замын билборд (Их тойруу), FM 104.5"
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
                                    <SelectItem value="traditional">Уламжлалт (билборд, радио, ТВ)</SelectItem>
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

            {/* Гэрээ нэмэх */}
            <Sheet open={showContractModal} onOpenChange={(open) => !open && setShowContractModal(false)}>
                <SheetContent side="right">
                    <SheetHeader>
                        <SheetTitle>Сувгийн гэрээ нэмэх</SheetTitle>
                        <SheetDescription>
                            Билборд, радио зэрэг төлбөртэй сувгийн хугацааг бүртгэвэл дуусахаас өмнө
                            (7/3/1 хоног) автомат сануулга ирнэ.
                        </SheetDescription>
                    </SheetHeader>

                    <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
                        <FormField label="Суваг" htmlFor="contract_channel" required>
                            <Select
                                value={newContract.channel_id}
                                onValueChange={(value) => setNewContract((p) => ({ ...p, channel_id: value }))}
                            >
                                <SelectTrigger id="contract_channel">
                                    <SelectValue placeholder="Суваг сонгох" />
                                </SelectTrigger>
                                <SelectContent>
                                    {channels.map((c) => (
                                        <SelectItem key={c.id} value={c.id}>
                                            {c.name}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </FormField>
                        <div className="grid grid-cols-2 gap-3">
                            <FormField label="Эхлэх огноо" htmlFor="contract_start" required>
                                <Input
                                    id="contract_start"
                                    type="date"
                                    value={newContract.start_date}
                                    onChange={(e) => setNewContract((p) => ({ ...p, start_date: e.target.value }))}
                                />
                            </FormField>
                            <FormField label="Дуусах огноо" htmlFor="contract_end">
                                <Input
                                    id="contract_end"
                                    type="date"
                                    value={newContract.end_date}
                                    onChange={(e) => setNewContract((p) => ({ ...p, end_date: e.target.value }))}
                                />
                            </FormField>
                        </div>
                        <FormField label="Төсөв (₮)" htmlFor="contract_budget">
                            <Input
                                id="contract_budget"
                                type="number"
                                min={0}
                                value={newContract.budget}
                                onChange={(e) => setNewContract((p) => ({ ...p, budget: e.target.value }))}
                                placeholder="ж: 5000000"
                            />
                        </FormField>
                        <FormField label="KPI зорилт" htmlFor="contract_kpi" hint="Заавал биш">
                            <Input
                                id="contract_kpi"
                                value={newContract.kpi_target}
                                onChange={(e) => setNewContract((p) => ({ ...p, kpi_target: e.target.value }))}
                                placeholder="ж: 50 лид / сар"
                            />
                        </FormField>
                    </div>

                    <SheetFooter>
                        <Button variant="secondary" onClick={() => setShowContractModal(false)}>Болих</Button>
                        <Button
                            variant="primary"
                            onClick={handleCreateContract}
                            disabled={!newContract.channel_id || !newContract.start_date || creatingContract}
                        >
                            {creatingContract ? <><Loader2 className="w-4 h-4 animate-spin" />Хадгалж байна...</> : <><Plus className="w-4 h-4" />Хадгалах</>}
                        </Button>
                    </SheetFooter>
                </SheetContent>
            </Sheet>
        </div>
    );
}

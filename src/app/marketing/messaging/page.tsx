'use client';

import React, { useState, useEffect } from 'react';
import { Mail, Plus, MessageSquare, Send, Eye, MousePointer } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { PageHeader } from '@/components/dashboard/PageHeader';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { StatsCard } from '@/components/dashboard/StatsCard';
import { Spinner } from '@/components/ui/Spinner';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/Tabs';
import {
    DataTable,
    type DataTableColumn,
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

interface MessageCampaign {
    id: string;
    type: string;
    name: string;
    subject: string;
    status: string;
    recipients: number;
    delivered: number;
    opened: number;
    clicked: number;
    sent_at: string;
}

export default function MessagingPage() {
    const { shop } = useAuth();
    const [campaigns, setCampaigns] = useState<MessageCampaign[]>([]);
    const [loading, setLoading] = useState(true);
    const [tab, setTab] = useState<'email' | 'sms'>('email');
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [creating, setCreating] = useState(false);
    const [newCamp, setNewCamp] = useState({ name: '', subject: '' });

    const handleCreate = async () => {
        if (!shop?.id || !newCamp.name.trim()) return;
        setCreating(true);
        try {
            const { data, error } = await supabase.from('message_campaigns').insert([{
                shop_id: shop.id, name: newCamp.name.trim(), subject: newCamp.subject || null,
                type: tab, status: 'draft', recipients: 0, delivered: 0, opened: 0, clicked: 0,
            }]).select().single();
            if (error) throw error;
            setCampaigns(prev => [data, ...prev]);
            setShowCreateModal(false);
            setNewCamp({ name: '', subject: '' });
        } catch (err) { console.error('Create error:', err); }
        finally { setCreating(false); }
    };

    useEffect(() => {
        if (!shop?.id) return;
        const fetch = async () => {
            setLoading(true);
            try {
                const { data, error } = await supabase
                    .from('message_campaigns')
                    .select('*')
                    .eq('shop_id', shop.id)
                    .eq('type', tab)
                    .order('created_at', { ascending: false });
                if (error) throw error;
                setCampaigns(data || []);
            } catch (error) {
                console.error('Error:', error);
            } finally {
                setLoading(false);
            }
        };
        fetch();
    }, [shop?.id, tab]);

    const totalSent = campaigns.reduce((s, c) => s + (c.recipients || 0), 0);
    const totalDelivered = campaigns.reduce((s, c) => s + (c.delivered || 0), 0);
    const totalOpened = campaigns.reduce((s, c) => s + (c.opened || 0), 0);
    const totalClicked = campaigns.reduce((s, c) => s + (c.clicked || 0), 0);
    const openRate = totalDelivered > 0 ? (totalOpened / totalDelivered * 100) : 0;
    const clickRate = totalDelivered > 0 ? (totalClicked / totalDelivered * 100) : 0;

    const columns: DataTableColumn<MessageCampaign>[] = [
        {
            key: 'name',
            header: 'Нэр',
            sortable: true,
            accessor: (c) => c.name,
            cell: (c) => (
                <div>
                    <p className="font-medium text-foreground">{c.name}</p>
                    {c.subject && <p className="text-xs text-muted-foreground">{c.subject}</p>}
                </div>
            ),
        },
        {
            key: 'status',
            header: 'Төлөв',
            cell: (c) => (
                <StatusPill variant={c.status === 'sent' ? 'success' : c.status === 'scheduled' ? 'info' : 'neutral'}>
                    {c.status === 'sent' ? 'Илгээсэн' : c.status === 'scheduled' ? 'Төлөвлөсөн' : 'Ноорог'}
                </StatusPill>
            ),
        },
        {
            key: 'recipients',
            header: 'Илгээсэн',
            align: 'right',
            sortable: true,
            accessor: (c) => c.recipients,
            cell: (c) => <span className="tabular-nums">{c.recipients}</span>,
        },
        {
            key: 'opened',
            header: 'Нээсэн',
            align: 'right',
            sortable: true,
            accessor: (c) => c.opened,
            cell: (c) => <span className="tabular-nums">{c.opened}</span>,
        },
        {
            key: 'clicked',
            header: 'Click',
            align: 'right',
            sortable: true,
            accessor: (c) => c.clicked,
            cell: (c) => <span className="tabular-nums">{c.clicked}</span>,
        },
        {
            key: 'sent_at',
            header: 'Огноо',
            align: 'right',
            cell: (c) => <DateText value={c.sent_at} className="text-muted-foreground" />,
        },
    ];

    return (
        <div>
            <PageHeader
                eyebrow="Маркетинг"
                title="Мессеж маркетинг"
                subtitle="Имэйл болон SMS кампанит ажлууд"
                primaryAction={
                    <Button onClick={() => setShowCreateModal(true)}>
                        <Plus className="w-4 h-4" />
                        Шинэ кампани
                    </Button>
                }
            />

            {/* Tab */}
            <Tabs value={tab} onValueChange={(v) => setTab(v as 'email' | 'sms')} className="mb-6">
                <TabsList>
                    <TabsTrigger value="email">
                        <Mail className="w-4 h-4" />
                        Имэйл
                    </TabsTrigger>
                    <TabsTrigger value="sms">
                        <MessageSquare className="w-4 h-4" />
                        SMS
                    </TabsTrigger>
                </TabsList>
            </Tabs>

            {/* Stats */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                <StatsCard title="Илгээсэн" value={totalSent.toLocaleString()} icon={Send} iconColor="info" />
                <StatsCard title="Хүргэсэн" value={totalDelivered.toLocaleString()} icon={MousePointer} iconColor="success" />
                <StatsCard title="Нээсэн хувь" value={`${openRate.toFixed(1)}%`} icon={Eye} iconColor="brand" />
                <StatsCard title="Click хувь" value={`${clickRate.toFixed(1)}%`} icon={MousePointer} iconColor="warning" />
            </div>

            {/* Campaigns Table */}
            {loading ? (
                <div className="flex items-center justify-center min-h-[300px]">
                    <div className="flex items-center gap-3">
                        <Spinner />
                        <span className="text-muted-foreground">Татаж байна...</span>
                    </div>
                </div>
            ) : (
                <DataTable
                    columns={columns}
                    data={campaigns}
                    getRowId={(c) => c.id}
                    caption={`${tab === 'email' ? 'Имэйл' : 'SMS'} кампанит ажлууд`}
                    emptyMessage={`${tab === 'email' ? 'Имэйл' : 'SMS'} кампанит ажлууд энд харагдана.`}
                />
            )}

            {/* Create Modal */}
            <Dialog open={showCreateModal} onOpenChange={setShowCreateModal}>
                <DialogContent showCloseButton={false} className="rounded-xl sm:max-w-md max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle className="heading-section text-lg text-foreground">
                            Шинэ {tab === 'email' ? 'имэйл' : 'SMS'} кампани
                        </DialogTitle>
                    </DialogHeader>
                    <FieldGroup>
                        <FormField label="Нэр" htmlFor="msg-name" required>
                            <Input id="msg-name" value={newCamp.name} onChange={e => setNewCamp(p => ({ ...p, name: e.target.value }))} placeholder="Кампанийн нэр" />
                        </FormField>
                        {tab === 'email' && (
                            <FormField label="Гарчиг (subject)" htmlFor="msg-subject">
                                <Input id="msg-subject" value={newCamp.subject} onChange={e => setNewCamp(p => ({ ...p, subject: e.target.value }))} placeholder="Имэйлийн гарчиг" />
                            </FormField>
                        )}
                    </FieldGroup>
                    <DialogFooter>
                        <Button variant="secondary" onClick={() => setShowCreateModal(false)}>Болих</Button>
                        <Button onClick={handleCreate} disabled={!newCamp.name.trim() || creating} isLoading={creating}>
                            {!creating && <Plus className="w-4 h-4" />}
                            Үүсгэх
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}

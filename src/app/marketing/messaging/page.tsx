'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Mail, Plus, Send, Eye, MousePointer, UserMinus, MessageSquare, X, Loader2 } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { Input } from '@/components/ui/Input';

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

    if (loading) {
        return (<div className="flex items-center justify-center min-h-[400px]"><div className="flex items-center gap-3"><div className="w-6 h-6 border-2 border-status-success border-t-transparent rounded-full animate-spin" /><span className="text-muted-foreground">Татаж байна...</span></div></div>);
    }

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-xl md:text-2xl font-bold text-foreground flex items-center gap-2">
                        <Mail className="w-6 h-6 text-status-success" />
                        Мессеж маркетинг
                    </h1>
                    <p className="text-sm text-muted-foreground mt-1">Имэйл болон SMS кампанит ажлууд</p>
                </div>
                <Button className="bg-status-success hover:bg-status-success text-white" onClick={() => setShowCreateModal(true)}><Plus className="w-4 h-4 mr-2" />Шинэ кампани</Button>
            </div>

            {/* Tab */}
            <div className="flex gap-2">
                <button onClick={() => setTab('email')} className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${tab === 'email' ? 'bg-status-success text-white' : 'bg-surface-2 text-muted-foreground hover:bg-surface-3'}`}>
                    <Mail className="w-4 h-4 inline mr-2" />Имэйл
                </button>
                <button onClick={() => setTab('sms')} className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${tab === 'sms' ? 'bg-status-success text-white' : 'bg-surface-2 text-muted-foreground hover:bg-surface-3'}`}>
                    <MessageSquare className="w-4 h-4 inline mr-2" />SMS
                </button>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <Card><CardContent className="p-4"><p className="text-sm text-muted-foreground">Илгээсэн</p><p className="text-2xl font-bold mt-1">{totalSent.toLocaleString()}</p></CardContent></Card>
                <Card><CardContent className="p-4"><p className="text-sm text-muted-foreground">Хүргэсэн</p><p className="text-2xl font-bold mt-1">{totalDelivered.toLocaleString()}</p></CardContent></Card>
                <Card><CardContent className="p-4"><p className="text-sm text-muted-foreground">Нээсэн хувь</p><p className="text-2xl font-bold mt-1">{openRate.toFixed(1)}%</p></CardContent></Card>
                <Card><CardContent className="p-4"><p className="text-sm text-muted-foreground">Click хувь</p><p className="text-2xl font-bold mt-1">{clickRate.toFixed(1)}%</p></CardContent></Card>
            </div>

            {/* Campaigns List */}
            <Card>
                <CardContent className="p-0">
                    {campaigns.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-16">
                            <Mail className="w-16 h-16 text-muted-foreground/60 mb-4" />
                            <h2 className="text-xl font-semibold text-foreground mb-2">Мэдээлэл байхгүй</h2>
                            <p className="text-muted-foreground">{tab === 'email' ? 'Имэйл' : 'SMS'} кампанит ажлууд энд харагдана.</p>
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full">
                                <thead className="bg-surface-2/40 border-b"><tr>
                                    <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase">Нэр</th>
                                    <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase">Төлөв</th>
                                    <th className="text-right px-4 py-3 text-xs font-medium text-muted-foreground uppercase">Илгээсэн</th>
                                    <th className="text-right px-4 py-3 text-xs font-medium text-muted-foreground uppercase">Нээсэн</th>
                                    <th className="text-right px-4 py-3 text-xs font-medium text-muted-foreground uppercase">Click</th>
                                    <th className="text-right px-4 py-3 text-xs font-medium text-muted-foreground uppercase">Огноо</th>
                                </tr></thead>
                                <tbody className="divide-y">
                                    {campaigns.map(c => (
                                        <tr key={c.id} className="hover:bg-surface-2/40">
                                            <td className="px-4 py-3"><p className="font-medium text-foreground">{c.name}</p>{c.subject && <p className="text-xs text-muted-foreground">{c.subject}</p>}</td>
                                            <td className="px-4 py-3"><span className={`px-2 py-1 text-xs rounded-full ${c.status === 'sent' ? 'bg-status-success-soft text-status-success' : 'bg-surface-2 text-muted-foreground'}`}>{c.status === 'sent' ? 'Илгээсэн' : c.status === 'scheduled' ? 'Төлөвлөсөн' : 'Ноорог'}</span></td>
                                            <td className="px-4 py-3 text-sm text-right">{c.recipients}</td>
                                            <td className="px-4 py-3 text-sm text-right">{c.opened}</td>
                                            <td className="px-4 py-3 text-sm text-right">{c.clicked}</td>
                                            <td className="px-4 py-3 text-sm text-right text-muted-foreground">{c.sent_at ? new Date(c.sent_at).toLocaleDateString('mn-MN') : '-'}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </CardContent>
            </Card>
            {showCreateModal && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                    <div className="bg-surface rounded-2xl w-full max-w-md shadow-2xl">
                        <div className="flex items-center justify-between px-6 py-4 border-b">
                            <h3 className="font-semibold text-foreground">Шинэ {tab === 'email' ? 'имэйл' : 'SMS'} кампани</h3>
                            <button onClick={() => setShowCreateModal(false)} className="p-2 hover:bg-surface-2 rounded-lg"><X className="w-5 h-5 text-muted-foreground/70" /></button>
                        </div>
                        <div className="px-6 py-4 space-y-4">
                            <div><label className="text-sm font-medium text-foreground block mb-1">Нэр *</label><Input value={newCamp.name} onChange={e => setNewCamp(p => ({ ...p, name: e.target.value }))} placeholder="Кампанийн нэр" /></div>
                            {tab === 'email' && <div><label className="text-sm font-medium text-foreground block mb-1">Гарчиг (subject)</label><Input value={newCamp.subject} onChange={e => setNewCamp(p => ({ ...p, subject: e.target.value }))} placeholder="Имэйлийн гарчиг" /></div>}
                        </div>
                        <div className="flex justify-end gap-3 px-6 py-4 border-t">
                            <Button variant="outline" onClick={() => setShowCreateModal(false)}>Болих</Button>
                            <Button className="bg-status-success hover:bg-status-success text-white" onClick={handleCreate} disabled={!newCamp.name.trim() || creating}>
                                {creating ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Үүсгэж байна...</> : <><Plus className="w-4 h-4 mr-2" />Үүсгэх</>}
                            </Button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

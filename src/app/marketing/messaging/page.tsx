'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Mail, Plus, Send, Eye, MousePointer, UserMinus, MessageSquare } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';

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
        return (<div className="flex items-center justify-center min-h-[400px]"><div className="flex items-center gap-3"><div className="w-6 h-6 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin" /><span className="text-gray-500">Татаж байна...</span></div></div>);
    }

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-xl md:text-2xl font-bold text-gray-900 flex items-center gap-2">
                        <Mail className="w-6 h-6 text-emerald-600" />
                        Мессеж маркетинг
                    </h1>
                    <p className="text-sm text-gray-500 mt-1">Имэйл болон SMS кампанит ажлууд</p>
                </div>
                <Button className="bg-emerald-600 hover:bg-emerald-700 text-white"><Plus className="w-4 h-4 mr-2" />Шинэ кампани</Button>
            </div>

            {/* Tab */}
            <div className="flex gap-2">
                <button onClick={() => setTab('email')} className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${tab === 'email' ? 'bg-emerald-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                    <Mail className="w-4 h-4 inline mr-2" />Имэйл
                </button>
                <button onClick={() => setTab('sms')} className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${tab === 'sms' ? 'bg-emerald-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                    <MessageSquare className="w-4 h-4 inline mr-2" />SMS
                </button>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <Card><CardContent className="p-4"><p className="text-sm text-gray-500">Илгээсэн</p><p className="text-2xl font-bold mt-1">{totalSent.toLocaleString()}</p></CardContent></Card>
                <Card><CardContent className="p-4"><p className="text-sm text-gray-500">Хүргэсэн</p><p className="text-2xl font-bold mt-1">{totalDelivered.toLocaleString()}</p></CardContent></Card>
                <Card><CardContent className="p-4"><p className="text-sm text-gray-500">Нээсэн хувь</p><p className="text-2xl font-bold mt-1">{openRate.toFixed(1)}%</p></CardContent></Card>
                <Card><CardContent className="p-4"><p className="text-sm text-gray-500">Click хувь</p><p className="text-2xl font-bold mt-1">{clickRate.toFixed(1)}%</p></CardContent></Card>
            </div>

            {/* Campaigns List */}
            <Card>
                <CardContent className="p-0">
                    {campaigns.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-16">
                            <Mail className="w-16 h-16 text-gray-300 mb-4" />
                            <h2 className="text-xl font-semibold text-gray-700 mb-2">Мэдээлэл байхгүй</h2>
                            <p className="text-gray-500">{tab === 'email' ? 'Имэйл' : 'SMS'} кампанит ажлууд энд харагдана.</p>
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full">
                                <thead className="bg-gray-50 border-b"><tr>
                                    <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Нэр</th>
                                    <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Төлөв</th>
                                    <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 uppercase">Илгээсэн</th>
                                    <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 uppercase">Нээсэн</th>
                                    <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 uppercase">Click</th>
                                    <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 uppercase">Огноо</th>
                                </tr></thead>
                                <tbody className="divide-y">
                                    {campaigns.map(c => (
                                        <tr key={c.id} className="hover:bg-gray-50">
                                            <td className="px-4 py-3"><p className="font-medium text-gray-900">{c.name}</p>{c.subject && <p className="text-xs text-gray-500">{c.subject}</p>}</td>
                                            <td className="px-4 py-3"><span className={`px-2 py-1 text-xs rounded-full ${c.status === 'sent' ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-600'}`}>{c.status === 'sent' ? 'Илгээсэн' : c.status === 'scheduled' ? 'Төлөвлөсөн' : 'Ноорог'}</span></td>
                                            <td className="px-4 py-3 text-sm text-right">{c.recipients}</td>
                                            <td className="px-4 py-3 text-sm text-right">{c.opened}</td>
                                            <td className="px-4 py-3 text-sm text-right">{c.clicked}</td>
                                            <td className="px-4 py-3 text-sm text-right text-gray-500">{c.sent_at ? new Date(c.sent_at).toLocaleDateString('mn-MN') : '-'}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}

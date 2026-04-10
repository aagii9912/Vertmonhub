'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { BarChart3, Plus, DollarSign, MousePointer, Eye, Target, TrendingUp, X, Loader2 } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { Input } from '@/components/ui/Input';

interface AdCampaign {
    id: string;
    platform: string;
    name: string;
    status: string;
    budget: number;
    spend: number;
    impressions: number;
    clicks: number;
    conversions: number;
    ctr: number;
    cpc: number;
}

export default function AdsPage() {
    const { shop } = useAuth();
    const [ads, setAds] = useState<AdCampaign[]>([]);
    const [loading, setLoading] = useState(true);
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [creating, setCreating] = useState(false);
    const [newAd, setNewAd] = useState({ name: '', platform: 'facebook', budget: 0 });

    const handleCreate = async () => {
        if (!shop?.id || !newAd.name.trim()) return;
        setCreating(true);
        try {
            const { data, error } = await supabase.from('ad_campaigns').insert([{
                shop_id: shop.id, name: newAd.name.trim(), platform: newAd.platform,
                status: 'draft', budget: newAd.budget, spend: 0, impressions: 0, clicks: 0, conversions: 0, ctr: 0, cpc: 0,
            }]).select().single();
            if (error) throw error;
            setAds(prev => [data, ...prev]);
            setShowCreateModal(false);
            setNewAd({ name: '', platform: 'facebook', budget: 0 });
        } catch (err) { console.error('Create error:', err); }
        finally { setCreating(false); }
    };

    useEffect(() => {
        if (!shop?.id) return;
        const fetch = async () => {
            setLoading(true);
            try {
                const { data, error } = await supabase
                    .from('ad_campaigns')
                    .select('*')
                    .eq('shop_id', shop.id)
                    .order('created_at', { ascending: false });
                if (error) throw error;
                setAds(data || []);
            } catch (error) {
                console.error('Error:', error);
            } finally {
                setLoading(false);
            }
        };
        fetch();
    }, [shop?.id]);

    const totalSpend = ads.reduce((s, a) => s + (a.spend || 0), 0);
    const totalClicks = ads.reduce((s, a) => s + (a.clicks || 0), 0);
    const totalImpressions = ads.reduce((s, a) => s + (a.impressions || 0), 0);
    const totalConversions = ads.reduce((s, a) => s + (a.conversions || 0), 0);
    const avgCtr = totalImpressions > 0 ? (totalClicks / totalImpressions * 100) : 0;
    const avgCpc = totalClicks > 0 ? totalSpend / totalClicks : 0;

    const formatCurrency = (v: number) => v >= 1000000 ? `${(v / 1000000).toFixed(1)}M₮` : v >= 1000 ? `${(v / 1000).toFixed(0)}K₮` : v.toLocaleString() + '₮';

    if (loading) {
        return (<div className="flex items-center justify-center min-h-[400px]"><div className="flex items-center gap-3"><div className="w-6 h-6 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin" /><span className="text-gray-500">Татаж байна...</span></div></div>);
    }

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-xl md:text-2xl font-bold text-gray-900 flex items-center gap-2">
                        <BarChart3 className="w-6 h-6 text-emerald-600" />
                        Зар сурталчилгаа
                    </h1>
                    <p className="text-sm text-gray-500 mt-1">Төлбөрт зарын кампанит ажлууд</p>
                </div>
                <Button className="bg-emerald-600 hover:bg-emerald-700 text-white" onClick={() => setShowCreateModal(true)}><Plus className="w-4 h-4 mr-2" />Шинэ зар</Button>
            </div>

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <Card><CardContent className="p-4"><p className="text-sm text-gray-500">Нийт зарцуулалт</p><p className="text-2xl font-bold mt-1">{formatCurrency(totalSpend)}</p></CardContent></Card>
                <Card><CardContent className="p-4"><p className="text-sm text-gray-500">CTR</p><p className="text-2xl font-bold mt-1">{avgCtr.toFixed(2)}%</p></CardContent></Card>
                <Card><CardContent className="p-4"><p className="text-sm text-gray-500">CPC</p><p className="text-2xl font-bold mt-1">{formatCurrency(avgCpc)}</p></CardContent></Card>
                <Card><CardContent className="p-4"><p className="text-sm text-gray-500">Хөрвүүлэлт</p><p className="text-2xl font-bold mt-1">{totalConversions}</p></CardContent></Card>
            </div>

            <Card>
                <CardContent className="p-0">
                    {ads.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-16">
                            <BarChart3 className="w-16 h-16 text-gray-300 mb-4" />
                            <h2 className="text-xl font-semibold text-gray-700 mb-2">Мэдээлэл байхгүй</h2>
                            <p className="text-gray-500">Зар сурталчилгааны мэдээлэл энд харагдана.</p>
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full">
                                <thead className="bg-gray-50 border-b"><tr>
                                    <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Нэр</th>
                                    <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Платформ</th>
                                    <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Төлөв</th>
                                    <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 uppercase">Зарцуулалт</th>
                                    <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 uppercase">Click</th>
                                    <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 uppercase">CTR</th>
                                </tr></thead>
                                <tbody className="divide-y">
                                    {ads.map(ad => (
                                        <tr key={ad.id} className="hover:bg-gray-50">
                                            <td className="px-4 py-3 font-medium text-gray-900">{ad.name}</td>
                                            <td className="px-4 py-3 text-sm text-gray-600 capitalize">{ad.platform}</td>
                                            <td className="px-4 py-3"><span className={`px-2 py-1 text-xs rounded-full ${ad.status === 'active' ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-600'}`}>{ad.status === 'active' ? 'Идэвхтэй' : ad.status === 'paused' ? 'Зогссон' : ad.status}</span></td>
                                            <td className="px-4 py-3 text-sm text-right">{formatCurrency(ad.spend)}</td>
                                            <td className="px-4 py-3 text-sm text-right">{ad.clicks.toLocaleString()}</td>
                                            <td className="px-4 py-3 text-sm text-right">{ad.ctr.toFixed(2)}%</td>
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
                    <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl">
                        <div className="flex items-center justify-between px-6 py-4 border-b">
                            <h3 className="font-semibold text-gray-900">Шинэ зар</h3>
                            <button onClick={() => setShowCreateModal(false)} className="p-2 hover:bg-gray-100 rounded-lg"><X className="w-5 h-5 text-gray-400" /></button>
                        </div>
                        <div className="px-6 py-4 space-y-4">
                            <div><label className="text-sm font-medium text-gray-700 block mb-1">Нэр *</label><Input value={newAd.name} onChange={e => setNewAd(p => ({ ...p, name: e.target.value }))} placeholder="Зарын нэр" /></div>
                            <div><label className="text-sm font-medium text-gray-700 block mb-1">Платформ</label>
                                <select value={newAd.platform} onChange={e => setNewAd(p => ({ ...p, platform: e.target.value }))} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm">
                                    <option value="facebook">Facebook</option><option value="instagram">Instagram</option><option value="google">Google</option><option value="tiktok">TikTok</option>
                                </select></div>
                            <div><label className="text-sm font-medium text-gray-700 block mb-1">Төсөв (₮)</label><Input type="number" value={newAd.budget} onChange={e => setNewAd(p => ({ ...p, budget: Number(e.target.value) }))} /></div>
                        </div>
                        <div className="flex justify-end gap-3 px-6 py-4 border-t">
                            <Button variant="outline" onClick={() => setShowCreateModal(false)}>Болих</Button>
                            <Button className="bg-emerald-600 hover:bg-emerald-700 text-white" onClick={handleCreate} disabled={!newAd.name.trim() || creating}>
                                {creating ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Үүсгэж байна...</> : <><Plus className="w-4 h-4 mr-2" />Үүсгэх</>}
                            </Button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

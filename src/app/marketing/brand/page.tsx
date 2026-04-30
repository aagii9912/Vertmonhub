'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/Card';
import { Sparkles, ThumbsUp, ThumbsDown, Minus, Globe, MessageCircle, TrendingUp } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';

interface BrandMention {
    id: string;
    source: string;
    platform: string;
    content: string;
    sentiment: string;
    reach: number;
    author: string;
    mentioned_at: string;
}

export default function BrandPage() {
    const { shop } = useAuth();
    const [mentions, setMentions] = useState<BrandMention[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!shop?.id) return;
        const fetch = async () => {
            setLoading(true);
            try {
                const { data, error } = await supabase
                    .from('brand_mentions')
                    .select('*')
                    .eq('shop_id', shop.id)
                    .order('mentioned_at', { ascending: false })
                    .limit(50);
                if (error) throw error;
                setMentions(data || []);
            } catch (error) {
                console.error('Error:', error);
            } finally {
                setLoading(false);
            }
        };
        fetch();
    }, [shop?.id]);

    const positive = mentions.filter(m => m.sentiment === 'positive').length;
    const neutral = mentions.filter(m => m.sentiment === 'neutral').length;
    const negative = mentions.filter(m => m.sentiment === 'negative').length;
    const totalReach = mentions.reduce((s, m) => s + (m.reach || 0), 0);

    const sentimentIcon = (s: string) => s === 'positive' ? <ThumbsUp className="w-3 h-3 text-status-success" /> : s === 'negative' ? <ThumbsDown className="w-3 h-3 text-status-danger" /> : <Minus className="w-3 h-3 text-muted-foreground" />;
    const sentimentColor = (s: string) => s === 'positive' ? 'bg-status-success-soft text-status-success' : s === 'negative' ? 'bg-status-danger-soft text-status-danger' : 'bg-surface-2 text-muted-foreground';

    if (loading) {
        return (<div className="flex items-center justify-center min-h-[400px]"><div className="flex items-center gap-3"><div className="w-6 h-6 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin" /><span className="text-muted-foreground">Татаж байна...</span></div></div>);
    }

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-xl md:text-2xl font-bold text-foreground flex items-center gap-2">
                    <Sparkles className="w-6 h-6 text-status-success" />
                    Брэнд мониторинг
                </h1>
                <p className="text-sm text-muted-foreground mt-1">Брэндийн дурдагдал болон сэтгэгдэл</p>
            </div>

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <Card><CardContent className="p-4"><p className="text-sm text-muted-foreground">Нийт дурдагдал</p><p className="text-2xl font-bold mt-1">{mentions.length}</p></CardContent></Card>
                <Card><CardContent className="p-4"><p className="text-sm text-muted-foreground">Эерэг</p><p className="text-2xl font-bold mt-1 text-status-success">{positive}</p></CardContent></Card>
                <Card><CardContent className="p-4"><p className="text-sm text-muted-foreground">Сөрөг</p><p className="text-2xl font-bold mt-1 text-status-danger">{negative}</p></CardContent></Card>
                <Card><CardContent className="p-4"><p className="text-sm text-muted-foreground">Хүрэлт</p><p className="text-2xl font-bold mt-1">{totalReach.toLocaleString()}</p></CardContent></Card>
            </div>

            {/* Sentiment bar */}
            {mentions.length > 0 && (
                <Card>
                    <CardContent className="p-4">
                        <h3 className="text-sm font-medium text-foreground mb-3">Сэтгэгдлийн хуваарилалт</h3>
                        <div className="flex rounded-full overflow-hidden h-4">
                            {positive > 0 && <div className="bg-status-success transition-all" style={{ width: `${(positive / mentions.length) * 100}%` }} />}
                            {neutral > 0 && <div className="bg-border-strong transition-all" style={{ width: `${(neutral / mentions.length) * 100}%` }} />}
                            {negative > 0 && <div className="bg-status-danger transition-all" style={{ width: `${(negative / mentions.length) * 100}%` }} />}
                        </div>
                        <div className="flex justify-between mt-2 text-xs text-muted-foreground">
                            <span>Эерэг {mentions.length > 0 ? Math.round((positive / mentions.length) * 100) : 0}%</span>
                            <span>Төвийг сахисан {mentions.length > 0 ? Math.round((neutral / mentions.length) * 100) : 0}%</span>
                            <span>Сөрөг {mentions.length > 0 ? Math.round((negative / mentions.length) * 100) : 0}%</span>
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* Mentions List */}
            <Card>
                <CardContent className="p-0">
                    {mentions.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-16">
                            <Sparkles className="w-16 h-16 text-muted-foreground/60 mb-4" />
                            <h2 className="text-xl font-semibold text-foreground mb-2">Мэдээлэл байхгүй</h2>
                            <p className="text-muted-foreground">Брэндийн дурдагдлын мэдээлэл энд харагдана.</p>
                        </div>
                    ) : (
                        <div className="divide-y">
                            {mentions.map(m => (
                                <div key={m.id} className="p-4 hover:bg-surface-2/40">
                                    <div className="flex items-start justify-between">
                                        <div className="flex-1">
                                            <div className="flex items-center gap-2 mb-1">
                                                <Globe className="w-3 h-3 text-muted-foreground/70" />
                                                <span className="text-xs text-muted-foreground">{m.source}</span>
                                                <span className={`px-2 py-0.5 text-xs rounded-full flex items-center gap-1 ${sentimentColor(m.sentiment)}`}>
                                                    {sentimentIcon(m.sentiment)}
                                                    {m.sentiment === 'positive' ? 'Эерэг' : m.sentiment === 'negative' ? 'Сөрөг' : 'Төвийг сахисан'}
                                                </span>
                                            </div>
                                            <p className="text-sm text-foreground line-clamp-2">{m.content}</p>
                                            {m.author && <p className="text-xs text-muted-foreground/70 mt-1">— {m.author}</p>}
                                        </div>
                                        <span className="text-xs text-muted-foreground/70 ml-4">{new Date(m.mentioned_at).toLocaleDateString('mn-MN')}</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}

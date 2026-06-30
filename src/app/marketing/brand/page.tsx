'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/Card';
import { PageHeader } from '@/components/dashboard/PageHeader';
import { StatsCard } from '@/components/dashboard/StatsCard';
import { ChartCard } from '@/components/ui/ChartCard';
import { BarChart } from '@/components/charts/BarChart';
import { Spinner } from '@/components/ui/Spinner';
import { EmptyState } from '@/components/ui/EmptyState';
import { StatusPill } from '@/components/ui/StatusPill';
import { Sparkles, ThumbsUp, ThumbsDown, Minus, Globe, Megaphone } from 'lucide-react';
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

    const sentimentIcon = (s: string) => s === 'positive' ? <ThumbsUp className="w-3 h-3" /> : s === 'negative' ? <ThumbsDown className="w-3 h-3" /> : <Minus className="w-3 h-3" />;
    const sentimentVariant = (s: string): 'success' | 'danger' | 'neutral' => s === 'positive' ? 'success' : s === 'negative' ? 'danger' : 'neutral';

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-[400px]">
                <Spinner size="md" label="Татаж байна..." />
            </div>
        );
    }

    return (
        <div>
            <PageHeader
                eyebrow="Маркетинг"
                title="Брэнд мониторинг"
                subtitle="Брэндийн дурдагдал болон сэтгэгдэл"
            />

            <div className="space-y-6">
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
                    <StatsCard
                        icon={Megaphone}
                        iconColor="info"
                        title="Нийт дурдагдал"
                        value={mentions.length}
                    />
                    <StatsCard
                        icon={ThumbsUp}
                        iconColor="success"
                        title="Эерэг"
                        value={positive}
                    />
                    <StatsCard
                        icon={ThumbsDown}
                        iconColor="danger"
                        title="Сөрөг"
                        value={negative}
                    />
                    <StatsCard
                        icon={Globe}
                        iconColor="brand"
                        title="Хүрэлт"
                        value={totalReach.toLocaleString()}
                    />
                </div>

                {/* Sentiment distribution */}
                {mentions.length > 0 && (
                    <ChartCard
                        title="Сэтгэгдлийн хуваарилалт"
                        subtitle={`Эерэг ${Math.round((positive / mentions.length) * 100)}% · Төвийг сахисан ${Math.round((neutral / mentions.length) * 100)}% · Сөрөг ${Math.round((negative / mentions.length) * 100)}%`}
                        height={140}
                    >
                        <BarChart
                            data={[{ label: 'Сэтгэгдэл', positive, neutral, negative }]}
                            xKey="label"
                            series={[
                                { key: 'positive', name: 'Эерэг' },
                                { key: 'neutral', name: 'Төвийг сахисан' },
                                { key: 'negative', name: 'Сөрөг' },
                            ]}
                            horizontal
                            stacked
                            valueFormatter={(v) => v.toLocaleString()}
                        />
                    </ChartCard>
                )}

                {/* Mentions List */}
                {mentions.length === 0 ? (
                    <EmptyState
                        icon={<Sparkles className="w-7 h-7" />}
                        title="Мэдээлэл байхгүй"
                        description="Брэндийн дурдагдлын мэдээлэл энд харагдана."
                    />
                ) : (
                    <Card>
                        <CardContent className="p-0">
                            <div className="divide-y divide-border">
                                {mentions.map(m => (
                                    <div key={m.id} className="p-4 hover:bg-surface-2/40 transition-colors">
                                        <div className="flex items-start justify-between">
                                            <div className="flex-1">
                                                <div className="flex items-center gap-2 mb-1">
                                                    <Globe className="w-3 h-3 text-muted-foreground/70" />
                                                    <span className="text-xs text-muted-foreground">{m.source}</span>
                                                    <StatusPill variant={sentimentVariant(m.sentiment)}>
                                                        {sentimentIcon(m.sentiment)}
                                                        {m.sentiment === 'positive' ? 'Эерэг' : m.sentiment === 'negative' ? 'Сөрөг' : 'Төвийг сахисан'}
                                                    </StatusPill>
                                                </div>
                                                <p className="text-sm text-foreground line-clamp-2">{m.content}</p>
                                                {m.author && <p className="text-xs text-muted-foreground/70 mt-1">— {m.author}</p>}
                                            </div>
                                            <span className="text-xs text-muted-foreground/70 ml-4">{new Date(m.mentioned_at).toLocaleDateString('mn-MN')}</span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </CardContent>
                    </Card>
                )}
            </div>
        </div>
    );
}

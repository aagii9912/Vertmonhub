'use client';

import { Card, CardContent } from '@/components/ui/Card';
import type { AIStats } from './types';

interface StatsTabProps { stats: AIStats | null; }

export default function StatsTab({ stats }: StatsTabProps) {
    return (
        <div className="space-y-6">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <Card><CardContent className="p-4 text-center"><p className="text-3xl font-bold text-brand-strong">{stats?.total_conversations || 0}</p><p className="text-sm text-muted-foreground">Нийт яриа</p></CardContent></Card>
                <Card><CardContent className="p-4 text-center"><p className="text-3xl font-bold text-brand-strong">{stats?.recent_conversations || 0}</p><p className="text-sm text-muted-foreground">Сүүлийн 7 хоног</p></CardContent></Card>
                <Card><CardContent className="p-4 text-center"><p className="text-3xl font-bold text-brand-strong">{stats?.total_messages || 0}</p><p className="text-sm text-muted-foreground">Нийт мессеж</p></CardContent></Card>
                <Card><CardContent className="p-4 text-center"><p className="text-3xl font-bold text-status-success">{stats?.conversion_rate?.toFixed(1) || 0}%</p><p className="text-sm text-muted-foreground">Захиалга болсон</p></CardContent></Card>
            </div>

            <Card>
                <CardContent className="p-6">
                    <h2 className="font-semibold text-foreground mb-4">Түгээмэл асуултууд</h2>
                    {stats?.top_questions?.length ? (
                        <div className="space-y-3">
                            {stats.top_questions.map((q, i) => (
                                <div key={i} className="flex justify-between items-center p-3 bg-surface-2/40 rounded-lg">
                                    <div>
                                        <p className="text-sm text-foreground">{q.sample_question}</p>
                                        <span className="text-xs text-muted-foreground">{q.category}</span>
                                    </div>
                                    <span className="px-2 py-1 bg-brand-soft text-brand-strong text-sm font-medium rounded">{q.count}x</span>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <p className="text-muted-foreground text-center py-8">Статистик цуглаагүй байна.</p>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}

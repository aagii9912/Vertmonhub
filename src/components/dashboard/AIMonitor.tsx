import React from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { StatsCard } from '@/components/dashboard/StatsCard';
import { Bot, Zap, Target } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

const dummyAiStats = [
    { name: '09:00', automated: 45, handoff: 5 },
    { name: '12:00', automated: 82, handoff: 12 },
    { name: '15:00', automated: 65, handoff: 8 },
    { name: '18:00', automated: 95, handoff: 15 },
    { name: '21:00', automated: 78, handoff: 10 },
];

export function AIMonitor() {
    return (
        <div className="space-y-4">
            {/* AI Highlight Stats */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <StatsCard title="AI Харилцаа" value="156" icon={Bot} iconColor="brand" />
                <StatsCard title="Авт. шийдвэрлэлт" value="92%" icon={Zap} iconColor="warning" />
            </div>

            {/* AI Performance Chart */}
            <Card>
                <CardHeader>
                    <CardTitle className="text-sm flex items-center gap-2">
                        <Target className="w-4 h-4 text-brand" />
                        AI Performance
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="h-[200px] w-full">
                        <ResponsiveContainer width="100%" height="100%">
                            <LineChart data={dummyAiStats}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
                                <XAxis
                                    dataKey="name"
                                    axisLine={false}
                                    tickLine={false}
                                    tick={{ fontSize: 10, fill: 'var(--muted)' }}
                                />
                                <YAxis hide />
                                <Tooltip
                                    contentStyle={{
                                        borderRadius: 'var(--r-md)',
                                        border: '1px solid var(--border)',
                                        background: 'var(--surface)',
                                        boxShadow: 'var(--shadow-md)',
                                    }}
                                    itemStyle={{ fontSize: '11px', fontWeight: 500, color: 'var(--fg)' }}
                                />
                                <Line
                                    type="monotone"
                                    dataKey="automated"
                                    stroke="var(--brand)"
                                    strokeWidth={3}
                                    dot={false}
                                    name="AI Шийдсэн"
                                />
                                <Line
                                    type="monotone"
                                    dataKey="handoff"
                                    stroke="var(--status-pending)"
                                    strokeWidth={2}
                                    strokeDasharray="5 5"
                                    dot={false}
                                    name="Хүнд шилжүүлсэн"
                                />
                            </LineChart>
                        </ResponsiveContainer>
                    </div>
                    <div className="flex items-center gap-4 mt-4 justify-center">
                        <div className="flex items-center gap-1.5">
                            <span className="w-2.5 h-2.5 rounded-full bg-brand" />
                            <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">AI Automated</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                            <span className="w-2.5 h-2.5 rounded-full bg-status-pending" />
                            <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Human Handoff</span>
                        </div>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}

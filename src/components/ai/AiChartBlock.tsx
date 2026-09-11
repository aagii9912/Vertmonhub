'use client';

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line } from 'recharts';

/**
 * AI хариуны диаграм. AiChat-аас `next/dynamic`-аар (ssr:false) ачаална — AiChat нь
 * AppShell-д үргэлж mounted тул recharts (~300KB) өмнө нь dashboard-ийн БҮХ хуудсанд
 * ордог байв (2026-09 review M24). Одоо зөвхөн диаграм харагдах үед татна.
 */
export interface AiChartConfig {
    type?: string;
    data?: { name: string; value: number }[];
}

export function AiChartBlock({ cfg, compact }: { cfg: AiChartConfig; compact: boolean }) {
    const data = cfg.data || [];
    const H = compact ? 160 : 220;
    return (
        <div className="mt-2 rounded-md border border-border bg-surface p-2">
            <ResponsiveContainer width="100%" height={H}>
                {cfg.type === 'line' ? (
                    <LineChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                        <CartesianGrid stroke="var(--border)" vertical={false} />
                        <XAxis dataKey="name" tick={{ fontSize: 10.5, fill: 'var(--muted)' }} axisLine={false} tickLine={false} />
                        <YAxis tick={{ fontSize: 10.5, fill: 'var(--muted)' }} axisLine={false} tickLine={false} width={44} />
                        <Tooltip contentStyle={{ fontSize: 12, borderRadius: 6, border: '1px solid var(--border)' }} />
                        <Line type="monotone" dataKey="value" stroke="var(--brand)" strokeWidth={2} dot={false} />
                    </LineChart>
                ) : (
                    <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                        <CartesianGrid stroke="var(--border)" vertical={false} />
                        <XAxis dataKey="name" tick={{ fontSize: 10.5, fill: 'var(--muted)' }} axisLine={false} tickLine={false} />
                        <YAxis tick={{ fontSize: 10.5, fill: 'var(--muted)' }} axisLine={false} tickLine={false} width={44} />
                        <Tooltip contentStyle={{ fontSize: 12, borderRadius: 6, border: '1px solid var(--border)' }} />
                        <Bar dataKey="value" fill="var(--brand)" radius={[3, 3, 0, 0]} />
                    </BarChart>
                )}
            </ResponsiveContainer>
        </div>
    );
}

export default AiChartBlock;

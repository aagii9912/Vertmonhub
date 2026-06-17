'use client';

import { useMemo } from 'react';
import {
    ResponsiveContainer,
    LineChart,
    Line,
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    Legend,
} from 'recharts';
import { useChartColors } from '@/hooks/useChartColors';

interface ChartDataPoint {
    date: string;
    revenue: number;
    label: string;
}

interface SalesChartProps {
    data: ChartDataPoint[];
    type?: 'line' | 'bar';
    height?: number;
}

const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
        return (
            <div className="bg-surface p-3 rounded-lg shadow-lg border border-border">
                <p className="font-medium text-sm text-foreground">{label}</p>
                <p className="text-primary font-semibold">
                    ₮{Number(payload[0].value).toLocaleString()}
                </p>
            </div>
        );
    }
    return null;
};

export function SalesChart({ data, type = 'line', height = 300 }: SalesChartProps) {
    const formatRevenue = (value: number) => {
        if (value >= 1000000) {
            return `${(value / 1000000).toFixed(1)}M`;
        }
        if (value >= 1000) {
            return `${(value / 1000).toFixed(0)}K`;
        }
        return value.toString();
    };



    const chartData = useMemo(() => data || [], [data]);
    const c = useChartColors();

    if (chartData.length === 0) {
        return (
            <div className="flex items-center justify-center h-[300px] bg-surface-2/40 rounded-lg">
                <p className="text-muted-foreground">Өгөгдөл байхгүй</p>
            </div>
        );
    }

    const commonProps = {
        data: chartData,
        margin: { top: 5, right: 20, left: 10, bottom: 5 },
    };

    return (
        <ResponsiveContainer width="100%" height={height}>
            {type === 'line' ? (
                <LineChart {...commonProps}>
                    <CartesianGrid strokeDasharray="3 3" stroke={c.grid} />
                    <XAxis
                        dataKey="label"
                        tick={{ fontSize: 12, fill: c.axis }}
                        tickLine={false}
                        axisLine={{ stroke: c.grid }}
                    />
                    <YAxis
                        tickFormatter={formatRevenue}
                        tick={{ fontSize: 12, fill: c.axis }}
                        tickLine={false}
                        axisLine={{ stroke: c.grid }}
                    />
                    <Tooltip content={<CustomTooltip />} />
                    <Line
                        type="monotone"
                        dataKey="revenue"
                        stroke={c.line}
                        strokeWidth={2}
                        dot={{ fill: c.line, strokeWidth: 2, r: 4 }}
                        activeDot={{ r: 6, fill: c.line }}
                    />
                </LineChart>
            ) : (
                <BarChart {...commonProps}>
                    <CartesianGrid strokeDasharray="3 3" stroke={c.grid} />
                    <XAxis
                        dataKey="label"
                        tick={{ fontSize: 12, fill: c.axis }}
                        tickLine={false}
                        axisLine={{ stroke: c.grid }}
                    />
                    <YAxis
                        tickFormatter={formatRevenue}
                        tick={{ fontSize: 12, fill: c.axis }}
                        tickLine={false}
                        axisLine={{ stroke: c.grid }}
                    />
                    <Tooltip content={<CustomTooltip />} />
                    <Bar
                        dataKey="revenue"
                        fill={c.line}
                        radius={[4, 4, 0, 0]}
                    />
                </BarChart>
            )}
        </ResponsiveContainer>
    );
}

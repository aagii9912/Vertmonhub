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
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis
                        dataKey="label"
                        tick={{ fontSize: 12, fill: '#6b7280' }}
                        tickLine={false}
                        axisLine={{ stroke: '#e5e7eb' }}
                    />
                    <YAxis
                        tickFormatter={formatRevenue}
                        tick={{ fontSize: 12, fill: '#6b7280' }}
                        tickLine={false}
                        axisLine={{ stroke: '#e5e7eb' }}
                    />
                    <Tooltip content={<CustomTooltip />} />
                    <Line
                        type="monotone"
                        dataKey="revenue"
                        stroke="#D4AF37"
                        strokeWidth={2}
                        dot={{ fill: '#D4AF37', strokeWidth: 2, r: 4 }}
                        activeDot={{ r: 6, fill: '#D4AF37' }}
                    />
                </LineChart>
            ) : (
                <BarChart {...commonProps}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis
                        dataKey="label"
                        tick={{ fontSize: 12, fill: '#6b7280' }}
                        tickLine={false}
                        axisLine={{ stroke: '#e5e7eb' }}
                    />
                    <YAxis
                        tickFormatter={formatRevenue}
                        tick={{ fontSize: 12, fill: '#6b7280' }}
                        tickLine={false}
                        axisLine={{ stroke: '#e5e7eb' }}
                    />
                    <Tooltip content={<CustomTooltip />} />
                    <Bar
                        dataKey="revenue"
                        fill="#D4AF37"
                        radius={[4, 4, 0, 0]}
                    />
                </BarChart>
            )}
        </ResponsiveContainer>
    );
}

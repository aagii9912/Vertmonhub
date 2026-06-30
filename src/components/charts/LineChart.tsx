'use client';

import * as React from 'react';
import {
    LineChart as RLineChart,
    Line,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    Legend,
} from 'recharts';
import { useChartColors } from '@/hooks/useChartColors';
import { ChartTooltip } from '@/components/charts/ChartTooltip';

/**
 * LineChart — recharts LineChart-ийн нимгэн wrapper.
 *
 * ResponsiveContainer-гүй — `<ChartCard>` дотор шууд байрлуулна.
 *
 * Жишээ:
 *   <ChartCard title="Лидийн чиг хандлага" height={280}>
 *     <LineChart
 *       data={[{ week: '7 хоног 1', leads: 12 }, { week: '7 хоног 2', leads: 19 }]}
 *       xKey="week"
 *       series={[{ key: 'leads', name: 'Лид' }]}
 *     />
 *   </ChartCard>
 */
export interface LineSeries {
    key: string;
    name?: string;
    color?: string;
    /** Зураасан шугам (тасархай). default false */
    dashed?: boolean;
}

export interface LineChartProps {
    data: Array<Record<string, number | string>>;
    xKey: string;
    series: LineSeries[];
    /** Шугамын төрөл. default 'monotone' (гөлгөр) */
    curve?: 'monotone' | 'linear' | 'step';
    /** Цэгүүд харуулах. default false (цэвэр шугам) */
    dots?: boolean;
    valueFormatter?: (value: number) => string;
    showLegend?: boolean;
    showGrid?: boolean;
    /** Шугамын зузаан. default 2 */
    strokeWidth?: number;
    animate?: boolean;
}

export function LineChart({
    data,
    xKey,
    series,
    curve = 'monotone',
    dots = false,
    valueFormatter,
    showLegend,
    showGrid = true,
    strokeWidth = 2,
    animate = true,
}: LineChartProps) {
    const c = useChartColors();
    const legend = showLegend ?? series.length > 1;
    const colorAt = (i: number) => c.series[i % c.series.length];

    const axisTick = { fontSize: 12, fill: c.axis };
    const axisLine = { stroke: c.grid };

    return (
        <RLineChart data={data} margin={{ top: 8, right: 12, left: 4, bottom: 4 }}>
            {showGrid && <CartesianGrid strokeDasharray="3 3" stroke={c.grid} vertical={false} />}
            <XAxis dataKey={xKey} tick={axisTick} tickLine={false} axisLine={axisLine} />
            <YAxis tick={axisTick} tickLine={false} axisLine={axisLine} tickFormatter={valueFormatter} width={48} />
            <Tooltip
                cursor={{ stroke: c.grid, strokeWidth: 1 }}
                content={<ChartTooltip formatter={valueFormatter} showName={series.length > 1} />}
            />
            {legend && (
                <Legend wrapperStyle={{ fontSize: 12, color: c.axis, paddingTop: 8 }} iconType="circle" iconSize={8} />
            )}
            {series.map((s, si) => {
                const color = s.color ?? colorAt(si);
                return (
                    <Line
                        key={s.key}
                        type={curve}
                        dataKey={s.key}
                        name={s.name ?? s.key}
                        stroke={color}
                        strokeWidth={strokeWidth}
                        strokeDasharray={s.dashed ? '5 4' : undefined}
                        dot={dots ? { fill: color, strokeWidth: 0, r: 3 } : false}
                        activeDot={{ r: 5, fill: color, stroke: c.surface, strokeWidth: 2 }}
                        isAnimationActive={animate}
                        animationDuration={animate ? 700 : 0}
                    />
                );
            })}
        </RLineChart>
    );
}

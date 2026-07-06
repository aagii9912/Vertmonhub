'use client';

import * as React from 'react';
import {
    ComposedChart,
    Bar,
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
 * ComboChart — багана + шугам хосолсон, хоёр тэнхлэгтэй чарт.
 *
 * Багана цуваанууд зүүн тэнхлэгт (тоо хэмжээ), шугаман цуваа баруун тэнхлэгт
 * (өөр масштабтай утга: зардал г.м) зурагдана. BarChart-тай ижил конвенц —
 * ResponsiveContainer-гүй тул `<ChartCard>` дотор шууд байрлуулна.
 *
 * Жишээ:
 *   <ChartCard title="Маркетингийн нөлөө" height={300}>
 *     <ComboChart
 *       data={months}
 *       xKey="label"
 *       bars={[{ key: 'leads', name: 'Лийд' }, { key: 'meetings', name: 'Уулзалт' }]}
 *       line={{ key: 'spend', name: 'Зарын зардал' }}
 *       lineFormatter={(v) => formatMNT(v, { compact: true })}
 *     />
 *   </ChartCard>
 */
export interface ComboSeries {
    key: string;
    name?: string;
    color?: string;
}

export interface ComboChartProps {
    data: Array<Record<string, number | string>>;
    /** X тэнхлэгийн категори талбарын нэр */
    xKey: string;
    /** Зүүн тэнхлэгийн багана цуваанууд */
    bars: ComboSeries[];
    /** Баруун тэнхлэгийн шугаман цуваа (сонголттой) */
    line?: ComboSeries;
    /** Багана утгын форматлагч (зүүн тэнхлэг + tooltip) */
    valueFormatter?: (value: number) => string;
    /** Шугамын утгын форматлагч (баруун тэнхлэг + tooltip) */
    lineFormatter?: (value: number) => string;
    animate?: boolean;
}

export function ComboChart({
    data,
    xKey,
    bars,
    line,
    valueFormatter,
    lineFormatter,
    animate = true,
}: ComboChartProps) {
    const c = useChartColors();
    const colorAt = (i: number) => c.series[i % c.series.length];
    const lineColor = line?.color ?? c.series[(bars.length + 1) % c.series.length];

    const axisTick = { fontSize: 12, fill: c.axis };
    const axisLine = { stroke: c.grid };

    // Tooltip-д цуваа тус бүрийн форматлагчийг нэрээр нь ялгаж хэрэглэнэ.
    const tooltipFormatter = React.useCallback(
        (value: number, name?: string) => {
            if (line && name === (line.name ?? line.key) && lineFormatter) return lineFormatter(value);
            return valueFormatter ? valueFormatter(value) : value.toLocaleString('en-US');
        },
        [line, lineFormatter, valueFormatter],
    );

    return (
        <ComposedChart data={data} margin={{ top: 8, right: 8, left: 4, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={c.grid} vertical={false} />
            <XAxis dataKey={xKey} tick={axisTick} tickLine={false} axisLine={axisLine} />
            <YAxis
                yAxisId="left"
                tick={axisTick}
                tickLine={false}
                axisLine={axisLine}
                tickFormatter={valueFormatter}
                width={44}
                allowDecimals={false}
            />
            {line && (
                <YAxis
                    yAxisId="right"
                    orientation="right"
                    tick={axisTick}
                    tickLine={false}
                    axisLine={axisLine}
                    tickFormatter={lineFormatter}
                    width={64}
                />
            )}
            <Tooltip
                cursor={{ fill: c.track, opacity: 0.5 }}
                content={<ChartTooltip formatter={tooltipFormatter} showName />}
            />
            <Legend wrapperStyle={{ fontSize: 12, color: c.axis, paddingTop: 8 }} iconType="circle" iconSize={8} />
            {bars.map((s, si) => (
                <Bar
                    key={s.key}
                    yAxisId="left"
                    dataKey={s.key}
                    name={s.name ?? s.key}
                    fill={s.color ?? colorAt(si)}
                    radius={[6, 6, 0, 0]}
                    maxBarSize={36}
                    isAnimationActive={animate}
                    animationDuration={animate ? 600 : 0}
                />
            ))}
            {line && (
                <Line
                    yAxisId="right"
                    type="monotone"
                    dataKey={line.key}
                    name={line.name ?? line.key}
                    stroke={lineColor}
                    strokeWidth={2.5}
                    dot={{ r: 3, fill: lineColor, strokeWidth: 0 }}
                    activeDot={{ r: 4 }}
                    isAnimationActive={animate}
                    animationDuration={animate ? 600 : 0}
                />
            )}
        </ComposedChart>
    );
}

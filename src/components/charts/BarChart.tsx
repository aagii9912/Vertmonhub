'use client';

import * as React from 'react';
import {
    BarChart as RBarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    Legend,
    Cell,
} from 'recharts';
import { useChartColors } from '@/hooks/useChartColors';
import { ChartTooltip } from '@/components/charts/ChartTooltip';

/**
 * BarChart — recharts BarChart-ийн нимгэн wrapper.
 *
 * Энэ нь ResponsiveContainer-гүй — `<ChartCard>` дотор шууд байрлуулна (ChartCard нь
 * ResponsiveContainer-аар ороно). Эсвэл өөрөө ResponsiveContainer дотор ашиглаж болно.
 *
 * Жишээ (нэг цуваа):
 *   <ChartCard title="Сарын борлуулалт" height={280}>
 *     <BarChart
 *       data={[{ month: '1-р сар', value: 12 }, { month: '2-р сар', value: 18 }]}
 *       xKey="month"
 *       series={[{ key: 'value', name: 'Гэрээ' }]}
 *     />
 *   </ChartCard>
 *
 * Жишээ (олон цуваа, stacked):
 *   <BarChart
 *     data={data}
 *     xKey="district"
 *     stacked
 *     series={[{ key: 'sale', name: 'Зарах' }, { key: 'rent', name: 'Түрээс' }]}
 *   />
 */
export interface BarSeries {
    /** data объект дахь талбарын нэр */
    key: string;
    /** Легенд/tooltip-д харагдах нэр (Монгол) */
    name?: string;
    /** Тухайн цувааны өнгийг шууд заах (default: палитрын дараалал) */
    color?: string;
}

export interface BarChartProps {
    /** Чартын өгөгдлийн мөрүүд */
    data: Array<Record<string, number | string>>;
    /** X тэнхлэгийн категори талбарын нэр */
    xKey: string;
    /** Нэг буюу хэд хэдэн цуваа */
    series: BarSeries[];
    /** Хэвтээ багана (X = утга, Y = категори) */
    horizontal?: boolean;
    /** Олон цувааг дээр дээрээс нь стаклах */
    stacked?: boolean;
    /** Утга форматлагч tooltip/тэнхлэгт (жишээ: formatMNT) */
    valueFormatter?: (value: number) => string;
    /** Легенд харуулах эсэх. default: 1-ээс олон цуваатай үед автоматаар */
    showLegend?: boolean;
    /** Grid шугам харуулах. default true */
    showGrid?: boolean;
    /** Багануудын дугуйралт. default 6 */
    radius?: number;
    /**
     * Нэг цуваатай үед мөр бүрийг палитрын өнгөөр будах (категори ялгах).
     * default false (брэнд өнгөөр будна).
     */
    colorByPoint?: boolean;
    /** subtle анимэйшн. default true */
    animate?: boolean;
}

export function BarChart({
    data,
    xKey,
    series,
    horizontal = false,
    stacked = false,
    valueFormatter,
    showLegend,
    showGrid = true,
    radius = 6,
    colorByPoint = false,
    animate = true,
}: BarChartProps) {
    const c = useChartColors();
    const legend = showLegend ?? series.length > 1;
    const colorAt = (i: number) => c.series[i % c.series.length];

    const axisTick = { fontSize: 12, fill: c.axis };
    const axisLine = { stroke: c.grid };

    return (
        <RBarChart data={data} margin={{ top: 8, right: 12, left: 4, bottom: 4 }} layout={horizontal ? 'vertical' : 'horizontal'}>
            {showGrid && (
                <CartesianGrid
                    strokeDasharray="3 3"
                    stroke={c.grid}
                    vertical={horizontal}
                    horizontal={!horizontal}
                />
            )}
            {horizontal ? (
                <>
                    <XAxis type="number" tick={axisTick} tickLine={false} axisLine={axisLine} tickFormatter={valueFormatter} />
                    <YAxis type="category" dataKey={xKey} tick={axisTick} tickLine={false} axisLine={axisLine} width={88} />
                </>
            ) : (
                <>
                    <XAxis dataKey={xKey} tick={axisTick} tickLine={false} axisLine={axisLine} />
                    <YAxis tick={axisTick} tickLine={false} axisLine={axisLine} tickFormatter={valueFormatter} width={48} />
                </>
            )}
            <Tooltip
                cursor={{ fill: c.track, opacity: 0.5 }}
                content={<ChartTooltip formatter={valueFormatter} showName={series.length > 1} />}
            />
            {legend && (
                <Legend
                    wrapperStyle={{ fontSize: 12, color: c.axis, paddingTop: 8 }}
                    iconType="circle"
                    iconSize={8}
                />
            )}
            {series.map((s, si) => {
                const baseRadius: [number, number, number, number] = horizontal
                    ? [0, radius, radius, 0]
                    : [radius, radius, 0, 0];
                return (
                    <Bar
                        key={s.key}
                        dataKey={s.key}
                        name={s.name ?? s.key}
                        fill={s.color ?? colorAt(si)}
                        stackId={stacked ? 'stack' : undefined}
                        radius={stacked ? 0 : baseRadius}
                        maxBarSize={48}
                        isAnimationActive={animate}
                        animationDuration={animate ? 600 : 0}
                    >
                        {colorByPoint && series.length === 1
                            ? data.map((_, di) => <Cell key={di} fill={colorAt(di)} />)
                            : null}
                    </Bar>
                );
            })}
        </RBarChart>
    );
}

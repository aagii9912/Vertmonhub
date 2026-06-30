'use client';

import * as React from 'react';
import { PieChart, Pie, Cell, Tooltip, Legend } from 'recharts';
import { useChartColors } from '@/hooks/useChartColors';
import { ChartTooltip } from '@/components/charts/ChartTooltip';

/**
 * DonutChart — recharts Pie дээр суурилсан гогцоо (donut) чарт.
 *
 * ResponsiveContainer-гүй — `<ChartCard>` дотор шууд байрлуулна. Голд нь нийт утга
 * эсвэл өөрийн контентыг харуулах боломжтой (`centerLabel` / `centerValue`).
 *
 * Жишээ:
 *   <ChartCard title="Үл хөдлөхийн төрөл" height={280}>
 *     <DonutChart
 *       data={[
 *         { name: 'Орон сууц', value: 42 },
 *         { name: 'Хувийн байшин', value: 18 },
 *         { name: 'Оффис', value: 11 },
 *       ]}
 *       centerLabel="Нийт"
 *     />
 *   </ChartCard>
 */
export interface DonutDatum {
    name: string;
    value: number;
    /** Тухайн зүсмийн өнгийг шууд заах (default: палитрын дараалал) */
    color?: string;
}

export interface DonutChartProps {
    data: DonutDatum[];
    /** Утга форматлагч tooltip-д (жишээ: formatMNT) */
    valueFormatter?: (value: number) => string;
    showLegend?: boolean;
    /** Гогцооны зузаан (0-1, дотор радиусын харьцаа). default 0.62 */
    thickness?: number;
    /** Голын дээд мөр (жишээ: "Нийт") */
    centerLabel?: React.ReactNode;
    /**
     * Голын том тоо. Үгүй бол утгуудын нийлбэрийг toLocaleString-оор харуулна.
     * null дамжуулбал голын тоог нуу.
     */
    centerValue?: React.ReactNode | null;
    animate?: boolean;
}

export function DonutChart({
    data,
    valueFormatter,
    showLegend = true,
    thickness = 0.62,
    centerLabel,
    centerValue,
    animate = true,
}: DonutChartProps) {
    const c = useChartColors();
    const colorAt = (i: number) => c.series[i % c.series.length];

    const total = React.useMemo(
        () => data.reduce((sum, d) => sum + (Number.isFinite(d.value) ? d.value : 0), 0),
        [data],
    );

    const showCenter = centerValue !== null && (centerLabel != null || centerValue !== undefined);
    const resolvedCenterValue =
        centerValue !== undefined && centerValue !== null
            ? centerValue
            : total.toLocaleString('en-US');

    // donut: innerRadius эзлэх хувийг % string-ээр өгөхөд responsive-д тааруулна
    const innerPct = `${Math.round(thickness * 100)}%`;
    const outerPct = '88%';

    return (
        <PieChart margin={{ top: 4, right: 4, left: 4, bottom: 4 }}>
            <Pie
                data={data}
                dataKey="value"
                nameKey="name"
                innerRadius={innerPct}
                outerRadius={outerPct}
                paddingAngle={data.length > 1 ? 2 : 0}
                stroke={c.surface}
                strokeWidth={2}
                isAnimationActive={animate}
                animationDuration={animate ? 600 : 0}
            >
                {data.map((d, i) => (
                    <Cell key={i} fill={d.color ?? colorAt(i)} />
                ))}
                {showCenter && (
                    <>
                        {centerLabel != null && (
                            <text
                                x="50%"
                                y="50%"
                                dy={resolvedCenterValue != null ? -8 : 0}
                                textAnchor="middle"
                                className="text-xs"
                                fill={c.axis}
                            >
                                {String(centerLabel)}
                            </text>
                        )}
                        {resolvedCenterValue != null && (
                            <text
                                x="50%"
                                y="50%"
                                dy={centerLabel != null ? 12 : 4}
                                textAnchor="middle"
                                className="tabular-nums"
                                style={{ fontSize: 18, fontWeight: 600 }}
                                fill={c.foreground}
                            >
                                {String(resolvedCenterValue)}
                            </text>
                        )}
                    </>
                )}
            </Pie>
            <Tooltip content={<ChartTooltip formatter={valueFormatter} showName />} />
            {showLegend && (
                <Legend
                    wrapperStyle={{ fontSize: 12, color: c.axis }}
                    iconType="circle"
                    iconSize={8}
                    verticalAlign="bottom"
                />
            )}
        </PieChart>
    );
}

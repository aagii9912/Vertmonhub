'use client';

import * as React from 'react';
import { ResponsiveContainer, LineChart, Line, YAxis, Area, AreaChart } from 'recharts';
import { useChartColors } from '@/hooks/useChartColors';

/**
 * Sparkline — жижиг inline шугам (тэнхлэг, grid, tooltip-гүй).
 *
 * Хүснэгтийн нүд, KPI картын дотор чиг хандлага харуулахад тохиромжтой. Өөрөө
 * ResponsiveContainer-тэй (inline ашиглахад зориулсан) — ChartCard шаардлагагүй.
 *
 * Жишээ:
 *   <Sparkline data={[3, 5, 4, 8, 6, 9, 12]} />
 *   <Sparkline data={[{ v: 3 }, { v: 9 }]} dataKey="v" color="var(--status-success)" area />
 */
export interface SparklineProps {
    /**
     * Тоонуудын массив (хамгийн энгийн), эсвэл объектын массив (`dataKey`-тай хослуулна).
     */
    data: number[] | Array<Record<string, number>>;
    /** Объект массив дамжуулсан үед утга авах талбарын нэр. default 'value' */
    dataKey?: string;
    /** Шугамын өнгө. default: брэнд (chart-1) */
    color?: string;
    /** Доор нь бөглөсөн талбай (area) нэмэх. default false */
    area?: boolean;
    /** Шугамын зузаан. default 1.5 */
    strokeWidth?: number;
    /** Өргөн (px). Үгүй бол эцэг элементийг 100% дүүргэнэ */
    width?: number;
    /** Өндөр (px). default 28 */
    height?: number;
    className?: string;
    'aria-label'?: string;
}

export function Sparkline({
    data,
    dataKey = 'value',
    color,
    area = false,
    strokeWidth = 1.5,
    width,
    height = 28,
    className,
    'aria-label': ariaLabel,
}: SparklineProps) {
    const c = useChartColors();
    const stroke = color ?? c.line;

    const chartData = React.useMemo<Array<Record<string, number>>>(() => {
        if (data.length === 0) return [];
        if (typeof data[0] === 'number') {
            return (data as number[]).map((v, i) => ({ [dataKey]: v, __i: i }));
        }
        return data as Array<Record<string, number>>;
    }, [data, dataKey]);

    if (chartData.length === 0) return null;

    const gradientId = React.useId();
    const margin = { top: 2, right: 1, bottom: 2, left: 1 };

    return (
        <div
            className={className}
            style={{ width: width ?? '100%', height }}
            role="img"
            aria-label={ariaLabel}
        >
            <ResponsiveContainer width="100%" height="100%">
                {area ? (
                    <AreaChart data={chartData} margin={margin}>
                        <defs>
                            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor={stroke} stopOpacity={0.25} />
                                <stop offset="100%" stopColor={stroke} stopOpacity={0} />
                            </linearGradient>
                        </defs>
                        <YAxis hide domain={['dataMin', 'dataMax']} />
                        <Area
                            type="monotone"
                            dataKey={dataKey}
                            stroke={stroke}
                            strokeWidth={strokeWidth}
                            fill={`url(#${gradientId})`}
                            dot={false}
                            isAnimationActive={false}
                        />
                    </AreaChart>
                ) : (
                    <LineChart data={chartData} margin={margin}>
                        <YAxis hide domain={['dataMin', 'dataMax']} />
                        <Line
                            type="monotone"
                            dataKey={dataKey}
                            stroke={stroke}
                            strokeWidth={strokeWidth}
                            dot={false}
                            isAnimationActive={false}
                        />
                    </LineChart>
                )}
            </ResponsiveContainer>
        </div>
    );
}

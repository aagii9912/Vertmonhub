'use client';

/**
 * Recharts-д зориулсан theme-aware өнгөнүүд. Recharts нь CSS var()-ийг SVG attribute
 * болгож уншдаггүй тул дизайн токенуудыг getComputedStyle-аар бодит утга болгож уншина.
 * data-theme солигдоход MutationObserver-аар дахин уншиж, чарт автоматаар шинэчлэгдэнэ.
 */

import { useEffect, useState } from 'react';

export interface ChartColors {
    grid: string;   // --border
    axis: string;   // --muted
    line: string;   // --chart-1 (brand)
    track: string;  // --surface-2 (hover cursor)
    /** --chart-1..5 — 5 өнгийн серийн палитр (олон цуваатай чарт) */
    series: [string, string, string, string, string];
    /** Чартын суурь surface (tooltip/легенд) */
    surface: string;
    /** Үндсэн текстийн өнгө (tooltip-ийн гарчиг) */
    foreground: string;
    /** Receivables aging бүлгүүдийн өнгө (0-30 / 31-60 / 61-90 / 90+) */
    aging: [string, string, string, string];
}

const FALLBACK: ChartColors = {
    grid: '#E5E3DB',
    axis: '#6B6962',
    line: '#C2602F',
    track: '#F4F3EE',
    series: ['#C2602F', '#5B7DA6', '#4FA07C', '#C9A24B', '#6B5E8C'],
    surface: '#FFFFFF',
    foreground: '#1A1A1A',
    aging: ['#4FA07C', '#C9A24B', '#D98A3D', '#C0492F'],
};

export function useChartColors(): ChartColors {
    const [colors, setColors] = useState<ChartColors>(FALLBACK);

    useEffect(() => {
        const read = () => {
            const s = getComputedStyle(document.documentElement);
            const v = (name: string, fb: string) => s.getPropertyValue(name).trim() || fb;
            setColors({
                grid: v('--border', FALLBACK.grid),
                axis: v('--muted', FALLBACK.axis),
                line: v('--chart-1', FALLBACK.line),
                track: v('--surface-2', FALLBACK.track),
                series: [
                    v('--chart-1', FALLBACK.series[0]),
                    v('--chart-2', FALLBACK.series[1]),
                    v('--chart-3', FALLBACK.series[2]),
                    v('--chart-4', FALLBACK.series[3]),
                    v('--chart-5', FALLBACK.series[4]),
                ],
                surface: v('--surface', FALLBACK.surface),
                foreground: v('--fg', FALLBACK.foreground),
                aging: [
                    v('--status-success', FALLBACK.aging[0]),
                    v('--status-pending', FALLBACK.aging[1]),
                    v('--status-active', FALLBACK.aging[2]),
                    v('--status-danger', FALLBACK.aging[3]),
                ],
            });
        };
        read();
        const obs = new MutationObserver(read);
        obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'class'] });
        return () => obs.disconnect();
    }, []);

    return colors;
}

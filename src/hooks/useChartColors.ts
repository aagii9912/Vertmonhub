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
}

const FALLBACK: ChartColors = {
    grid: '#E5E3DB',
    axis: '#6B6962',
    line: '#C2602F',
    track: '#F4F3EE',
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
            });
        };
        read();
        const obs = new MutationObserver(read);
        obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'class'] });
        return () => obs.disconnect();
    }, []);

    return colors;
}

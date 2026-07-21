import * as React from 'react';
import { cn } from '@/lib/utils';

/**
 * SVG progress ring (Origin/Monarch маягийн төсөв·гүйцэтгэлийн дугуй заалт).
 * Голд нь children (том тоо г.м) байрлана; value нь 0-100+ (100-аас дээшийг
 * дүрслэхдээ бүтэн цагирагаар хязгаарлана). Өнгө tone-оор солигдоно.
 */

type RingTone = 'brand' | 'success' | 'pending' | 'danger' | 'neutral';

const TONE_CLASS: Record<RingTone, string> = {
    brand: 'text-brand',
    success: 'text-status-success',
    pending: 'text-status-pending',
    danger: 'text-status-danger',
    neutral: 'text-muted-foreground',
};

interface ProgressRingProps {
    /** Хувь (0-100+; дүрслэл 100-д таслагдана). */
    value: number;
    /** Диаметр (px). */
    size?: number;
    strokeWidth?: number;
    tone?: RingTone;
    className?: string;
    children?: React.ReactNode;
    'aria-label'?: string;
}

export function ProgressRing({
    value,
    size = 120,
    strokeWidth = 9,
    tone = 'brand',
    className,
    children,
    ...props
}: ProgressRingProps) {
    const radius = (size - strokeWidth) / 2;
    const circumference = 2 * Math.PI * radius;
    const clamped = Math.max(0, Math.min(100, value));
    const offset = circumference * (1 - clamped / 100);

    return (
        <div
            role="img"
            aria-label={props['aria-label'] || `${Math.round(value)}%`}
            className={cn('relative inline-flex items-center justify-center', className)}
            style={{ width: size, height: size }}
        >
            <svg width={size} height={size} className="-rotate-90" aria-hidden="true">
                <circle
                    cx={size / 2}
                    cy={size / 2}
                    r={radius}
                    fill="none"
                    strokeWidth={strokeWidth}
                    className="stroke-surface-3"
                />
                <circle
                    cx={size / 2}
                    cy={size / 2}
                    r={radius}
                    fill="none"
                    strokeWidth={strokeWidth}
                    strokeLinecap="round"
                    stroke="currentColor"
                    strokeDasharray={circumference}
                    strokeDashoffset={offset}
                    className={cn(
                        'transition-[stroke-dashoffset] duration-500 ease-out',
                        TONE_CLASS[tone],
                    )}
                />
            </svg>
            {children && (
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                    {children}
                </div>
            )}
        </div>
    );
}

import { Building2 } from 'lucide-react';
import { cn } from '@/lib/utils';

type BrandLogoSize = 'sm' | 'md' | 'lg';
type BrandLogoVariant = 'stacked' | 'inline';

interface BrandLogoProps {
    /** Хэмжээ: sm (жижиг), md (анхдагч), lg (том hero). */
    size?: BrandLogoSize;
    /**
     * Байрлал:
     * - `inline` — лого болон үсэг хажуу хажуудаа (анхдагч).
     * - `stacked` — лого дээр, eyebrow + үсэг доор, голлуулсан.
     */
    variant?: BrandLogoVariant;
    className?: string;
}

const markSize: Record<BrandLogoSize, string> = {
    sm: 'h-9 w-9 rounded-md',
    md: 'h-11 w-11 rounded-md',
    lg: 'h-14 w-14 rounded-xl',
};

const iconSize: Record<BrandLogoSize, string> = {
    sm: 'h-5 w-5',
    md: 'h-6 w-6',
    lg: 'h-7 w-7',
};

const wordSize: Record<BrandLogoSize, string> = {
    sm: 'text-xl',
    md: 'text-2xl',
    lg: 'text-3xl',
};

/**
 * BrandLogo — Vertmon Hub-ийн нэрийн тэмдэг (wordmark).
 *
 * `bg-brand` дөрвөлжин дотор `Building2` дүрс (`text-brand-fg`) + ".heading-display"
 * үсэг + mono eyebrow. Зөвхөн дизайн токен ашигладаг.
 */
export function BrandLogo({ size = 'md', variant = 'inline', className }: BrandLogoProps) {
    const mark = (
        <span
            className={cn(
                'flex shrink-0 items-center justify-center bg-brand text-brand-fg shadow-sm',
                markSize[size],
            )}
        >
            <Building2 className={iconSize[size]} strokeWidth={2.25} aria-hidden="true" />
        </span>
    );

    if (variant === 'stacked') {
        return (
            <div className={cn('flex flex-col items-center text-center', className)}>
                {mark}
                <span className="mt-3 font-mono text-2xs uppercase tracking-[0.24em] text-muted-foreground">
                    Vertmon — Hub
                </span>
                <span className={cn('heading-display text-foreground', wordSize[size])}>Vertmon Hub</span>
            </div>
        );
    }

    return (
        <div className={cn('inline-flex items-center gap-3', className)}>
            {mark}
            <span className="flex flex-col leading-none">
                <span className="font-mono text-2xs uppercase tracking-[0.24em] text-muted-foreground">
                    Vertmon — Hub
                </span>
                <span className={cn('heading-display mt-1 text-foreground', wordSize[size])}>Vertmon Hub</span>
            </span>
        </div>
    );
}

export default BrandLogo;

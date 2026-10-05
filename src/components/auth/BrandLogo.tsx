import { BrandMark } from '@/components/brand/BrandMark';
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
    sm: 'size-9',
    md: 'size-11',
    lg: 'size-14',
};

const wordSize: Record<BrandLogoSize, string> = {
    sm: 'text-xl',
    md: 'text-2xl',
    lg: 'text-3xl',
};

/**
 * BrandLogo — Vertmon Hub-ийн нэрийн тэмдэг (wordmark).
 *
 * Брэндийн «V» тэмдэг (components/brand/BrandMark) + ".heading-display" нэр.
 * Зөвхөн дизайн токен ашигладаг.
 */
export function BrandLogo({ size = 'md', variant = 'inline', className }: BrandLogoProps) {
    const mark = <BrandMark className={markSize[size]} />;

    if (variant === 'stacked') {
        return (
            <div className={cn('flex flex-col items-center text-center', className)}>
                {mark}
                <span className={cn('heading-display mt-3 text-foreground', wordSize[size])}>Vertmon Hub</span>
            </div>
        );
    }

    return (
        <div className={cn('inline-flex items-center gap-3', className)}>
            {mark}
            <span className="flex flex-col leading-none">
                <span className={cn('heading-display text-foreground', wordSize[size])}>Vertmon Hub</span>
            </span>
        </div>
    );
}

export default BrandLogo;

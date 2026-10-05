import { cn } from '@/lib/utils';
import { BrandMark as Mark } from '@/components/brand/BrandMark';

/**
 * Vertmon Hub лого: тэмдэг + нэр. Nav болон footer-т дахин ашиглагдана.
 */
export function BrandMark({ className }: { className?: string }) {
    return (
        <span className={cn('flex items-center gap-2.5', className)}>
            <Mark className="size-8" />
            <span className="heading-display text-lg leading-none text-foreground">Vertmon Hub</span>
        </span>
    );
}

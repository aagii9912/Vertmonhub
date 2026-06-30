import { Building2 } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Vertmon Hub лого тэмдэг. Nav болон footer-т дахин ашиглагдана.
 */
export function BrandMark({ className }: { className?: string }) {
    return (
        <span className={cn('flex items-center gap-2.5', className)}>
            <span className="flex h-8 w-8 items-center justify-center rounded-md bg-brand text-brand-fg shadow-sm">
                <Building2 className="h-4 w-4" aria-hidden="true" />
            </span>
            <span className="flex items-baseline gap-1.5">
                <span className="heading-display text-lg leading-none text-foreground">Vertmon</span>
                <span className="font-mono text-2xs uppercase tracking-[0.18em] text-muted-foreground">Hub</span>
            </span>
        </span>
    );
}

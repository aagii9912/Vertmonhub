import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface SpinnerProps {
    size?: 'xs' | 'sm' | 'md' | 'lg';
    tone?: 'brand' | 'neutral' | 'inherit';
    className?: string;
    label?: string;
}

const sizeMap: Record<NonNullable<SpinnerProps['size']>, string> = {
    xs: 'h-3 w-3',
    sm: 'h-4 w-4',
    md: 'h-5 w-5',
    lg: 'h-7 w-7',
};

const toneMap: Record<NonNullable<SpinnerProps['tone']>, string> = {
    brand: 'text-brand',
    neutral: 'text-muted-foreground',
    inherit: '',
};

export function Spinner({ size = 'md', tone = 'brand', className, label }: SpinnerProps) {
    return (
        <span
            role="status"
            aria-label={label || 'Ачаалж байна'}
            className={cn('inline-flex items-center justify-center', className)}
        >
            <Loader2 className={cn('animate-spin', sizeMap[size], toneMap[tone])} />
            {label && <span className="sr-only">{label}</span>}
        </span>
    );
}

export function PageSpinner({ label }: { label?: string }) {
    return (
        <div className="flex flex-col items-center justify-center py-16 gap-3">
            <Spinner size="lg" tone="brand" label={label} />
            {label && <p className="text-sm text-muted-foreground">{label}</p>}
        </div>
    );
}

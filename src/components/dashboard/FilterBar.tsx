import { type ReactNode } from 'react';
import { Search, X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface FilterBarProps {
    search?: {
        value: string;
        onChange: (value: string) => void;
        placeholder?: string;
    };
    children?: ReactNode;
    rightSlot?: ReactNode;
    onClear?: () => void;
    showClear?: boolean;
    className?: string;
}

export function FilterBar({
    search,
    children,
    rightSlot,
    onClear,
    showClear,
    className,
}: FilterBarProps) {
    return (
        <div
            className={cn(
                'flex flex-col gap-3 mb-4 rounded-xl border border-border bg-surface p-3',
                'md:flex-row md:items-center md:flex-wrap',
                className,
            )}
        >
            {search && (
                <div className="relative flex-1 min-w-[200px] md:max-w-xs">
                    <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/70" />
                    <input
                        type="search"
                        value={search.value}
                        onChange={(e) => search.onChange(e.target.value)}
                        placeholder={search.placeholder || 'Хайх...'}
                        className="w-full rounded-md border border-border bg-background py-2 pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground/70 focus:outline-none focus:ring-2 focus:ring-ring/40 focus:border-border-strong transition-colors"
                    />
                </div>
            )}
            <div className="flex flex-wrap items-center gap-2 flex-1">{children}</div>
            <div className="flex items-center gap-2 shrink-0">
                {showClear && onClear && (
                    <button
                        type="button"
                        onClick={onClear}
                        className="inline-flex items-center gap-1 rounded-md px-2.5 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-surface-2 transition-colors"
                    >
                        <X className="h-3.5 w-3.5" />
                        Цэвэрлэх
                    </button>
                )}
                {rightSlot}
            </div>
        </div>
    );
}

interface FilterSelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
    label?: string;
}

export function FilterSelect({ label, className, children, ...props }: FilterSelectProps) {
    return (
        <label className="flex items-center gap-2 text-xs">
            {label && <span className="text-muted-foreground/80 whitespace-nowrap">{label}</span>}
            <select
                className={cn(
                    'rounded-md border border-border bg-background px-2.5 py-1.5 text-sm text-foreground',
                    'focus:outline-none focus:ring-2 focus:ring-ring/40 focus:border-border-strong transition-colors',
                    className,
                )}
                {...props}
            >
                {children}
            </select>
        </label>
    );
}

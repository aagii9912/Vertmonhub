import { type ReactNode } from 'react';
import { ChevronDown, Search, X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface FilterBarProps {
    search?: {
        value: string;
        onChange: (value: string) => void;
        placeholder?: string;
        label?: string;
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
                'mb-4 flex flex-col gap-3 rounded-xl bg-surface-2 p-3',
                'md:flex-row md:items-center md:flex-wrap',
                className,
            )}
        >
            {search && (
                <div className="relative min-w-0 flex-1 md:min-w-[200px] md:max-w-xs">
                    <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/70" />
                    <input
                        type="search"
                        aria-label={search.label || search.placeholder || 'Хайх'}
                        value={search.value}
                        onChange={(e) => search.onChange(e.target.value)}
                        placeholder={search.placeholder || 'Хайх...'}
                        className="h-11 w-full rounded-lg border border-border bg-surface pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus-ring transition-colors md:h-9"
                    />
                </div>
            )}
            <div className="flex min-w-0 flex-1 flex-nowrap items-center gap-2 overflow-x-auto py-1 md:flex-wrap md:overflow-visible [&>*]:shrink-0">{children}</div>
            <div className="flex items-center gap-2 shrink-0">
                {showClear && onClear && (
                    <button
                        type="button"
                        onClick={onClear}
                        className="inline-flex min-h-11 items-center gap-1 rounded-lg px-2 text-xs text-muted-foreground hover:text-foreground hover:bg-surface-3 transition-colors focus-ring md:min-h-9"
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

/** Ижил хэмжээ, сонгосон төлөв, харагдах keyboard focus-той авсаархан шүүлтүүр. */
export function FilterChip({ value, onChange, label, options }: { value: string; onChange: (value: string) => void; label: string; options: [string, string][] }) {
    const active = value !== 'all';
    return <label className={cn('relative inline-flex h-11 items-center gap-1 rounded-lg border pl-3 pr-7 text-xs focus-ring md:h-9', active ? 'border-brand bg-brand-soft text-brand-strong' : 'border-border bg-surface text-fg-2 hover:border-border-strong')}>
        <span className="pointer-events-none whitespace-nowrap">{active ? `${label}: ${options.find(option => option[0] === value)?.[1] ?? value}` : label}</span>
        <select value={value} onChange={event => onChange(event.target.value)} className="absolute inset-0 cursor-pointer opacity-0" aria-label={label}>
            <option value="all">Бүгд</option>
            {options.map(([key, name]) => <option key={key} value={key}>{name}</option>)}
        </select>
        <ChevronDown className="pointer-events-none absolute right-2 size-3 opacity-70" />
    </label>;
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
                    'h-11 max-w-full rounded-lg border border-border bg-surface px-2.5 text-sm text-foreground md:h-9',
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

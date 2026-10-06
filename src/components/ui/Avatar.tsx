import { cn } from '@/lib/utils';

/** Нэрийн эхний үсгүүд: «Б. Энхжин» → «БЭ», «Номин» → «НО». */
export function initialsOf(name?: string | null): string {
    if (!name) return '—';
    const parts = name.replace(/\./g, ' ').split(/\s+/).filter(Boolean);
    if (!parts.length) return '—';
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[1][0]).toUpperCase();
}

const SIZES = {
    sm: 'size-6 text-xs',
    md: 'size-8 text-xs',
    lg: 'size-11 text-sm',
} as const;

/** Хүний эхний үсэгтэй дугуй тэмдэг — чимэглэл тул нэрийг хажууд нь текстээр заавал бичнэ. */
export function Avatar({ name, size = 'sm', className }: { name?: string | null; size?: keyof typeof SIZES; className?: string }) {
    return (
        <span
            aria-hidden="true"
            className={cn('inline-flex shrink-0 items-center justify-center rounded-full bg-surface-3 font-semibold leading-none text-fg-2', SIZES[size], className)}
        >
            {initialsOf(name)}
        </span>
    );
}

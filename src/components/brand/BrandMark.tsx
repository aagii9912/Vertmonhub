import { cn } from '@/lib/utils';

/**
 * Vertmon Hub-ийн тэмдэг: Vertmon blue дөрвөлжин дээрх «V».
 * Favicon, PWA icon (public/icon.svg) ижил хэлбэртэй; энд токеноор зурж тема дагуулна.
 */
export function BrandMark({ className, title }: { className?: string; title?: string }) {
    return (
        <svg
            viewBox="0 0 64 64"
            className={cn('size-8 shrink-0', className)}
            role={title ? 'img' : undefined}
            aria-label={title}
            aria-hidden={title ? undefined : true}
        >
            <rect width="64" height="64" rx="15" fill="var(--brand)" />
            <path
                d="M19 20.5 32 45l13-24.5"
                fill="none"
                stroke="var(--brand-fg)"
                strokeWidth="6.5"
                strokeLinecap="round"
                strokeLinejoin="round"
            />
        </svg>
    );
}

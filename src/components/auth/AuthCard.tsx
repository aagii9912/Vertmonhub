import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface AuthCardProps {
    /** Картын гарчиг (.heading-section). */
    title: ReactNode;
    /** Гарчгийн доорх тайлбар. */
    subtitle?: ReactNode;
    children: ReactNode;
    className?: string;
}

/**
 * AuthCard — auth формын хүрээ карт.
 *
 * `bg-surface border rounded-2xl shadow-lg` дотор гарчиг + тайлбар + контент.
 */
export function AuthCard({ title, subtitle, children, className }: AuthCardProps) {
    return (
        <div
            className={cn(
                'rounded-2xl border border-border bg-surface p-6 shadow-lg sm:p-8',
                className,
            )}
        >
            <div className="mb-6 space-y-1.5 text-center">
                <h1 className="heading-section text-xl text-foreground">{title}</h1>
                {subtitle ? <p className="text-sm text-muted-foreground">{subtitle}</p> : null}
            </div>
            {children}
        </div>
    );
}

export default AuthCard;

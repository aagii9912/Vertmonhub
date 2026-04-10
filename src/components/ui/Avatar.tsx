import { forwardRef, type HTMLAttributes, type ImgHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

/* ─── Avatar ─── */
interface AvatarProps extends HTMLAttributes<HTMLDivElement> {
    src?: string | null;
    alt?: string;
    fallback?: string;
    size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
    status?: 'online' | 'offline' | 'away' | 'busy';
}

const sizeClasses = {
    xs: 'h-6 w-6 text-[10px]',
    sm: 'h-8 w-8 text-xs',
    md: 'h-10 w-10 text-sm',
    lg: 'h-12 w-12 text-base',
    xl: 'h-16 w-16 text-lg',
};

const statusSizeClasses = {
    xs: 'h-1.5 w-1.5 ring-1',
    sm: 'h-2 w-2 ring-[1.5px]',
    md: 'h-2.5 w-2.5 ring-2',
    lg: 'h-3 w-3 ring-2',
    xl: 'h-3.5 w-3.5 ring-2',
};

const statusColors = {
    online: 'bg-green-500',
    offline: 'bg-gray-400',
    away: 'bg-blue-400',
    busy: 'bg-red-500',
};

function getInitials(name?: string): string {
    if (!name) return '?';
    return name
        .split(' ')
        .map((n) => n[0])
        .join('')
        .toUpperCase()
        .slice(0, 2);
}

const Avatar = forwardRef<HTMLDivElement, AvatarProps>(
    ({ src, alt, fallback, size = 'md', status, className, ...props }, ref) => (
        <div ref={ref} className={cn('relative inline-flex shrink-0', className)} {...props}>
            <div
                className={cn(
                    'rounded-full bg-secondary flex items-center justify-center font-medium text-muted-foreground overflow-hidden',
                    sizeClasses[size]
                )}
            >
                {src ? (
                    <img src={src} alt={alt || ''} className="h-full w-full object-cover" />
                ) : (
                    <span>{getInitials(fallback || alt)}</span>
                )}
            </div>
            {status && (
                <span
                    className={cn(
                        'absolute bottom-0 right-0 rounded-full ring-card',
                        statusColors[status],
                        statusSizeClasses[size]
                    )}
                />
            )}
        </div>
    )
);
Avatar.displayName = 'Avatar';

/* ─── AvatarGroup ─── */
interface AvatarGroupProps extends HTMLAttributes<HTMLDivElement> {
    max?: number;
    size?: 'xs' | 'sm' | 'md' | 'lg';
    children: React.ReactNode;
}

function AvatarGroup({ max = 4, size = 'sm', children, className, ...props }: AvatarGroupProps) {
    const items = Array.isArray(children) ? children : [children];
    const visible = items.slice(0, max);
    const remaining = items.length - max;

    return (
        <div className={cn('flex -space-x-2', className)} {...props}>
            {visible.map((child, i) => (
                <div key={i} className="ring-2 ring-card rounded-full">
                    {child}
                </div>
            ))}
            {remaining > 0 && (
                <div
                    className={cn(
                        'rounded-full bg-secondary flex items-center justify-center font-medium text-muted-foreground ring-2 ring-card',
                        sizeClasses[size]
                    )}
                >
                    +{remaining}
                </div>
            )}
        </div>
    );
}

export { Avatar, AvatarGroup };

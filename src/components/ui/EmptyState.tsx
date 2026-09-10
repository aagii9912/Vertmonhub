import { type ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { Inbox } from 'lucide-react';

interface EmptyStateProps {
    icon?: ReactNode;
    title: string;
    description?: string;
    action?: ReactNode;
    className?: string;
}

/** v2 хоосон төлөв — жижиг дүрс, 13.5px гарчиг, нэг үйлдэл. */
function EmptyState({ icon, title, description, action, className }: EmptyStateProps) {
    return (
        <div className={cn('flex flex-col items-center justify-center px-4 py-10 text-center', className)}>
            <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-md border border-border bg-surface-2 text-muted-foreground [&>svg]:h-4 [&>svg]:w-4">
                {icon || <Inbox />}
            </div>
            <h3 className="text-[13.5px] font-medium text-foreground">{title}</h3>
            {description && <p className="mt-1 max-w-xs text-[12.5px] text-muted-foreground">{description}</p>}
            {action && <div className="mt-3">{action}</div>}
        </div>
    );
}

export { EmptyState };

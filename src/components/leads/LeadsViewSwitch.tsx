'use client';

import Link from 'next/link';
import { Columns3, List } from 'lucide-react';
import { cn } from '@/lib/utils';

/** Лидийг жагсаалт ↔ «Шатаар» (самбар) харах солигч — шүүлтүүрийн query хоёр талд хадгалагдана. */
export function LeadsViewSwitch({ current, query = '', className }: { current: 'list' | 'board'; query?: string; className?: string }) {
    const suffix = query ? `?${query}` : '';
    const item = (key: 'list' | 'board', href: string, label: string, Icon: typeof List) => (
        <Link
            href={`${href}${suffix}`}
            aria-current={current === key ? 'page' : undefined}
            className={cn(
                'inline-flex h-8 items-center gap-1.5 rounded-lg px-3 text-sm font-medium transition-colors',
                current === key ? 'bg-surface text-foreground shadow-[inset_0_0_0_1px_var(--border)]' : 'text-fg-2 hover:text-foreground',
            )}
        >
            <Icon className="size-4" aria-hidden />{label}
        </Link>
    );
    return (
        <nav aria-label="Лидийн харагдац" className={cn('flex items-center gap-1 rounded-xl bg-surface-2 p-1', className)}>
            {item('list', '/dashboard/leads', 'Жагсаалт', List)}
            {item('board', '/dashboard/leads/pipeline', 'Шатаар', Columns3)}
        </nav>
    );
}

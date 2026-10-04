'use client';

import { Check, ChevronsUpDown } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/Dropdown';

/**
 * Төсөл солих цэс. Shop = төсөл: төсөл бүр тусдаа ажлын орчин (лид, маркетинг,
 * менежер, тайлан). Хэрэглэгч хэд хэдэн төсөлд гишүүн бол энд сольж ажиллана.
 * Ганц төсөлтэй бол зөвхөн нэрийг харуулна.
 */
export function ProjectSwitcher({ variant = 'sidebar' }: { variant?: 'sidebar' | 'compact' }) {
    const { shop, shops, switchShop } = useAuth();
    const name = shop?.name || 'Төсөл';

    if (shops.length <= 1) {
        return variant === 'sidebar'
            ? <div className="mt-0.5 truncate text-[11.5px] text-muted-foreground">{shop?.name || 'Ажлын орчин'}</div>
            : null;
    }

    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <button
                    type="button"
                    aria-label={`Төсөл солих. Одоогийн төсөл: ${name}`}
                    className={cn(
                        'flex min-w-0 items-center gap-1 rounded-md text-left transition-colors focus-ring',
                        variant === 'sidebar'
                            ? 'mt-0.5 -ml-1 max-w-full px-1 py-0.5 text-[11.5px] text-muted-foreground hover:bg-surface-2 hover:text-foreground'
                            : 'h-10 max-w-[45vw] px-2 text-[12.5px] font-medium text-foreground hover:bg-surface-2',
                    )}
                >
                    <span className="truncate">{name}</span>
                    <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 opacity-70" />
                </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-64">
                <DropdownMenuLabel className="text-[11px] font-normal text-muted-foreground">Төсөл сонгох</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {shops.map(item => (
                    <DropdownMenuItem
                        key={item.id}
                        onSelect={() => { if (item.id !== shop?.id) void switchShop(item.id); }}
                        className="flex items-center gap-2"
                    >
                        <Check className={cn('h-4 w-4 shrink-0', item.id === shop?.id ? 'opacity-100' : 'opacity-0')} />
                        <span className="truncate">{item.name}</span>
                    </DropdownMenuItem>
                ))}
            </DropdownMenuContent>
        </DropdownMenu>
    );
}

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

/** Төслийн нэрээс 2 үсэг: «Мандала Гарден» → «МГ», «Elysium Residence» → «ER». */
function projectInitials(name: string): string {
    const words = name.split(/[\s&·-]+/).filter(Boolean);
    if (!words.length) return '—';
    return (words.length === 1 ? words[0].slice(0, 2) : words[0][0] + words[1][0]).toUpperCase();
}

/**
 * Төсөл солих цэс — дээд мөрийн замын мөрийн эхний хэсэг («МГ Мандала Гарден ⌄ / Лид»).
 * Shop = төсөл: төсөл бүр тусдаа ажлын орчин (лид, маркетинг, менежер, тайлан).
 * Ганц төсөлтэй бол зөвхөн нэрийг харуулна.
 */
export function ProjectSwitcher() {
    const { shop, shops, switchShop } = useAuth();
    const name = shop?.name || 'Төсөл';
    const badge = (
        <span aria-hidden="true" className="flex size-6 shrink-0 items-center justify-center rounded-md bg-brand-soft text-xs font-semibold leading-none text-brand-strong">
            {projectInitials(name)}
        </span>
    );

    if (shops.length <= 1) {
        return (
            <span className="flex min-w-0 items-center gap-2 px-1 text-sm font-medium text-foreground">
                {badge}
                <span className="truncate">{name}</span>
            </span>
        );
    }

    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <button
                    type="button"
                    aria-label={`Төсөл солих. Одоогийн төсөл: ${name}`}
                    className={cn(
                        'flex h-8 min-w-0 max-w-64 items-center gap-2 rounded-lg px-1.5 text-left text-sm font-medium text-foreground',
                        'transition-colors hover:bg-surface-2',
                    )}
                >
                    {badge}
                    <span className="truncate">{name}</span>
                    <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-64">
                <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">Төсөл сонгох</DropdownMenuLabel>
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

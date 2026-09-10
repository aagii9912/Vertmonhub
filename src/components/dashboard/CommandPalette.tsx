'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Plus, CalendarPlus, FilePlus2 } from 'lucide-react';

import {
    CommandDialog,
    CommandInput,
    CommandList,
    CommandEmpty,
    CommandGroup,
    CommandItem,
    CommandShortcut,
} from '@/components/ui/Command';
import { useAuth } from '@/contexts/AuthContext';
import { canAccessModule, canAccessModuleDynamic } from '@/lib/rbac';
import { PRIMARY_NAV, BOTTOM_NAV, SECONDARY_ROUTES } from '@/lib/navigation/nav';
import { onCommandPaletteOpen, openQuickCreate } from '@/lib/navigation/commandPalette';

/**
 * ⌘K командын самбар — v2-т цэснээс хасагдсан бүх хуудсыг олох гол зам.
 *
 * Гурван эх сурвалж: түргэн үйлдэл, үндсэн цэс, хоёрдогч замууд.
 * Эрхгүй хуудсууд огт харагдахгүй.
 */
export function CommandPalette() {
    const [open, setOpen] = React.useState(false);
    const router = useRouter();
    const { user } = useAuth();

    const userRole = user?.role || 'viewer';
    const userPermissions = user?.permissions;

    const can = React.useCallback(
        (module: string) => {
            if (!module) return true;
            return userPermissions
                ? canAccessModuleDynamic(userPermissions, module)
                : canAccessModule(userRole, module);
        },
        [userRole, userPermissions],
    );

    // ⌘K / Ctrl+K, болон бусад газраас ирэх нээх дохио.
    React.useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key.toLowerCase() === 'k' && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                setOpen((o) => !o);
            }
        };
        window.addEventListener('keydown', onKey);
        const off = onCommandPaletteOpen(() => setOpen(true));
        return () => {
            window.removeEventListener('keydown', onKey);
            off();
        };
    }, []);

    const go = React.useCallback(
        (href: string) => {
            setOpen(false);
            router.push(href);
        },
        [router],
    );

    const primary = PRIMARY_NAV.filter((i) => can(i.module));
    const bottom = BOTTOM_NAV.filter((i) => can(i.module));

    const grouped = React.useMemo(() => {
        const map = new Map<string, typeof SECONDARY_ROUTES>();
        for (const r of SECONDARY_ROUTES) {
            if (!can(r.module)) continue;
            const list = map.get(r.group) ?? [];
            list.push(r);
            map.set(r.group, list);
        }
        return [...map.entries()];
    }, [can]);

    return (
        <CommandDialog open={open} onOpenChange={setOpen}>
            <CommandInput placeholder="Хуудас, үйлдэл хайх…" />
            <CommandList>
                <CommandEmpty>Илэрц олдсонгүй.</CommandEmpty>

                <CommandGroup heading="Түргэн үйлдэл">
                    {can('leads') && (
                        <CommandItem
                            value="шинэ лид бүртгэх new lead"
                            onSelect={() => {
                                setOpen(false);
                                openQuickCreate('lead');
                            }}
                        >
                            <Plus className="mr-2 h-4 w-4" />
                            Шинэ лид
                            <CommandShortcut>N</CommandShortcut>
                        </CommandItem>
                    )}
                    {can('viewings') && (
                        <CommandItem
                            value="уулзалт товлох meeting"
                            onSelect={() => {
                                setOpen(false);
                                openQuickCreate('meeting');
                            }}
                        >
                            <CalendarPlus className="mr-2 h-4 w-4" />
                            Уулзалт товлох
                        </CommandItem>
                    )}
                    {can('contracts') && (
                        <CommandItem value="гэрээ үүсгэх contract" onSelect={() => go('/dashboard/contracts/generate')}>
                            <FilePlus2 className="mr-2 h-4 w-4" />
                            Гэрээ үүсгэх
                        </CommandItem>
                    )}
                </CommandGroup>

                <CommandGroup heading="Цэс">
                    {[...primary, ...bottom].map((item) => {
                        const Icon = item.icon;
                        return (
                            <CommandItem key={item.href} value={`${item.name} ${item.href}`} onSelect={() => go(item.href)}>
                                <Icon className="mr-2 h-4 w-4" />
                                {item.name}
                            </CommandItem>
                        );
                    })}
                </CommandGroup>

                {grouped.map(([group, routes]) => (
                    <CommandGroup key={group} heading={group}>
                        {routes.map((r) => {
                            const Icon = r.icon;
                            return (
                                <CommandItem
                                    key={r.href + r.name}
                                    value={`${r.name} ${r.href} ${(r.keywords ?? []).join(' ')}`}
                                    onSelect={() => go(r.href)}
                                >
                                    <Icon className="mr-2 h-4 w-4" />
                                    {r.name}
                                </CommandItem>
                            );
                        })}
                    </CommandGroup>
                ))}
            </CommandList>
        </CommandDialog>
    );
}

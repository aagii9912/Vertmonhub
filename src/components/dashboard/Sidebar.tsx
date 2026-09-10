'use client';

import React, { useMemo } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ChevronsLeft, ChevronsRight, LogOut, UserCircle, Settings } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { canAccessModule, canAccessModuleDynamic, getRoleDisplayName } from '@/lib/rbac';
import { cn } from '@/lib/utils';
import { PRIMARY_NAV, BOTTOM_NAV, isNavItemActive, type NavItem } from '@/lib/navigation/nav';
import { useSidebarCollapsed } from '@/hooks/useSidebarCollapsed';
import { useNavCounts } from '@/hooks/useNavCounts';
import { openCommandPalette } from '@/lib/navigation/commandPalette';
import { openAiPanel } from '@/lib/ai/context';
import {
    DropdownMenu,
    DropdownMenuTrigger,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
} from '@/components/ui/Dropdown';

/** Хүний нэрнээс 2 үсэгтэй товчлол: «Д. Номин» → «ДН». */
export function initialsOf(name?: string | null): string {
    if (!name) return '—';
    const parts = name.replace(/\./g, ' ').split(/\s+/).filter(Boolean);
    if (!parts.length) return '—';
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[1][0]).toUpperCase();
}

export function Sidebar() {
    const pathname = usePathname() || '';
    const { shop, user, signOut } = useAuth();
    const { collapsed, toggle } = useSidebarCollapsed();
    const counts = useNavCounts();

    const userRole = user?.role || 'viewer';
    const userPermissions = user?.permissions;

    const allowed = useMemo(() => {
        const can = (module: string) => {
            if (!module) return true;
            return userPermissions
                ? canAccessModuleDynamic(userPermissions, module)
                : canAccessModule(userRole, module);
        };
        return {
            primary: PRIMARY_NAV.filter((i) => can(i.module)),
            bottom: BOTTOM_NAV.filter((i) => can(i.module)),
        };
    }, [userRole, userPermissions]);

    const displayName = user?.fullName || user?.email?.split('@')[0] || 'Хэрэглэгч';

    return (
        <aside
            className={cn(
                'fixed inset-y-0 left-0 z-40 hidden md:flex flex-col',
                'border-r border-border bg-sidebar',
                'w-[var(--sidebar-w)] transition-[width] duration-200 ease-out',
            )}
        >
            {/* Брэнд */}
            <div className={cn('flex items-center gap-2.5 px-3 pt-3 pb-2.5', collapsed && 'justify-center px-0')}>
                <Link
                    href="/dashboard"
                    className="flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-md bg-brand text-[14px] font-bold text-brand-fg"
                    aria-label="Vertmon Hub"
                >
                    V
                </Link>
                {!collapsed && (
                    <div className="min-w-0 flex-1 leading-tight">
                        <div className="truncate text-[13.5px] font-semibold text-foreground">Vertmon Hub</div>
                        <div className="truncate text-[11.5px] text-muted-foreground">{shop?.name || 'Mandala Garden'}</div>
                    </div>
                )}
            </div>

            {/* Хайлт (⌘K) */}
            <div className={cn('px-2.5 pb-2', collapsed && 'px-2')}>
                <button
                    type="button"
                    onClick={openCommandPalette}
                    className={cn(
                        'flex w-full items-center gap-2 rounded-md border border-border-strong bg-surface text-muted-foreground',
                        'transition-colors hover:border-brand/40 hover:text-foreground focus-ring',
                        collapsed ? 'h-[30px] justify-center px-0' : 'h-[30px] px-2.5',
                    )}
                    aria-label="Хайх"
                >
                    <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0 stroke-current" fill="none" strokeWidth={1.75} strokeLinecap="round">
                        <circle cx="11" cy="11" r="7" />
                        <path d="M20 20l-3.5-3.5" />
                    </svg>
                    {!collapsed && (
                        <>
                            <span className="text-[12.5px]">Хайх…</span>
                            <kbd className="mono-label ml-auto rounded border border-border bg-surface-2 px-1.5 text-[10.5px] leading-4 text-muted-foreground">
                                ⌘K
                            </kbd>
                        </>
                    )}
                </button>
            </div>

            {/* Үндсэн цэс */}
            <nav className="flex flex-col gap-0.5 px-2.5" aria-label="Үндсэн цэс">
                {allowed.primary.map((item) => (
                    <NavRow key={item.href} item={item} pathname={pathname} collapsed={collapsed} count={item.countKey ? counts[item.countKey] : undefined} />
                ))}
            </nav>

            <div className="flex-1" />

            {/* Доод цэс */}
            <nav className="flex flex-col gap-0.5 px-2.5 pb-1" aria-label="Нэмэлт цэс">
                {allowed.bottom.map((item) => (
                    <NavRow key={item.href} item={item} pathname={pathname} collapsed={collapsed} />
                ))}
            </nav>

            {/* Хэрэглэгч */}
            <div className="mx-2.5 mt-1.5 border-t border-border pt-2 pb-2">
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <button
                            type="button"
                            className={cn(
                                'flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-surface-2 focus-ring',
                                collapsed && 'justify-center px-0',
                            )}
                        >
                            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-border-strong bg-surface-2 text-[10.5px] font-semibold text-fg-2">
                                {initialsOf(displayName)}
                            </span>
                            {!collapsed && (
                                <span className="min-w-0 flex-1 leading-tight">
                                    <span className="block truncate text-[12.5px] font-semibold text-foreground">{displayName}</span>
                                    <span className="block truncate text-[11px] text-muted-foreground">{getRoleDisplayName(userRole)}</span>
                                </span>
                            )}
                        </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start" side="top" className="w-56">
                        <DropdownMenuLabel className="truncate">{user?.email}</DropdownMenuLabel>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem asChild>
                            <Link href="/dashboard/settings" className="flex items-center gap-2">
                                <UserCircle className="h-4 w-4" /> Профайл
                            </Link>
                        </DropdownMenuItem>
                        <DropdownMenuItem asChild>
                            <Link href="/dashboard/settings" className="flex items-center gap-2">
                                <Settings className="h-4 w-4" /> Тохиргоо
                            </Link>
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={() => void signOut()} className="flex items-center gap-2 text-status-danger">
                            <LogOut className="h-4 w-4" /> Гарах
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
            </div>

            {/* Хумих товч */}
            <button
                type="button"
                onClick={toggle}
                className="mx-2.5 mb-2.5 flex h-7 items-center justify-center gap-1.5 rounded-md text-[11.5px] text-muted-foreground transition-colors hover:bg-surface-2 hover:text-foreground focus-ring"
                aria-label={collapsed ? 'Цэсийг дэлгэх' : 'Цэсийг хумих'}
            >
                {collapsed ? <ChevronsRight className="h-4 w-4" /> : (<><ChevronsLeft className="h-4 w-4" /> Хумих</>)}
            </button>
        </aside>
    );
}

function NavRow({
    item,
    pathname,
    collapsed,
    count,
}: {
    item: NavItem;
    pathname: string;
    collapsed: boolean;
    count?: number;
}) {
    const active = isNavItemActive(item, pathname);
    const Icon = item.icon;

    return (
        <Link
            href={item.href}
            aria-current={active ? 'page' : undefined}
            title={collapsed ? item.name : item.href === '/dashboard/ai-assistant' ? 'AI туслах (⌘J)' : undefined}
            onClick={(e) => {
                // AI туслах — хуудас солихгүй, хажуугийн панел нээнэ (⌘/ctrl+click → бүтэн хуудас)
                if (item.href === '/dashboard/ai-assistant' && !e.metaKey && !e.ctrlKey) { e.preventDefault(); openAiPanel(); }
            }}
            className={cn(
                'flex h-[30px] items-center gap-2.5 rounded-md px-2 text-[13px] font-medium transition-colors focus-ring',
                collapsed && 'justify-center px-0',
                active
                    ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                    : 'text-fg-2 hover:bg-surface-2 hover:text-foreground',
            )}
        >
            <Icon className="h-4 w-4 shrink-0" strokeWidth={1.75} />
            {!collapsed && (
                <>
                    <span className="truncate">{item.name}</span>
                    {typeof count === 'number' && count > 0 && (
                        <span className={cn('mono-label ml-auto text-[11px]', active ? 'text-brand' : 'text-muted-foreground')}>
                            {count}
                        </span>
                    )}
                </>
            )}
        </Link>
    );
}

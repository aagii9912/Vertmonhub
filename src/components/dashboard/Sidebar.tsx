'use client';

import React, { useMemo } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ChevronsLeft, ChevronsRight, LogOut, UserCircle, Settings, Sun, Moon } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { canAccessModule, canAccessModuleDynamic, getRoleDisplayName } from '@/lib/rbac';
import { cn } from '@/lib/utils';
import { PRIMARY_NAV, BOTTOM_NAV, isNavItemActive, type NavItem } from '@/lib/navigation/nav';
import { useSidebarCollapsed } from '@/hooks/useSidebarCollapsed';
import { useDashboardMode } from '@/hooks/useDashboardMode';
import { useNavCounts } from '@/hooks/useNavCounts';
import { useTheme } from '@/hooks/useTheme';
import { openCommandPalette } from '@/lib/navigation/commandPalette';
import { ProjectSwitcher } from '@/components/dashboard/ProjectSwitcher';
import { BrandMark } from '@/components/brand/BrandMark';
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

/**
 * v3 «Шөнө» sidebar: хоёр темд ч гүн бараан хүрээ, идэвхтэй цэс шампань зураастай.
 * Өнгө нь зөвхөн `sidebar-*` токеноос — контентын тематай холилдохгүй.
 */
export function Sidebar() {
    const pathname = usePathname() || '';
    const { user, signOut } = useAuth();
    const { collapsed, toggle } = useSidebarCollapsed();
    const { theme, toggle: toggleTheme } = useTheme();
    const counts = useNavCounts();
    const { data: dashboardMode } = useDashboardMode();
    const dashboardName = dashboardMode?.mode === 'personal' ? 'Өнөөдөр' : 'Самбар';

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
    const groupLabel = 'px-2.5 pb-1.5 pt-5 text-xs font-medium text-sidebar-muted';

    return (
        <aside
            className={cn(
                'fixed inset-y-0 left-0 z-40 hidden md:flex flex-col',
                'border-r border-sidebar-border bg-sidebar text-sidebar-foreground',
                'w-[var(--sidebar-w)] transition-[width] duration-200 ease-out',
            )}
        >
            {/* Брэнд */}
            <div className={cn('flex items-center gap-3 px-4 pt-5 pb-4', collapsed && 'justify-center px-0')}>
                <Link href="/dashboard" className="shrink-0 rounded-[9px]" aria-label="Vertmon Hub">
                    <BrandMark className="size-8" />
                </Link>
                {!collapsed && (
                    <div className="min-w-0 flex-1 leading-tight">
                        <div className="truncate text-[15px] font-semibold tracking-tight text-sidebar-accent-foreground">Vertmon Hub</div>
                        <ProjectSwitcher />
                    </div>
                )}
            </div>

            {/* Хайлт (⌘K) */}
            <div className={cn('px-3 pb-2', collapsed && 'px-2')}>
                <button
                    type="button"
                    onClick={openCommandPalette}
                    className={cn(
                        'flex w-full items-center gap-2 rounded-lg border border-sidebar-border text-sidebar-muted',
                        'transition-colors hover:bg-sidebar-hover hover:text-sidebar-accent-foreground',
                        collapsed ? 'h-9 justify-center px-0' : 'h-9 px-2.5',
                    )}
                    aria-label="Хайх"
                >
                    <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0 stroke-current" fill="none" strokeWidth={1.75} strokeLinecap="round">
                        <circle cx="11" cy="11" r="7" />
                        <path d="M20 20l-3.5-3.5" />
                    </svg>
                    {!collapsed && (
                        <>
                            <span className="text-[13px]">Хайх…</span>
                            <kbd className="mono-label ml-auto rounded border border-sidebar-border px-1.5 text-xs leading-5 text-sidebar-muted">
                                ⌘K
                            </kbd>
                        </>
                    )}
                </button>
            </div>

            {/* Үндсэн цэс */}
            <nav className="flex min-h-0 flex-col gap-0.5 overflow-y-auto px-3" aria-label="Үндсэн цэс">
                {allowed.bottom.filter(item => item.href === '/dashboard/ai-assistant').map(item => <NavRow key={item.href} item={item} pathname={pathname} collapsed={collapsed} />)}
                {!collapsed && <p className={groupLabel}>Ажлын орчин</p>}
                {allowed.primary.map((item) => (
                    <React.Fragment key={item.href}>
                        {!collapsed && item.href === '/dashboard/leads' && <p className={groupLabel}>Харилцагч ба борлуулалт</p>}
                        {!collapsed && item.href === '/dashboard/reports' && <p className={groupLabel}>Үр дүн</p>}
                        <NavRow item={item.href === '/dashboard' ? { ...item, name: dashboardName } : item} pathname={pathname} collapsed={collapsed} count={item.countKey ? counts[item.countKey] : undefined} />
                    </React.Fragment>
                ))}
            </nav>

            <div className="flex-1" />

            {/* Доод цэс */}
            <nav className="flex flex-col gap-0.5 px-3 pb-1" aria-label="Нэмэлт цэс">
                {allowed.bottom.filter(item => item.href !== '/dashboard/ai-assistant').map((item) => (
                    <NavRow key={item.href} item={item.href === '/dashboard' ? { ...item, name: dashboardName } : item} pathname={pathname} collapsed={collapsed} />
                ))}
            </nav>

            {/* Хэрэглэгч */}
            <div className="mx-3 mt-1.5 border-t border-sidebar-border pt-2 pb-2">
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <button
                            type="button"
                            className={cn(
                                'flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-sidebar-hover',
                                collapsed && 'justify-center px-0',
                            )}
                        >
                            <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-sidebar-accent text-xs font-semibold text-sidebar-accent-foreground ring-1 ring-sidebar-border">
                                {initialsOf(displayName)}
                            </span>
                            {!collapsed && (
                                <span className="min-w-0 flex-1 leading-tight">
                                    <span className="block truncate text-[13px] font-semibold text-sidebar-accent-foreground">{displayName}</span>
                                    <span className="block truncate text-xs text-sidebar-muted">{getRoleDisplayName(userRole)}</span>
                                </span>
                            )}
                        </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start" side="top" className="w-60">
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
                        <DropdownMenuItem onSelect={toggleTheme} className="flex items-center gap-2">
                            {theme === 'dark'
                                ? (<><Sun className="h-4 w-4" /> Цайвар тема</>)
                                : (<><Moon className="h-4 w-4" /> Бараан тема</>)}
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
                className="mx-3 mb-3 flex h-8 items-center justify-center gap-1.5 rounded-lg text-xs text-sidebar-muted transition-colors hover:bg-sidebar-hover hover:text-sidebar-accent-foreground"
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
    const hasCount = typeof count === 'number' && count > 0;
    // Уншаагүй мессеж үйлдэл шаарддаг тул цэнхэр тэмдгээр, бусад тоо саармаг.
    const urgent = item.countKey === 'inbox';

    return (
        <Link
            href={item.href}
            aria-current={active ? 'page' : undefined}
            title={collapsed ? item.name : item.href === '/dashboard/ai-assistant' ? 'AI туслах (⌘J)' : undefined}
            className={cn(
                'relative flex min-h-9 shrink-0 items-center gap-2.5 rounded-lg px-2.5 text-sm transition-colors',
                collapsed && 'justify-center px-0',
                active
                    ? 'bg-sidebar-accent font-medium text-sidebar-accent-foreground shadow-[inset_2px_0_0_var(--sidebar-primary)]'
                    : 'text-sidebar-foreground hover:bg-sidebar-hover hover:text-sidebar-accent-foreground',
            )}
        >
            <Icon className={cn('h-4 w-4 shrink-0', active ? 'text-sidebar-primary' : 'text-sidebar-muted')} strokeWidth={1.75} />
            {collapsed ? (
                hasCount && <span aria-hidden="true" className={cn('absolute right-2 top-2 size-1.5 rounded-full', urgent ? 'bg-brand' : 'bg-sidebar-muted')} />
            ) : (
                <>
                    <span className="truncate">{item.name}</span>
                    {hasCount && (
                        <span
                            className={cn(
                                'ml-auto min-w-5 rounded-full px-1.5 text-center text-xs leading-5 tabular-nums',
                                urgent ? 'bg-brand font-semibold text-brand-fg' : active ? 'text-sidebar-primary' : 'text-sidebar-muted',
                            )}
                        >
                            {count}
                        </span>
                    )}
                </>
            )}
            {collapsed && hasCount && <span className="sr-only">{`${count} шинэ`}</span>}
        </Link>
    );
}

'use client';

import React, { useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ChevronDown, ChevronsLeft, ChevronsRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { NAV_SECTIONS, BOTTOM_NAV, isNavItemActive, isSuperAdminRoute, type NavItem } from '@/lib/navigation/nav';
import { useSidebarCollapsed } from '@/hooks/useSidebarCollapsed';
import { useDashboardMode } from '@/hooks/useDashboardMode';
import { useNavCounts } from '@/hooks/useNavCounts';
import { useModuleAccess } from '@/hooks/useModuleAccess';
import { BrandMark } from '@/components/brand/BrandMark';

/**
 * Sidebar v3 — 232px, хумихад 64px icon rail. Бараан, хоёр темд ижил.
 *
 * Зөвхөн навигаци: брэнд, бүлэгтэй цэс (Өнөөдөр · Борлуулалт · Үр дүн), super_admin-д
 * «Удирдлага», доор нь Тохиргоо. Төсөл, хайлт, «+ Шинэ», AI, профайл дээд мөрөнд.
 */
export function Sidebar() {
    const pathname = usePathname() || '';
    const { collapsed, toggle } = useSidebarCollapsed();
    const counts = useNavCounts();
    const { data: dashboardMode } = useDashboardMode();
    const { can, isSuperAdmin } = useModuleAccess();
    const dashboardName = dashboardMode?.mode === 'personal' ? 'Өнөөдөр' : 'Самбар';

    const sections = useMemo(
        () => NAV_SECTIONS
            .filter((section) => !section.superAdmin || isSuperAdmin)
            .map((section) => ({ ...section, items: section.items.filter((item) => item.superAdmin ? isSuperAdmin : can(item.module)) }))
            .filter((section) => section.items.length > 0),
        [can, isSuperAdmin],
    );
    const bottom = BOTTOM_NAV.filter((item) => can(item.module));

    // Удирдлага: админ хуудсан дээр байхад нээлттэй, бусад үед хумигдсан (дарж нээнэ).
    const onAdmin = isSuperAdminRoute(pathname);
    const [adminOpen, setAdminOpen] = useState(false);
    const adminExpanded = onAdmin || adminOpen;

    const label = (item: NavItem): NavItem => (item.href === '/dashboard' ? { ...item, name: dashboardName } : item);

    return (
        <aside
            className={cn(
                'fixed inset-y-0 left-0 z-40 flex flex-col',
                'border-r border-sidebar-border bg-sidebar text-sidebar-foreground',
                'w-[var(--sidebar-w)] transition-[width] duration-200 ease-out',
            )}
        >
            {/* Брэнд — дээд мөртэй ижил 56px өндөр */}
            <div className={cn('flex h-[var(--header-h)] shrink-0 items-center gap-2.5 px-4', collapsed && 'justify-center px-0')}>
                <Link href="/dashboard" className="flex min-w-0 items-center gap-2.5 rounded-lg" aria-label="Vertmon Hub — нүүр">
                    <BrandMark className="size-7 shrink-0" />
                    {!collapsed && <span className="truncate text-[15px] font-semibold tracking-tight text-sidebar-accent-foreground">Vertmon Hub</span>}
                </Link>
            </div>

            <nav className="flex min-h-0 flex-1 flex-col overflow-y-auto px-3 pb-2" aria-label="Үндсэн цэс">
                {sections.map((section, index) => {
                    const isAdmin = section.id === 'admin';
                    const open = !isAdmin || adminExpanded || collapsed;
                    return (
                        <div key={section.id} className={cn('flex flex-col gap-0.5', index > 0 && 'mt-4')}>
                            {section.label && (collapsed ? (
                                <div aria-hidden="true" className="mx-auto mb-1 h-px w-6 bg-sidebar-border" />
                            ) : isAdmin ? (
                                <button
                                    type="button"
                                    onClick={() => setAdminOpen((v) => !v)}
                                    aria-expanded={adminExpanded}
                                    disabled={onAdmin}
                                    className="flex h-7 items-center gap-1 rounded-md px-2.5 text-left text-xs font-medium text-sidebar-muted transition-colors hover:text-sidebar-accent-foreground disabled:cursor-default disabled:hover:text-sidebar-muted"
                                >
                                    {section.label}
                                    <ChevronDown className={cn('ml-auto h-3.5 w-3.5 transition-transform', !adminExpanded && '-rotate-90')} />
                                </button>
                            ) : (
                                <p className="flex h-7 items-center px-2.5 text-xs font-medium text-sidebar-muted">{section.label}</p>
                            ))}
                            {open && section.items.map((item) => (
                                <NavRow
                                    key={item.href}
                                    item={label(item)}
                                    pathname={pathname}
                                    collapsed={collapsed}
                                    count={item.countKey ? counts[item.countKey] : undefined}
                                />
                            ))}
                        </div>
                    );
                })}
            </nav>

            <div className="flex shrink-0 flex-col gap-0.5 border-t border-sidebar-border px-3 py-2">
                {bottom.map((item) => <NavRow key={item.href} item={item} pathname={pathname} collapsed={collapsed} />)}
                <button
                    type="button"
                    onClick={toggle}
                    className={cn(
                        'flex min-h-9 items-center gap-2.5 rounded-lg px-2.5 text-sm text-sidebar-muted transition-colors hover:bg-sidebar-hover hover:text-sidebar-accent-foreground',
                        collapsed && 'justify-center px-0',
                    )}
                    aria-label={collapsed ? 'Цэсийг дэлгэх' : 'Цэсийг хумих'}
                    title={collapsed ? 'Цэсийг дэлгэх' : undefined}
                >
                    {collapsed ? <ChevronsRight className="h-4 w-4" /> : (<><ChevronsLeft className="h-4 w-4" /> Хумих</>)}
                </button>
            </div>
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
    // Хариу хүлээж буй мессеж үйлдэл шаарддаг тул цэнхэр тэмдгээр, бусад тоо саармаг.
    const urgent = item.countKey === 'inbox';

    return (
        <Link
            href={item.href}
            aria-current={active ? 'page' : undefined}
            title={collapsed ? item.name : undefined}
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

'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
    Building2,
    ChevronDown,
    ChevronUp,
    ChevronRight,
    LogOut,
    Settings,
    PanelLeftClose,
    PanelLeftOpen,
    UserCircle,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { canAccessModule, canAccessModuleDynamic, getRoleDisplayName } from '@/lib/rbac';
import { cn } from '@/lib/utils';
import {
    BOTTOM_ITEMS,
    isNavItemActive,
    type NavItem,
} from '@/lib/navigation/workspaces';
import { useActiveWorkspace, rememberSubroute } from '@/lib/navigation/useActiveWorkspace';
import { useSidebarCollapsed } from '@/hooks/useSidebarCollapsed';
import { WorkspaceSwitcher } from '@/components/dashboard/WorkspaceSwitcher';
import {
    DropdownMenu,
    DropdownMenuTrigger,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
} from '@/components/ui/Dropdown';

const SECTIONS_KEY = 'vertmonhub_sidebar_sections';

export function Sidebar() {
    const [collapsedSections, setCollapsedSections] = useState<string[]>([]);
    const [expandedMenus, setExpandedMenus] = useState<string[]>([]);
    const pathname = usePathname();
    const { shop, user, signOut } = useAuth();
    const userRole = user?.role || 'viewer';
    const userPermissions = user?.permissions;
    const { collapsed, toggle } = useSidebarCollapsed();

    const active = useActiveWorkspace();

    // Switcher-т буцах байрлал санахын тулд сүүлийн дэд хуудсыг хадгална.
    useEffect(() => {
        if (pathname) rememberSubroute(active.id, pathname);
    }, [active.id, pathname]);

    // Хэсгийн хумилтын төлөвийг сэргээх / хадгалах.
    useEffect(() => {
        try {
            const raw = localStorage.getItem(SECTIONS_KEY);
            if (raw) setCollapsedSections(JSON.parse(raw));
        } catch { /* алгасна */ }
    }, []);

    const checkModuleAccess = (module: string): boolean => {
        if (module === '') return true; // эрхгүй цэс — үргэлж харагдана
        if (userPermissions) return canAccessModuleDynamic(userPermissions, module);
        return canAccessModule(userRole, module);
    };

    const toggleSection = (id: string) => {
        setCollapsedSections((prev) => {
            const next = prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id];
            try { localStorage.setItem(SECTIONS_KEY, JSON.stringify(next)); } catch { /* алгасна */ }
            return next;
        });
    };

    const toggleMenu = (name: string) => {
        setExpandedMenus((prev) =>
            prev.includes(name) ? prev.filter((m) => m !== name) : [...prev, name],
        );
    };

    const isActive = (href: string) => pathname === href;
    const isParentActive = (item: NavItem) => {
        if (pathname === item.href) return true;
        // Дэд хуудас (жишээ: /properties/[id], /leads/pipeline) дээр эх цэс тодорно
        if (item.children?.length) {
            if (item.children.some((child) => isActive(child.href))) return true;
            if (pathname?.startsWith(item.href + '/')) return true;
        }
        return false;
    };

    // Эрхээр шүүсэн харагдах хэсгүүд
    const visibleSections = active.sections
        .map((section) => ({
            ...section,
            items: section.items.filter((item) => checkModuleAccess(item.module)),
        }))
        .filter((section) => section.items.length > 0);

    const filteredBottomItems = BOTTOM_ITEMS.filter((item) => checkModuleAccess(item.module));

    /** Идэвхтэй цэсний зүүн талын terracotta заагч (хүчтэй active төлөв). */
    const activeBar = 'before:absolute before:left-0 before:top-1.5 before:bottom-1.5 before:w-[3px] before:rounded-full before:bg-brand';

    // Нэг цэсний мөр (leaf) — collapsed үед icon-only + title.
    const renderLeaf = (item: NavItem, opts?: { bottom?: boolean }) => {
        const itemActive = opts?.bottom ? isNavItemActive(pathname || '', item.href, { exact: true }) : isParentActive(item);
        return (
            <Link
                href={item.href}
                title={collapsed ? item.name : undefined}
                aria-current={itemActive ? 'page' : undefined}
                className={cn(
                    'relative flex items-center rounded-md transition-colors text-sm group',
                    collapsed ? 'justify-center h-10 w-10 mx-auto' : 'gap-2.5 px-2.5 py-2',
                    itemActive
                        ? cn('bg-surface-2 text-foreground font-medium', activeBar)
                        : 'text-muted-foreground hover:bg-surface-2 hover:text-foreground',
                )}
            >
                <item.icon
                    className={cn(
                        'w-4 h-4 shrink-0',
                        itemActive ? 'text-brand' : 'text-muted-foreground/70 group-hover:text-foreground',
                    )}
                />
                {!collapsed && <span className="font-medium truncate">{item.name}</span>}
                {!collapsed && item.badge && (
                    <span className="px-1.5 py-0.5 bg-brand-soft text-brand-strong text-2xs font-semibold rounded uppercase tracking-wider">
                        {item.badge}
                    </span>
                )}
            </Link>
        );
    };

    return (
        <aside className="fixed left-0 top-0 h-screen w-[var(--sidebar-w)] bg-surface border-r border-border flex flex-col z-50 hidden md:flex transition-[width] duration-200">
            {/* Брэнд + хумих товч */}
            <div className={cn('flex items-center h-14 border-b border-border/60', collapsed ? 'justify-center px-2' : 'justify-between px-4')}>
                {!collapsed && (
                    <div className="flex items-center gap-2.5 min-w-0">
                        <div className="w-8 h-8 rounded-md bg-brand text-brand-fg flex items-center justify-center shrink-0">
                            <Building2 className="w-4 h-4" />
                        </div>
                        <div className="flex flex-col leading-tight min-w-0">
                            <span className="heading-display text-sm text-foreground truncate">Vertmon Hub</span>
                            <span className="font-mono text-2xs tracking-[0.16em] text-muted-foreground/70">CRM</span>
                        </div>
                    </div>
                )}
                <button
                    onClick={toggle}
                    aria-label={collapsed ? 'Цэсийг дэлгэх' : 'Цэсийг хумих'}
                    title={collapsed ? 'Дэлгэх' : 'Хумих'}
                    className="p-1.5 rounded-md text-muted-foreground hover:bg-surface-2 hover:text-foreground transition-colors shrink-0"
                >
                    {collapsed ? <PanelLeftOpen className="w-4 h-4" /> : <PanelLeftClose className="w-4 h-4" />}
                </button>
            </div>

            {/* Workspace switcher (Workspace → Section → Item шатлалын эхлэл) */}
            <div className={cn('border-b border-border/60', collapsed ? 'px-2 py-2' : 'px-2.5 py-2.5')}>
                <WorkspaceSwitcher variant="sidebar" collapsed={collapsed} />
            </div>

            {/* Үндсэн навигаци */}
            <nav className="flex-1 overflow-y-auto py-3 px-2.5">
                {visibleSections.length === 0 ? (
                    !collapsed && <p className="px-2.5 py-4 text-sm text-muted-foreground">Хандах эрхгүй</p>
                ) : (
                    visibleSections.map((section) => {
                        const isCollapsed = collapsedSections.includes(section.id);

                        return (
                            <div key={section.id} className="mb-3">
                                {/* Хэсгийн гарчиг (rail горимд нуугдана) */}
                                {!collapsed && (
                                    <button
                                        onClick={() => toggleSection(section.id)}
                                        className="w-full flex items-center justify-between px-2.5 py-1.5 group"
                                    >
                                        <span className="font-mono text-2xs font-medium tracking-[0.2em] text-muted-foreground/70 group-hover:text-muted-foreground transition-colors">
                                            {section.title}
                                        </span>
                                        <ChevronRight
                                            className={cn(
                                                'w-3 h-3 text-muted-foreground/60 transition-transform duration-200',
                                                !isCollapsed && 'rotate-90',
                                            )}
                                        />
                                    </button>
                                )}

                                {/* Хэсгийн цэснүүд */}
                                {(collapsed || !isCollapsed) && (
                                    <ul className="space-y-0.5 mt-1">
                                        {section.items.map((item) => {
                                            const itemActive = isParentActive(item);
                                            const isExpanded = expandedMenus.includes(item.name);
                                            const hasChildren = !collapsed && item.children && item.children.length > 0;

                                            return (
                                                <li key={item.name}>
                                                    {hasChildren ? (
                                                        <>
                                                            <button
                                                                onClick={() => toggleMenu(item.name)}
                                                                className={cn(
                                                                    'relative w-full flex items-center justify-between px-2.5 py-2 rounded-md transition-colors text-sm group',
                                                                    itemActive
                                                                        ? cn('bg-surface-2 text-foreground', activeBar)
                                                                        : 'text-muted-foreground hover:bg-surface-2 hover:text-foreground',
                                                                )}
                                                            >
                                                                <div className="flex items-center gap-2.5 min-w-0">
                                                                    <item.icon
                                                                        className={cn(
                                                                            'w-4 h-4 shrink-0',
                                                                            itemActive ? 'text-brand' : 'text-muted-foreground/70 group-hover:text-foreground',
                                                                        )}
                                                                    />
                                                                    <span className="font-medium truncate">{item.name}</span>
                                                                    {item.badge && (
                                                                        <span className="px-1.5 py-0.5 bg-brand-soft text-brand-strong text-2xs font-semibold rounded uppercase tracking-wider">
                                                                            {item.badge}
                                                                        </span>
                                                                    )}
                                                                </div>
                                                                {isExpanded ? (
                                                                    <ChevronUp className="w-3.5 h-3.5 text-muted-foreground/60 shrink-0" />
                                                                ) : (
                                                                    <ChevronDown className="w-3.5 h-3.5 text-muted-foreground/60 shrink-0" />
                                                                )}
                                                            </button>
                                                            {isExpanded && (
                                                                <ul className="mt-0.5 ml-4 pl-3 border-l border-border space-y-0.5">
                                                                    {item.children?.map((child) => (
                                                                        <li key={child.name}>
                                                                            <Link
                                                                                href={child.href}
                                                                                aria-current={isActive(child.href) ? 'page' : undefined}
                                                                                className={cn(
                                                                                    'block px-2.5 py-1.5 rounded-md text-sm transition-colors',
                                                                                    isActive(child.href)
                                                                                        ? 'text-foreground bg-surface-2 font-medium'
                                                                                        : 'text-muted-foreground hover:text-foreground hover:bg-surface-2',
                                                                                )}
                                                                            >
                                                                                {child.name}
                                                                            </Link>
                                                                        </li>
                                                                    ))}
                                                                </ul>
                                                            )}
                                                        </>
                                                    ) : (
                                                        renderLeaf(item)
                                                    )}
                                                </li>
                                            );
                                        })}
                                    </ul>
                                )}
                            </div>
                        );
                    })
                )}
            </nav>

            {/* Доод цэс */}
            <div className="px-2.5 py-2 border-t border-border/60">
                <ul className="space-y-0.5">
                    {filteredBottomItems.map((item) => (
                        <li key={item.name}>{renderLeaf(item, { bottom: true })}</li>
                    ))}
                </ul>
            </div>

            {/* Хэрэглэгчийн профайл — нэгдсэн цэс (Тохиргоо + Гарах) */}
            <div className="px-2.5 pb-3 border-t border-border/60 pt-2">
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <button
                            title={collapsed ? (shop?.name || 'Профайл') : undefined}
                            aria-label="Профайл цэс"
                            className={cn(
                                'w-full flex items-center rounded-md hover:bg-surface-2 transition-colors',
                                collapsed ? 'justify-center p-1.5' : 'gap-2.5 px-2.5 py-2',
                            )}
                        >
                            <div className="w-7 h-7 rounded-full bg-brand-soft flex items-center justify-center shrink-0">
                                <UserCircle className="w-4 h-4 text-brand-strong" />
                            </div>
                            {!collapsed && (
                                <>
                                    <div className="flex-1 text-left min-w-0">
                                        <p className="text-sm font-medium text-foreground truncate">{shop?.name || 'Агент'}</p>
                                        <p className="text-xs text-muted-foreground/80 truncate">{getRoleDisplayName(userRole)}</p>
                                    </div>
                                    <ChevronUp className="w-3.5 h-3.5 text-muted-foreground/60 shrink-0" />
                                </>
                            )}
                        </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent side="top" align="start" className="w-56">
                        <DropdownMenuLabel>
                            <p className="text-sm font-medium text-foreground truncate">{shop?.name || 'Агент'}</p>
                            <p className="text-xs text-muted-foreground/80 truncate font-normal">{getRoleDisplayName(userRole)}</p>
                        </DropdownMenuLabel>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem asChild>
                            <Link href="/dashboard/settings">
                                <Settings className="w-4 h-4 text-muted-foreground/70" />
                                Тохиргоо
                            </Link>
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem variant="danger" onSelect={() => signOut()}>
                            <LogOut className="w-4 h-4" />
                            Гарах
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
            </div>
        </aside>
    );
}

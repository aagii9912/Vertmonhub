'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
    Settings,
    ChevronDown,
    ChevronUp,
    UserCircle,
    ChevronRight,
    LogOut,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { canAccessModule, canAccessModuleDynamic, getRoleDisplayName } from '@/lib/rbac';
import { cn } from '@/lib/utils';
import { BOTTOM_ITEMS, type NavItem } from '@/lib/navigation/workspaces';
import { useActiveWorkspace, rememberSubroute } from '@/lib/navigation/useActiveWorkspace';

export function Sidebar() {
    const [collapsedSections, setCollapsedSections] = useState<string[]>([]);
    const [expandedMenus, setExpandedMenus] = useState<string[]>([]);
    const pathname = usePathname();
    const { shop, user, signOut } = useAuth();
    const userRole = user?.role || 'viewer';
    const userPermissions = user?.permissions;

    const active = useActiveWorkspace();
    const ActiveIcon = active.icon;

    // Switcher-т буцах байрлал санахын тулд сүүлийн дэд хуудсыг хадгална.
    useEffect(() => {
        if (pathname) rememberSubroute(active.id, pathname);
    }, [active.id, pathname]);

    const checkModuleAccess = (module: string): boolean => {
        if (module === '') return true; // эрхгүй цэс — үргэлж харагдана
        if (userPermissions) return canAccessModuleDynamic(userPermissions, module);
        return canAccessModule(userRole, module);
    };

    const toggleSection = (id: string) => {
        setCollapsedSections((prev) =>
            prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id],
        );
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

    return (
        <aside className="fixed left-0 top-0 h-screen w-64 bg-surface border-r border-border flex flex-col z-50 hidden md:flex">
            {/* Workspace таних хэсэг */}
            <div className="flex items-center justify-between h-14 px-4 border-b border-border/60">
                <div className="flex items-center gap-2.5">
                    <div
                        className={cn(
                            'w-8 h-8 rounded-md flex items-center justify-center',
                            active.id === 'ai' ? 'bg-brand text-brand-fg' : 'bg-foreground text-background',
                        )}
                    >
                        <ActiveIcon className="w-4 h-4" />
                    </div>
                    <div className="flex flex-col leading-tight">
                        <span className="heading-display text-sm text-foreground">{active.label}</span>
                        <span className="font-mono text-[9px] tracking-[0.16em] text-muted-foreground/70">VERTMON HUB</span>
                    </div>
                </div>
            </div>

            {/* Үндсэн навигаци */}
            <nav className="flex-1 overflow-y-auto py-3 px-2.5">
                {visibleSections.length === 0 ? (
                    <p className="px-2.5 py-4 text-sm text-muted-foreground">Хандах эрхгүй</p>
                ) : (
                    visibleSections.map((section) => {
                        const isCollapsed = collapsedSections.includes(section.id);

                        return (
                            <div key={section.id} className="mb-3">
                                {/* Хэсгийн гарчиг */}
                                <button
                                    onClick={() => toggleSection(section.id)}
                                    className="w-full flex items-center justify-between px-2.5 py-1.5 group"
                                >
                                    <span className="font-mono text-[10px] font-medium tracking-[0.2em] text-muted-foreground/70 group-hover:text-muted-foreground transition-colors">
                                        {section.title}
                                    </span>
                                    <ChevronRight
                                        className={cn(
                                            'w-3 h-3 text-muted-foreground/60 transition-transform duration-200',
                                            !isCollapsed && 'rotate-90',
                                        )}
                                    />
                                </button>

                                {/* Хэсгийн цэснүүд */}
                                {!isCollapsed && (
                                    <ul className="space-y-0.5 mt-1">
                                        {section.items.map((item) => {
                                            const itemActive = isParentActive(item);
                                            const isExpanded = expandedMenus.includes(item.name);
                                            const hasChildren = item.children && item.children.length > 0;

                                            return (
                                                <li key={item.name}>
                                                    {hasChildren ? (
                                                        <>
                                                            <button
                                                                onClick={() => toggleMenu(item.name)}
                                                                className={cn(
                                                                    'w-full flex items-center justify-between px-2.5 py-2 rounded-md transition-colors text-sm group',
                                                                    itemActive
                                                                        ? 'bg-surface-2 text-foreground'
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
                                                                        <span className="px-1.5 py-0.5 bg-brand-soft text-brand-strong text-[9px] font-semibold rounded uppercase tracking-wider">
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
                                                        <Link
                                                            href={item.href}
                                                            className={cn(
                                                                'flex items-center gap-2.5 px-2.5 py-2 rounded-md transition-colors text-sm group',
                                                                itemActive
                                                                    ? 'bg-surface-2 text-foreground'
                                                                    : 'text-muted-foreground hover:bg-surface-2 hover:text-foreground',
                                                            )}
                                                        >
                                                            <item.icon
                                                                className={cn(
                                                                    'w-4 h-4 shrink-0',
                                                                    itemActive ? 'text-brand' : 'text-muted-foreground/70 group-hover:text-foreground',
                                                                )}
                                                            />
                                                            <span className="font-medium truncate">{item.name}</span>
                                                            {item.badge && (
                                                                <span className="px-1.5 py-0.5 bg-brand-soft text-brand-strong text-[9px] font-semibold rounded uppercase tracking-wider">
                                                                    {item.badge}
                                                                </span>
                                                            )}
                                                        </Link>
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
                        <li key={item.name}>
                            <Link
                                href={item.href}
                                className={cn(
                                    'flex items-center gap-2.5 px-2.5 py-2 rounded-md transition-colors text-sm',
                                    isActive(item.href)
                                        ? 'text-foreground bg-surface-2'
                                        : 'text-muted-foreground hover:bg-surface-2 hover:text-foreground',
                                )}
                            >
                                <item.icon className="w-4 h-4" />
                                <span>{item.name}</span>
                            </Link>
                        </li>
                    ))}
                    <li>
                        <button
                            onClick={() => signOut()}
                            className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-md text-muted-foreground hover:bg-surface-2 hover:text-foreground transition-colors text-sm"
                        >
                            <LogOut className="w-4 h-4" />
                            <span>Гарах</span>
                        </button>
                    </li>
                </ul>
            </div>

            {/* Хэрэглэгчийн профайл */}
            <div className="px-2.5 pb-3 border-t border-border/60 pt-2">
                <button className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-md hover:bg-surface-2 transition-colors">
                    <div className="w-7 h-7 rounded-full bg-brand-soft flex items-center justify-center shrink-0">
                        <UserCircle className="w-4 h-4 text-brand-strong" />
                    </div>
                    <div className="flex-1 text-left min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">{shop?.name || 'Агент'}</p>
                        <p className="text-[11px] text-muted-foreground/80">{getRoleDisplayName(userRole)}</p>
                    </div>
                    <ChevronDown className="w-3.5 h-3.5 text-muted-foreground/60 shrink-0" />
                </button>
            </div>
        </aside>
    );
}

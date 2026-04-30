'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
    LayoutDashboard,
    Building2,
    Users,
    MessageSquare,
    BarChart3,
    Settings,
    ChevronDown,
    Sparkles,
    HelpCircle,
    LogOut,
    Bot,
    ChevronUp,
    UserCircle,
    Megaphone,
    ArrowLeftRight,
    ClipboardList,
    FileText,
    Eye,
    TrendingUp,
    Share2,
    ChevronRight,
    Headphones,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { canAccessModule, canAccessModuleDynamic, getRoleDisplayName } from '@/lib/rbac';
import { cn } from '@/lib/utils';

interface MenuItem {
    name: string;
    href: string;
    icon: React.ComponentType<React.SVGAttributes<SVGSVGElement>>;
    badge?: string;
    module: string;
    children?: { name: string; href: string }[];
}

interface MenuSection {
    id: string;
    title: string;
    icon: React.ComponentType<React.SVGAttributes<SVGSVGElement>>;
    items: MenuItem[];
    roleRestricted?: boolean;
}

const sections: MenuSection[] = [
    {
        id: 'sales',
        title: 'SALES',
        icon: Building2,
        items: [
            { name: 'Хянах самбар', href: '/dashboard', icon: LayoutDashboard, module: 'dashboard' },
            {
                name: 'Үл хөдлөх', href: '/dashboard/properties', icon: Building2, module: 'properties',
                children: [
                    { name: 'Бүх үл хөдлөх', href: '/dashboard/properties' },
                    { name: 'Шинэ нэмэх', href: '/dashboard/properties/new' },
                ],
            },
            {
                name: 'Лийд', href: '/dashboard/leads', icon: Users, module: 'leads',
                children: [
                    { name: 'Бүх лийд', href: '/dashboard/leads' },
                    { name: 'Pipeline', href: '/dashboard/leads/pipeline' },
                ],
            },
            { name: 'Үзлэг', href: '/dashboard/viewings', icon: Eye, module: 'viewings' },
            { name: 'Гэрээ', href: '/dashboard/contracts', icon: FileText, module: 'contracts' },
            { name: 'Харилцагч', href: '/dashboard/customers', icon: Users, module: 'customers' },
            { name: 'Үйлчилгээ', href: '/dashboard/customer-service', icon: Headphones, badge: 'Шинэ', module: 'contracts' },
        ],
    },
    {
        id: 'marketing',
        title: 'MARKETING',
        icon: Megaphone,
        items: [
            { name: 'Маркетинг ROI', href: '/dashboard/marketing-roi', icon: TrendingUp, module: 'marketing-roi' },
            {
                name: 'Аналитик', href: '/dashboard/reports', icon: BarChart3, module: 'reports',
                children: [
                    { name: 'Тойм', href: '/dashboard/reports' },
                    { name: 'Лийд шинжилгээ', href: '/dashboard/reports/leads' },
                ],
            },
            { name: 'Судалгаа', href: '/dashboard/surveys', icon: ClipboardList, badge: 'Шинэ', module: 'surveys' },
        ],
    },
    {
        id: 'ai',
        title: 'AI ASSISTANT',
        icon: Sparkles,
        items: [
            { name: 'AI Дата Туслах', href: '/dashboard/ai-assistant', icon: Sparkles, module: 'ai-assistant' },
            {
                name: 'Тайлан', href: '/dashboard/reports', icon: BarChart3, module: 'reports',
            },
        ],
    },
    {
        id: 'chatbot',
        title: 'CHATBOT',
        icon: Bot,
        roleRestricted: true,
        items: [
            { name: 'Мессеж', href: '/dashboard/inbox', icon: MessageSquare, module: 'inbox' },
            { name: 'AI Тохиргоо', href: '/dashboard/ai-settings', icon: Bot, module: 'ai-settings' },
            { name: 'Social холбох', href: '/dashboard/settings', icon: Share2, module: 'settings' },
        ],
    },
];

const bottomMenuItems = [
    { name: 'Тусламж', href: '/help', icon: HelpCircle },
    { name: 'Тохиргоо', href: '/dashboard/settings', icon: Settings },
];

export function Sidebar() {
    const [collapsedSections, setCollapsedSections] = useState<string[]>([]);
    const [expandedMenus, setExpandedMenus] = useState<string[]>([]);
    const pathname = usePathname();
    const { shop, user, signOut } = useAuth();
    const userRole = user?.role || 'viewer';
    const userPermissions = user?.permissions;

    const checkModuleAccess = (module: string): boolean => {
        if (userPermissions) return canAccessModuleDynamic(userPermissions, module);
        return canAccessModule(userRole, module);
    };

    const canSeeChatbot = userRole === 'super_admin' || userRole === 'marketing_manager' || userRole === 'admin';

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
    const isParentActive = (item: MenuItem) => {
        if (isActive(item.href)) return true;
        return item.children?.some((child) => isActive(child.href)) ?? false;
    };

    const filteredBottomItems = bottomMenuItems.filter((item) => {
        if (item.href === '/dashboard/settings') return checkModuleAccess('settings');
        return true;
    });

    return (
        <aside className="fixed left-0 top-0 h-screen w-64 bg-surface border-r border-border flex flex-col z-50 hidden md:flex">
            {/* Logo */}
            <div className="flex items-center justify-between h-14 px-4 border-b border-border/60">
                <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-md bg-foreground text-background flex items-center justify-center">
                        <Building2 className="w-4 h-4" />
                    </div>
                    <div className="flex flex-col leading-tight">
                        <span className="heading-display text-sm text-foreground">Vertmon</span>
                        <span className="font-mono text-[9px] tracking-[0.16em] text-muted-foreground/70">HUB</span>
                    </div>
                </div>
            </div>

            {/* Main Navigation */}
            <nav className="flex-1 overflow-y-auto py-3 px-2.5">
                {sections.map((section) => {
                    if (section.roleRestricted && !canSeeChatbot) return null;

                    const isCollapsed = collapsedSections.includes(section.id);
                    const visibleItems = section.items.filter((item) => checkModuleAccess(item.module));
                    if (visibleItems.length === 0) return null;

                    return (
                        <div key={section.id} className="mb-3">
                            {/* Section Header */}
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

                            {/* Section Items */}
                            {!isCollapsed && (
                                <ul className="space-y-0.5 mt-1">
                                    {visibleItems.map((item) => {
                                        const active = isParentActive(item);
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
                                                                active
                                                                    ? 'bg-surface-2 text-foreground'
                                                                    : 'text-muted-foreground hover:bg-surface-2 hover:text-foreground',
                                                            )}
                                                        >
                                                            <div className="flex items-center gap-2.5 min-w-0">
                                                                <item.icon
                                                                    className={cn(
                                                                        'w-4 h-4 shrink-0',
                                                                        active ? 'text-brand' : 'text-muted-foreground/70 group-hover:text-foreground',
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
                                                            active
                                                                ? 'bg-surface-2 text-foreground'
                                                                : 'text-muted-foreground hover:bg-surface-2 hover:text-foreground',
                                                        )}
                                                    >
                                                        <item.icon
                                                            className={cn(
                                                                'w-4 h-4 shrink-0',
                                                                active ? 'text-brand' : 'text-muted-foreground/70 group-hover:text-foreground',
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
                })}

                {/* Marketing Hub Link */}
                <div className="mt-2 px-1">
                    <Link href="/marketing">
                        <button className="w-full flex items-center justify-between px-2.5 py-2 bg-brand-soft hover:bg-brand-soft/80 rounded-md transition-colors group">
                            <div className="flex items-center gap-2.5">
                                <Megaphone className="w-4 h-4 text-brand-strong" />
                                <span className="text-sm font-medium text-brand-strong">Маркетинг Hub</span>
                            </div>
                            <ArrowLeftRight className="w-3.5 h-3.5 text-brand group-hover:text-brand-strong transition-colors" />
                        </button>
                    </Link>
                </div>
            </nav>

            {/* Bottom Menu */}
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

            {/* User Profile */}
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

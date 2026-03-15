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
    Plus,
    Bot,
    ChevronUp,
    UserCircle,
    Megaphone,
    ArrowLeftRight,
    ClipboardList,
    FileText,
    Eye,
    Kanban,
    TrendingUp,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { canAccessModule, canAccessModuleDynamic, getRoleDisplayName, type RolePermissions } from '@/lib/rbac';

interface MenuItem {
    name: string;
    href: string;
    icon: React.ComponentType<React.SVGAttributes<SVGSVGElement>>;
    badge?: string;
    module: string; // RBAC module slug
    children?: { name: string; href: string }[];
}

const menuItems: MenuItem[] = [
    { name: 'Хянах самбар', href: '/dashboard', icon: LayoutDashboard, module: 'dashboard' },
    {
        name: 'Үл хөдлөх',
        href: '/dashboard/properties',
        icon: Building2,
        module: 'properties',
        children: [
            { name: 'Бүх үл хөдлөх', href: '/dashboard/properties' },
            { name: 'Шинэ нэмэх', href: '/dashboard/properties/new' },
        ]
    },
    {
        name: 'Лийд',
        href: '/dashboard/leads',
        icon: Users,
        module: 'leads',
        children: [
            { name: 'Бүх лийд', href: '/dashboard/leads' },
            { name: 'Pipeline', href: '/dashboard/leads/pipeline' },
        ]
    },
    { name: 'Үзлэг', href: '/dashboard/viewings', icon: Eye, module: 'viewings' },
    { name: 'Гэрээ', href: '/dashboard/contracts', icon: FileText, module: 'contracts' },
    { name: 'Харилцагч', href: '/dashboard/customers', icon: Users, module: 'customers' },
    { name: 'Мессеж', href: '/dashboard/inbox', icon: MessageSquare, module: 'inbox' },
    {
        name: 'Аналитик',
        href: '/dashboard/reports',
        icon: BarChart3,
        module: 'reports',
        children: [
            { name: 'Тойм', href: '/dashboard/reports' },
            { name: 'Лийд шинжилгээ', href: '/dashboard/reports/leads' },
        ]
    },
    { name: 'Маркетинг ROI', href: '/dashboard/marketing-roi', icon: TrendingUp, module: 'marketing-roi' },
    { name: 'Судалгаа', href: '/dashboard/surveys', icon: ClipboardList, badge: 'Шинэ', module: 'surveys' },
    { name: 'AI Туслах', href: '/dashboard/ai-assistant', icon: Sparkles, module: 'ai-assistant' },
    { name: 'AI Тохиргоо', href: '/dashboard/ai-settings', icon: Bot, module: 'ai-settings' },
];

// VERTMON: Payment/subscription removed - full access for all users

const bottomMenuItems = [
    { name: 'Тусламж', href: '/help', icon: HelpCircle },
    { name: 'Тохиргоо', href: '/dashboard/settings', icon: Settings },
];

export function Sidebar() {
    const [expandedMenus, setExpandedMenus] = useState<string[]>(['Аналитик']);
    const pathname = usePathname();
    const { shop, user, signOut } = useAuth();
    const userRole = user?.role || 'viewer';
    const userPermissions = user?.permissions;

    // Filter menu items by role — use dynamic permissions when available, fallback to static
    const checkModuleAccess = (module: string): boolean => {
        if (userPermissions) return canAccessModuleDynamic(userPermissions, module);
        return canAccessModule(userRole, module);
    };

    const filteredMenuItems = menuItems.filter(item => checkModuleAccess(item.module));
    const filteredBottomItems = bottomMenuItems.filter(item => {
        if (item.href === '/dashboard/settings') return checkModuleAccess('settings');
        return true;
    });

    const toggleMenu = (name: string) => {
        setExpandedMenus(prev =>
            prev.includes(name)
                ? prev.filter(m => m !== name)
                : [...prev, name]
        );
    };

    const isActive = (href: string) => pathname === href;
    const isParentActive = (item: MenuItem) => {
        if (isActive(item.href)) return true;
        return item.children?.some(child => isActive(child.href)) ?? false;
    };

    return (
        <aside className="fixed left-0 top-0 h-screen w-64 bg-white border-r border-gray-200 flex flex-col z-50 hidden md:flex">
            {/* Logo */}
            <div className="flex items-center justify-between h-16 px-4 border-b border-gray-100">
                <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-lg bg-emerald-600 flex items-center justify-center">
                        <Building2 className="w-5 h-5 text-white" />
                    </div>
                    <span className="font-semibold text-lg text-gray-900">
                        Vertmon
                    </span>
                </div>
                <button className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors">
                    <svg className="w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 6h16M4 12h16M4 18h16" />
                    </svg>
                </button>
            </div>

            {/* Section Switcher */}
            <div className="px-3 py-3 border-b border-gray-100">
                <Link href="/marketing">
                    <button className="w-full flex items-center justify-between px-3 py-2.5 bg-gray-50 hover:bg-purple-50 rounded-lg transition-colors group">
                        <div className="flex items-center gap-3">
                            <Megaphone className="w-5 h-5 text-purple-600" />
                            <span className="text-sm font-medium text-gray-700 group-hover:text-purple-700">Маркетинг руу шилжих</span>
                        </div>
                        <ArrowLeftRight className="w-4 h-4 text-gray-400 group-hover:text-purple-600" />
                    </button>
                </Link>
            </div>

            {/* Main Navigation */}
            <nav className="flex-1 overflow-y-auto py-4 px-3">
                <ul className="space-y-1">
                    {filteredMenuItems.map((item) => {
                        const active = isParentActive(item);
                        const isExpanded = expandedMenus.includes(item.name);
                        const hasChildren = item.children && item.children.length > 0;

                        return (
                            <li key={item.name}>
                                {hasChildren ? (
                                    <>
                                        <button
                                            onClick={() => toggleMenu(item.name)}
                                            className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg transition-all duration-200 group ${active
                                                ? 'bg-emerald-50 text-emerald-700'
                                                : 'text-gray-600 hover:bg-gray-50'
                                                }`}
                                        >
                                            <div className="flex items-center gap-3">
                                                <item.icon className={`w-5 h-5 ${active ? 'text-emerald-600' : 'text-gray-400 group-hover:text-gray-600'}`} />
                                                <span className="font-medium text-sm">{item.name}</span>
                                                {item.badge && (
                                                    <span className="px-1.5 py-0.5 bg-emerald-600 text-white text-[10px] font-bold rounded">
                                                        {item.badge}
                                                    </span>
                                                )}
                                            </div>
                                            {isExpanded ? (
                                                <ChevronUp className="w-4 h-4 text-gray-400" />
                                            ) : (
                                                <ChevronDown className="w-4 h-4 text-gray-400" />
                                            )}
                                        </button>
                                        {isExpanded && (
                                            <ul className="mt-1 ml-4 pl-4 border-l border-gray-200 space-y-1">
                                                {item.children?.map((child) => (
                                                    <li key={child.name}>
                                                        <Link
                                                            href={child.href}
                                                            className={`block px-3 py-2 rounded-lg text-sm transition-colors ${isActive(child.href)
                                                                ? 'text-emerald-700 bg-emerald-50 font-medium'
                                                                : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
                                                                }`}
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
                                        className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200 group ${active
                                            ? 'bg-emerald-50 text-emerald-700'
                                            : 'text-gray-600 hover:bg-gray-50'
                                            }`}
                                    >
                                        <item.icon className={`w-5 h-5 ${active ? 'text-emerald-600' : 'text-gray-400 group-hover:text-gray-600'}`} />
                                        <span className="font-medium text-sm">{item.name}</span>
                                        {item.badge && (
                                            <span className="px-1.5 py-0.5 bg-emerald-600 text-white text-[10px] font-bold rounded">
                                                {item.badge}
                                            </span>
                                        )}
                                    </Link>
                                )}
                            </li>
                        );
                    })}
                </ul>

                {/* VERTMON: Operations section removed - full access mode */}
            </nav>

            {/* Add Property Button — only for roles with properties access */}
            {checkModuleAccess('properties') && (
                <div className="px-3 pb-3">
                    <Link href="/dashboard/properties/new">
                        <button className="w-full flex items-center justify-center gap-2 py-2.5 bg-emerald-600 text-white font-medium rounded-lg hover:bg-emerald-700 transition-colors text-sm">
                            Шинэ үл хөдлөх нэмэх
                        </button>
                    </Link>
                </div>
            )}

            {/* Bottom Menu */}
            <div className="px-3 py-3 border-t border-gray-100">
                <ul className="space-y-1">
                    {filteredBottomItems.map((item) => (
                        <li key={item.name}>
                            <Link
                                href={item.href}
                                className={`flex items-center gap-3 px-3 py-2 rounded-lg transition-colors ${isActive(item.href)
                                    ? 'text-emerald-700 bg-emerald-50'
                                    : 'text-gray-500 hover:bg-gray-50 hover:text-gray-700'
                                    }`}
                            >
                                <item.icon className="w-5 h-5" />
                                <span className="text-sm">{item.name}</span>
                            </Link>
                        </li>
                    ))}
                    <li>
                        <button
                            onClick={() => signOut()}
                            className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-gray-500 hover:bg-gray-50 hover:text-gray-700 transition-colors"
                        >
                            <LogOut className="w-5 h-5" />
                            <span className="text-sm">Гарах</span>
                        </button>
                    </li>
                </ul>
            </div>

            {/* User Profile */}
            <div className="px-3 pb-4 border-t border-gray-100 pt-3">
                <button className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-gray-50 transition-colors">
                    <div className="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center">
                        <UserCircle className="w-5 h-5 text-emerald-600" />
                    </div>
                    <div className="flex-1 text-left">
                        <p className="text-sm font-medium text-gray-900">{shop?.name || 'Агент'}</p>
                        <p className="text-xs text-gray-400">{getRoleDisplayName(userRole)}</p>
                    </div>
                    <ChevronDown className="w-4 h-4 text-gray-400" />
                </button>
            </div>
        </aside>
    );
}

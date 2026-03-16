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
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { canAccessModule, canAccessModuleDynamic, getRoleDisplayName } from '@/lib/rbac';

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
    color: string; // tailwind color prefix
    icon: React.ComponentType<React.SVGAttributes<SVGSVGElement>>;
    items: MenuItem[];
    roleRestricted?: boolean; // only super_admin + marketing_manager
}

const sections: MenuSection[] = [
    {
        id: 'sales',
        title: 'SALES',
        color: 'emerald',
        icon: Building2,
        items: [
            { name: 'Хянах самбар', href: '/dashboard', icon: LayoutDashboard, module: 'dashboard' },
            {
                name: 'Үл хөдлөх', href: '/dashboard/properties', icon: Building2, module: 'properties',
                children: [
                    { name: 'Бүх үл хөдлөх', href: '/dashboard/properties' },
                    { name: 'Шинэ нэмэх', href: '/dashboard/properties/new' },
                ]
            },
            {
                name: 'Лийд', href: '/dashboard/leads', icon: Users, module: 'leads',
                children: [
                    { name: 'Бүх лийд', href: '/dashboard/leads' },
                    { name: 'Pipeline', href: '/dashboard/leads/pipeline' },
                ]
            },
            { name: 'Үзлэг', href: '/dashboard/viewings', icon: Eye, module: 'viewings' },
            { name: 'Гэрээ', href: '/dashboard/contracts', icon: FileText, module: 'contracts' },
            { name: 'Харилцагч', href: '/dashboard/customers', icon: Users, module: 'customers' },
        ],
    },
    {
        id: 'marketing',
        title: 'MARKETING',
        color: 'purple',
        icon: Megaphone,
        items: [
            { name: 'Маркетинг ROI', href: '/dashboard/marketing-roi', icon: TrendingUp, module: 'marketing-roi' },
            {
                name: 'Аналитик', href: '/dashboard/reports', icon: BarChart3, module: 'reports',
                children: [
                    { name: 'Тойм', href: '/dashboard/reports' },
                    { name: 'Лийд шинжилгээ', href: '/dashboard/reports/leads' },
                ]
            },
            { name: 'Судалгаа', href: '/dashboard/surveys', icon: ClipboardList, badge: 'Шинэ', module: 'surveys' },
        ],
    },
    {
        id: 'ai',
        title: 'AI-ASSISTANT',
        color: 'indigo',
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
        color: 'sky',
        icon: Bot,
        roleRestricted: true, // super_admin + marketing_manager only
        items: [
            { name: 'Мессеж', href: '/dashboard/inbox', icon: MessageSquare, module: 'inbox' },
            { name: 'AI Тохиргоо', href: '/dashboard/ai-settings', icon: Bot, module: 'ai-settings' },
            { name: 'Social холбох', href: '/dashboard/settings', icon: Share2, module: 'settings' },
        ],
    },
];

const colorMap: Record<string, { bg: string; text: string; activeBg: string; activeText: string; sectionText: string; dot: string }> = {
    emerald: { bg: 'hover:bg-emerald-50', text: 'text-emerald-600', activeBg: 'bg-emerald-50', activeText: 'text-emerald-700', sectionText: 'text-emerald-600', dot: 'bg-emerald-500' },
    purple: { bg: 'hover:bg-purple-50', text: 'text-purple-600', activeBg: 'bg-purple-50', activeText: 'text-purple-700', sectionText: 'text-purple-600', dot: 'bg-purple-500' },
    indigo: { bg: 'hover:bg-indigo-50', text: 'text-indigo-600', activeBg: 'bg-indigo-50', activeText: 'text-indigo-700', sectionText: 'text-indigo-600', dot: 'bg-indigo-500' },
    sky: { bg: 'hover:bg-sky-50', text: 'text-sky-600', activeBg: 'bg-sky-50', activeText: 'text-sky-700', sectionText: 'text-sky-600', dot: 'bg-sky-500' },
};

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
        setCollapsedSections(prev =>
            prev.includes(id) ? prev.filter(s => s !== id) : [...prev, id]
        );
    };

    const toggleMenu = (name: string) => {
        setExpandedMenus(prev =>
            prev.includes(name) ? prev.filter(m => m !== name) : [...prev, name]
        );
    };

    const isActive = (href: string) => pathname === href;
    const isParentActive = (item: MenuItem) => {
        if (isActive(item.href)) return true;
        return item.children?.some(child => isActive(child.href)) ?? false;
    };

    const filteredBottomItems = bottomMenuItems.filter(item => {
        if (item.href === '/dashboard/settings') return checkModuleAccess('settings');
        return true;
    });

    return (
        <aside className="fixed left-0 top-0 h-screen w-64 bg-white border-r border-gray-200 flex flex-col z-50 hidden md:flex">
            {/* Logo */}
            <div className="flex items-center justify-between h-14 px-4 border-b border-gray-100">
                <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-lg bg-emerald-600 flex items-center justify-center">
                        <Building2 className="w-4 h-4 text-white" />
                    </div>
                    <span className="font-semibold text-gray-900">Vertmon</span>
                </div>
            </div>

            {/* Main Navigation — Sectioned */}
            <nav className="flex-1 overflow-y-auto py-2 px-2.5">
                {sections.map((section) => {
                    // Role restriction for chatbot
                    if (section.roleRestricted && !canSeeChatbot) return null;

                    const colors = colorMap[section.color] || colorMap.emerald;
                    const isCollapsed = collapsedSections.includes(section.id);
                    const visibleItems = section.items.filter(item => checkModuleAccess(item.module));
                    if (visibleItems.length === 0) return null;

                    return (
                        <div key={section.id} className="mb-1">
                            {/* Section Header */}
                            <button
                                onClick={() => toggleSection(section.id)}
                                className="w-full flex items-center justify-between px-2.5 py-2 group"
                            >
                                <div className="flex items-center gap-2">
                                    <div className={`w-1.5 h-1.5 rounded-full ${colors.dot}`} />
                                    <span className={`text-[11px] font-bold tracking-wider ${colors.sectionText}`}>
                                        {section.title}
                                    </span>
                                </div>
                                <ChevronRight className={`w-3 h-3 text-gray-400 transition-transform duration-200 ${!isCollapsed ? 'rotate-90' : ''}`} />
                            </button>

                            {/* Section Items */}
                            {!isCollapsed && (
                                <ul className="space-y-0.5 mb-2">
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
                                                            className={`w-full flex items-center justify-between px-2.5 py-2 rounded-lg transition-all text-sm group ${
                                                                active ? `${colors.activeBg} ${colors.activeText}` : `text-gray-600 ${colors.bg}`
                                                            }`}
                                                        >
                                                            <div className="flex items-center gap-2.5">
                                                                <item.icon className={`w-4 h-4 ${active ? colors.text : 'text-gray-400 group-hover:text-gray-500'}`} />
                                                                <span className="font-medium">{item.name}</span>
                                                                {item.badge && (
                                                                    <span className={`px-1.5 py-0.5 ${colors.dot} text-white text-[9px] font-bold rounded`}>
                                                                        {item.badge}
                                                                    </span>
                                                                )}
                                                            </div>
                                                            {isExpanded ? (
                                                                <ChevronUp className="w-3.5 h-3.5 text-gray-400" />
                                                            ) : (
                                                                <ChevronDown className="w-3.5 h-3.5 text-gray-400" />
                                                            )}
                                                        </button>
                                                        {isExpanded && (
                                                            <ul className="mt-0.5 ml-4 pl-3 border-l-2 border-gray-100 space-y-0.5">
                                                                {item.children?.map((child) => (
                                                                    <li key={child.name}>
                                                                        <Link
                                                                            href={child.href}
                                                                            className={`block px-2.5 py-1.5 rounded-md text-sm transition-colors ${
                                                                                isActive(child.href)
                                                                                    ? `${colors.activeText} ${colors.activeBg} font-medium`
                                                                                    : `text-gray-500 hover:text-gray-700 ${colors.bg}`
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
                                                        className={`flex items-center gap-2.5 px-2.5 py-2 rounded-lg transition-all text-sm group ${
                                                            active ? `${colors.activeBg} ${colors.activeText}` : `text-gray-600 ${colors.bg}`
                                                        }`}
                                                    >
                                                        <item.icon className={`w-4 h-4 ${active ? colors.text : 'text-gray-400 group-hover:text-gray-500'}`} />
                                                        <span className="font-medium">{item.name}</span>
                                                        {item.badge && (
                                                            <span className={`px-1.5 py-0.5 ${colors.dot} text-white text-[9px] font-bold rounded`}>
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
                <div className="mt-1 px-1">
                    <Link href="/marketing">
                        <button className="w-full flex items-center justify-between px-2.5 py-2 bg-purple-50 hover:bg-purple-100 rounded-lg transition-colors group">
                            <div className="flex items-center gap-2.5">
                                <Megaphone className="w-4 h-4 text-purple-600" />
                                <span className="text-sm font-medium text-purple-700">Маркетинг Hub</span>
                            </div>
                            <ArrowLeftRight className="w-3.5 h-3.5 text-purple-400 group-hover:text-purple-600" />
                        </button>
                    </Link>
                </div>
            </nav>

            {/* Bottom Menu */}
            <div className="px-2.5 py-2 border-t border-gray-100">
                <ul className="space-y-0.5">
                    {filteredBottomItems.map((item) => (
                        <li key={item.name}>
                            <Link
                                href={item.href}
                                className={`flex items-center gap-2.5 px-2.5 py-2 rounded-lg transition-colors text-sm ${
                                    isActive(item.href) ? 'text-emerald-700 bg-emerald-50' : 'text-gray-500 hover:bg-gray-50 hover:text-gray-700'
                                }`}
                            >
                                <item.icon className="w-4 h-4" />
                                <span>{item.name}</span>
                            </Link>
                        </li>
                    ))}
                    <li>
                        <button
                            onClick={() => signOut()}
                            className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-gray-500 hover:bg-gray-50 hover:text-gray-700 transition-colors text-sm"
                        >
                            <LogOut className="w-4 h-4" />
                            <span>Гарах</span>
                        </button>
                    </li>
                </ul>
            </div>

            {/* User Profile */}
            <div className="px-2.5 pb-3 border-t border-gray-100 pt-2">
                <button className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg hover:bg-gray-50 transition-colors">
                    <div className="w-7 h-7 rounded-full bg-emerald-100 flex items-center justify-center">
                        <UserCircle className="w-4 h-4 text-emerald-600" />
                    </div>
                    <div className="flex-1 text-left">
                        <p className="text-sm font-medium text-gray-900 truncate">{shop?.name || 'Агент'}</p>
                        <p className="text-[11px] text-gray-400">{getRoleDisplayName(userRole)}</p>
                    </div>
                    <ChevronDown className="w-3.5 h-3.5 text-gray-400" />
                </button>
            </div>
        </aside>
    );
}

/**
 * Ажлын талбар (workspace) тохиргоо — нэгдсэн shell-ийн ганц эх сурвалж.
 *
 * Гурван workspace: Борлуулалт (sales), AI Туслах (ai, гол), Маркетинг (marketing).
 * Header дэх switcher, sidebar-ийн цэс, гарчиг бүгд эндээс уншина.
 *
 * Энэ файл нь зөвхөн дата — 'use client' хэрэггүй тул server/client хаанаас ч import хийж болно.
 */
import type { ComponentType, SVGAttributes } from 'react';
import {
    LayoutDashboard,
    Building2,
    Users,
    Eye,
    FileText,
    Headphones,
    Wallet,
    TrendingUp,
    BarChart3,
    Sparkles,
    Bot,
    MessageSquare,
    Megaphone,
    ClipboardList,
    Calendar,
    Globe,
    Share2,
    Mail,
    Target,
    Award,
    HelpCircle,
    Settings,
} from 'lucide-react';

type IconType = ComponentType<SVGAttributes<SVGSVGElement>>;

export type WorkspaceId = 'sales' | 'ai' | 'marketing';

export interface NavChild {
    name: string;
    href: string;
}

export interface NavItem {
    name: string;
    href: string;
    icon: IconType;
    badge?: string;
    /** RBAC модуль (ALL_MODULES-аас). '' = эрхээр хязгаарлахгүй (зөвхөн route түвшинд). */
    module: string;
    children?: NavChild[];
}

export interface NavSection {
    id: string;
    title: string;
    icon: IconType;
    items: NavItem[];
}

export interface Workspace {
    id: WorkspaceId;
    /** Switcher болон sidebar дээрх бүтэн нэр. */
    label: string;
    /** Гар утсан дээрх богино нэр. */
    shortLabel: string;
    icon: IconType;
    /** Switcher дээр дарахад очих үндсэн хуудас. */
    home: string;
    /** Голлох (terracotta hero) талбар эсэх — зөвхөн AI. */
    emphasis?: boolean;
    /** Эдгээр модулийн АЛЬ НЭГ нь нээлттэй бол workspace нээлттэй. [] = үргэлж нээлттэй. */
    accessModules: string[];
    /** Энэ workspace-д хамаарах route prefix-үүд (longest-match ялна). */
    match: string[];
    sections: NavSection[];
    /** Гар утасны доод таб дахь үндсэн 3 цэс. */
    mobilePrimary: NavItem[];
}

export const WORKSPACES: Workspace[] = [
    {
        id: 'sales',
        label: 'Борлуулалт',
        shortLabel: 'Борлуулалт',
        icon: Building2,
        home: '/dashboard',
        accessModules: [
            'dashboard',
            'properties',
            'leads',
            'viewings',
            'contracts',
            'customers',
            'customer-service',
            'finance',
            'procurement',
            'reports',
        ],
        match: ['/dashboard'],
        mobilePrimary: [
            { name: 'Нүүр', href: '/dashboard', icon: LayoutDashboard, module: 'dashboard' },
            { name: 'Үл хөдлөх', href: '/dashboard/properties', icon: Building2, module: 'properties' },
            { name: 'Лийд', href: '/dashboard/leads', icon: Users, module: 'leads' },
        ],
        sections: [
            {
                id: 'sales',
                title: 'БОРЛУУЛАЛТ',
                icon: Building2,
                items: [
                    { name: 'Хянах самбар', href: '/dashboard', icon: LayoutDashboard, module: 'dashboard' },
                    {
                        name: 'Үл хөдлөх', href: '/dashboard/properties', icon: Building2, module: 'properties',
                        children: [
                            { name: 'Бүх үл хөдлөх', href: '/dashboard/properties' },
                            { name: 'Блок харагдац', href: '/dashboard/properties/blocks' },
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
                    { name: 'Үйлчилгээ', href: '/dashboard/customer-service', icon: Headphones, badge: 'Шинэ', module: 'customer-service' },
                ],
            },
            {
                id: 'finance',
                title: 'САНХҮҮ / ERP',
                icon: Wallet,
                items: [
                    { name: 'Санхүү', href: '/dashboard/finance', icon: Wallet, badge: 'Шинэ', module: 'finance' },
                    { name: 'Төслийн санхүү', href: '/dashboard/finance/projects', icon: TrendingUp, module: 'finance' },
                    { name: 'Санхүүгийн тайлан', href: '/dashboard/finance/reports', icon: BarChart3, module: 'finance' },
                    { name: 'Худалдан авалт', href: '/dashboard/procurement', icon: Building2, module: 'procurement' },
                ],
            },
            {
                id: 'analytics',
                title: 'АНАЛИТИК',
                icon: BarChart3,
                items: [
                    {
                        name: 'Аналитик', href: '/dashboard/reports', icon: BarChart3, module: 'reports',
                        children: [
                            { name: 'Тойм', href: '/dashboard/reports' },
                            { name: 'Лийд шинжилгээ', href: '/dashboard/reports/leads' },
                            { name: 'Үл хөдлөх шинжилгээ', href: '/dashboard/reports/properties' },
                            { name: 'Менежерийн гүйцэтгэл', href: '/dashboard/reports/manager-performance' },
                            { name: 'Уулзалтын аналитик', href: '/dashboard/reports/meetings' },
                        ],
                    },
                ],
            },
        ],
    },
    {
        id: 'ai',
        label: 'AI Туслах',
        shortLabel: 'AI',
        icon: Sparkles,
        home: '/dashboard/ai-assistant',
        emphasis: true,
        accessModules: ['ai-assistant', 'inbox', 'ai-settings'],
        match: ['/dashboard/ai-assistant', '/dashboard/inbox', '/dashboard/ai-settings'],
        mobilePrimary: [
            { name: 'AI Туслах', href: '/dashboard/ai-assistant', icon: Sparkles, module: 'ai-assistant' },
            { name: 'Агентууд', href: '/dashboard/ai-assistant/agents', icon: Bot, module: 'ai-assistant' },
            { name: 'Мессеж', href: '/dashboard/inbox', icon: MessageSquare, module: 'inbox' },
        ],
        sections: [
            {
                id: 'ai',
                title: 'AI ТУСЛАХ',
                icon: Sparkles,
                items: [
                    { name: 'AI Дата Туслах', href: '/dashboard/ai-assistant', icon: Sparkles, module: 'ai-assistant' },
                    { name: 'AI Агентууд', href: '/dashboard/ai-assistant/agents', icon: Bot, module: 'ai-assistant' },
                ],
            },
            {
                id: 'chatbot',
                title: 'ЧАТБОТ',
                icon: Bot,
                items: [
                    { name: 'Мессеж', href: '/dashboard/inbox', icon: MessageSquare, module: 'inbox' },
                    { name: 'AI Тохиргоо', href: '/dashboard/ai-settings', icon: Bot, module: 'ai-settings' },
                ],
            },
        ],
    },
    {
        id: 'marketing',
        label: 'Маркетинг',
        shortLabel: 'Маркетинг',
        icon: Megaphone,
        home: '/marketing',
        // Одоогийн /marketing/* shell-д RBAC байхгүй тул үргэлж нээлттэй.
        accessModules: [],
        match: ['/marketing', '/dashboard/marketing-roi', '/dashboard/surveys', '/dashboard/competitor-research'],
        mobilePrimary: [
            { name: 'Самбар', href: '/marketing', icon: LayoutDashboard, module: '' },
            { name: 'Кампейн', href: '/marketing/campaigns', icon: Megaphone, module: '' },
            { name: 'Социал', href: '/marketing/social', icon: Share2, module: '' },
        ],
        sections: [
            {
                id: 'mktg-overview',
                title: 'МАРКЕТИНГ',
                icon: Megaphone,
                items: [
                    { name: 'Хянах самбар', href: '/marketing', icon: LayoutDashboard, module: '' },
                    { name: 'Маркетинг ROI', href: '/dashboard/marketing-roi', icon: TrendingUp, module: 'marketing-roi' },
                    { name: 'Өрсөлдөгч судалгаа', href: '/dashboard/competitor-research', icon: Building2, badge: 'Шинэ', module: 'marketing-roi' },
                    { name: 'Судалгаа', href: '/dashboard/surveys', icon: ClipboardList, badge: 'Шинэ', module: 'surveys' },
                ],
            },
            {
                id: 'mktg-channels',
                title: 'СУВГУУД',
                icon: Share2,
                items: [
                    { name: 'Кампейнүүд', href: '/marketing/campaigns', icon: Megaphone, module: '' },
                    { name: 'Зар сурталчилгаа', href: '/marketing/ads', icon: BarChart3, module: '' },
                    { name: 'Контент календарь', href: '/marketing/calendar', icon: Calendar, module: '' },
                    { name: 'Вэб аналитик', href: '/marketing/analytics', icon: Globe, module: '' },
                    { name: 'Социал медиа', href: '/marketing/social', icon: Share2, module: '' },
                    { name: 'Email & SMS', href: '/marketing/messaging', icon: Mail, module: '' },
                    { name: 'Lead эх үүсвэр', href: '/marketing/sources', icon: Target, module: '' },
                    { name: 'Брэнд мэдрэмж', href: '/marketing/brand', icon: Award, module: '' },
                ],
            },
        ],
    },
];

/** Sidebar-ийн доод хэсэгт workspace бүрт нийтлэг гарах цэс. */
export const BOTTOM_ITEMS: NavItem[] = [
    { name: 'Тусламж', href: '/help', icon: HelpCircle, module: '' },
    { name: 'Тохиргоо', href: '/dashboard/settings', icon: Settings, module: 'settings' },
];

/** Switcher дэх дараалал: зүүн, төв (hero), баруун. */
export const WORKSPACE_ORDER: WorkspaceId[] = ['sales', 'ai', 'marketing'];

/** Route-аас идэвхтэй workspace-ийг олох (longest-prefix match). */
export function getWorkspaceForPath(pathname: string): Workspace {
    let best: Workspace = WORKSPACES[0];
    let bestLen = -1;
    for (const ws of WORKSPACES) {
        for (const prefix of ws.match) {
            if (pathname === prefix || pathname.startsWith(prefix + '/')) {
                if (prefix.length > bestLen) {
                    best = ws;
                    bestLen = prefix.length;
                }
            }
        }
    }
    return best;
}

/**
 * Route-д тохирох хамгийн гүн цэсний нэрийг буцаана (header гарчигт).
 * Header-ийн хуучин path.includes(...) гинжийг орлоно.
 */
export function getNavTitle(pathname: string): string {
    let best = '';
    let bestLen = -1;
    const consider = (href: string, name: string) => {
        if ((pathname === href || pathname.startsWith(href + '/')) && href.length > bestLen) {
            best = name;
            bestLen = href.length;
        }
    };
    for (const ws of WORKSPACES) {
        for (const section of ws.sections) {
            for (const item of section.items) {
                consider(item.href, item.name);
                item.children?.forEach((c) => consider(c.href, c.name));
            }
        }
    }
    for (const b of BOTTOM_ITEMS) consider(b.href, b.name);
    return best || 'Хянах самбар';
}

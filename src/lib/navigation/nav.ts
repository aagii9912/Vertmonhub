/**
 * Vertmon Hub — навигацийн ганц эх сурвалж (v2, 2026-09).
 *
 * v1-д гурван workspace (Борлуулалт / AI / Маркетинг), 30 цэсний зүйл байсан
 * бөгөөд switcher нь sidebar-ыг бүхэлд нь солиход хэрэглэгч төөрдөг байв.
 * v2 нь НЭГ sidebar, 8 үндсэн цэстэй. Өдөр бүрийн ажил дээрээс доош эрэмбэлэв.
 *
 * Ховор хэрэглэгддэг хуудсууд цэснээс хасагдсан ч УСТААГҮЙ — ⌘K хайлт,
 * Тохиргоо, эсвэл шууд URL-аар нээгдэнэ (SECONDARY_ROUTES).
 *
 * Энэ файл нь зөвхөн дата — 'use client' хэрэггүй.
 */
import type { ComponentType, SVGAttributes } from 'react';
import {
    CalendarCheck,
    Users,
    CalendarDays,
    FileText,
    Building2,
    Inbox,
    BarChart3,
    Megaphone,
    Sparkles,
    Settings,
    ListChecks,
    GitBranch,
    Wallet,
    ShoppingCart,
    LayoutGrid,
    ClipboardList,
    Search,
    Headphones,
    Target,
    Award,
    Calendar,
    Share2,
    Mail,
    Globe,
    Palette,
    Bot,
    HelpCircle,
} from 'lucide-react';

type IconType = ComponentType<SVGAttributes<SVGSVGElement>>;

export interface NavItem {
    name: string;
    href: string;
    icon: IconType;
    /** RBAC модуль (ALL_MODULES-аас). '' = эрхээр хязгаарлахгүй. */
    module: string;
    /** Sidebar-ийн баруун талд гарах тоо (жишээ: шинэ лид, уншаагүй мессеж). */
    countKey?: CountKey;
    /** Хуудасны дотоод таб — sidebar-т ХАРАГДАХГҮЙ, зөвхөн идэвхтэй төлөв ба breadcrumb-д. */
    children?: NavChild[];
}

export interface NavChild {
    name: string;
    href: string;
}

/** Sidebar дээр амьд тоо харуулах түлхүүрүүд (useNavCounts-аас ирнэ). */
export type CountKey = 'leads' | 'inbox' | 'meetings';

/* ------------------------------------------------------------------ */
/* Үндсэн цэс — 8 зүйл. Дараалал нь өдрийн ажлын урсгалыг дагана.      */
/* ------------------------------------------------------------------ */

export const PRIMARY_NAV: NavItem[] = [
    {
        name: 'Өнөөдөр',
        href: '/dashboard',
        icon: CalendarCheck,
        module: 'dashboard',
    },
    {
        name: 'Лид',
        href: '/dashboard/leads',
        icon: Users,
        module: 'leads',
        countKey: 'leads',
        children: [
            { name: 'Жагсаалт', href: '/dashboard/leads' },
            { name: 'Pipeline', href: '/dashboard/leads/pipeline' },
            { name: 'Шинэ лид', href: '/dashboard/leads/new' },
        ],
    },
    {
        name: 'Уулзалт',
        href: '/dashboard/viewings',
        icon: CalendarDays,
        module: 'viewings',
        countKey: 'meetings',
    },
    {
        name: 'Гэрээ',
        href: '/dashboard/contracts',
        icon: FileText,
        module: 'contracts',
        children: [
            { name: 'Жагсаалт', href: '/dashboard/contracts' },
            { name: 'Гэрээ үүсгэх', href: '/dashboard/contracts/generate' },
        ],
    },
    {
        name: 'Байр',
        href: '/dashboard/properties',
        icon: Building2,
        module: 'properties',
        children: [
            { name: 'Жагсаалт', href: '/dashboard/properties' },
            { name: 'Блокууд', href: '/dashboard/properties/blocks' },
            { name: 'Шинэ байр', href: '/dashboard/properties/new' },
        ],
    },
    {
        name: 'Inbox',
        href: '/dashboard/inbox',
        icon: Inbox,
        module: 'inbox',
        countKey: 'inbox',
        children: [
            { name: 'Яриа', href: '/dashboard/inbox' },
            { name: 'Мессеж', href: '/dashboard/inbox/messages' },
        ],
    },
    {
        name: 'Тайлан',
        href: '/dashboard/reports',
        icon: BarChart3,
        module: 'reports',
        children: [
            { name: 'Сарын KPI', href: '/dashboard/reports/kpi' },
            { name: 'Менежерийн гүйцэтгэл', href: '/dashboard/reports/manager-performance' },
            { name: 'Лид', href: '/dashboard/reports/leads' },
            { name: 'Байр', href: '/dashboard/reports/properties' },
            { name: 'Уулзалт', href: '/dashboard/reports/meetings' },
        ],
    },
    {
        name: 'Маркетинг',
        href: '/marketing',
        icon: Megaphone,
        module: 'marketing-roi',
        children: [
            { name: 'Тойм', href: '/marketing' },
            { name: 'Төсөв', href: '/marketing/budget' },
            { name: 'ROI', href: '/dashboard/marketing-roi' },
            { name: 'Сувгууд', href: '/marketing/sources' },
            { name: 'Кампанит ажил', href: '/marketing/campaigns' },
        ],
    },
];

/** Sidebar-ийн доод хэсэг — цэснээс тусад нь. */
export const BOTTOM_NAV: NavItem[] = [
    { name: 'AI туслах', href: '/dashboard/ai-assistant', icon: Sparkles, module: 'ai-assistant' },
    { name: 'Тохиргоо', href: '/dashboard/settings', icon: Settings, module: 'settings' },
];

/* ------------------------------------------------------------------ */
/* Хоёрдогч замууд — цэсэнд БАЙХГҮЙ ч ⌘K хайлт, Тохиргооноос нээгдэнэ. */
/* ------------------------------------------------------------------ */

export interface SecondaryRoute {
    name: string;
    href: string;
    icon: IconType;
    module: string;
    /** ⌘K доторх бүлэг. */
    group: 'Ажил' | 'Санхүү' | 'Судалгаа' | 'Маркетинг' | 'AI' | 'Систем';
    /** Хайлтад нэмэлт түлхүүр үг. */
    keywords?: string[];
}

export const SECONDARY_ROUTES: SecondaryRoute[] = [
    { name: 'Миний ажлууд', href: '/dashboard/tasks', icon: ListChecks, module: 'dashboard', group: 'Ажил', keywords: ['task', 'todo', 'сануулга'] },
    { name: 'Лидийн pipeline', href: '/dashboard/leads/pipeline', icon: GitBranch, module: 'leads', group: 'Ажил', keywords: ['kanban', 'шат'] },
    { name: 'Харилцагч', href: '/dashboard/customers', icon: Users, module: 'customers', group: 'Ажил', keywords: ['customer', 'crm'] },
    { name: 'Санал гомдол', href: '/dashboard/customer-service', icon: Headphones, module: 'customer-service', group: 'Ажил' },

    { name: 'Санхүү', href: '/dashboard/finance', icon: Wallet, module: 'finance', group: 'Санхүү', keywords: ['erp', 'мөнгө'] },
    { name: 'Санхүүгийн төслүүд', href: '/dashboard/finance/projects', icon: LayoutGrid, module: 'finance', group: 'Санхүү' },
    { name: 'Санхүүгийн тайлан', href: '/dashboard/finance/reports', icon: BarChart3, module: 'finance', group: 'Санхүү' },
    { name: 'Худалдан авалт', href: '/dashboard/procurement', icon: ShoppingCart, module: 'procurement', group: 'Санхүү' },

    { name: 'Судалгаа', href: '/dashboard/surveys', icon: ClipboardList, module: 'surveys', group: 'Судалгаа' },
    { name: 'Өрсөлдөгчийн судалгаа', href: '/dashboard/competitor-research', icon: Search, module: 'reports', group: 'Судалгаа' },

    { name: 'Сурталчилгаа', href: '/marketing/ads', icon: Target, module: 'marketing-roi', group: 'Маркетинг' },
    { name: 'Маркетингийн аналитик', href: '/marketing/analytics', icon: Award, module: 'marketing-roi', group: 'Маркетинг' },
    { name: 'Контентийн календарь', href: '/marketing/calendar', icon: Calendar, module: 'marketing-roi', group: 'Маркетинг' },
    { name: 'Сошиал', href: '/marketing/social', icon: Share2, module: 'marketing-roi', group: 'Маркетинг' },
    { name: 'Мессеж', href: '/marketing/messaging', icon: Mail, module: 'marketing-roi', group: 'Маркетинг' },
    { name: 'Брэнд', href: '/marketing/brand', icon: Palette, module: 'marketing-roi', group: 'Маркетинг' },
    { name: 'Вэб', href: '/marketing/analytics', icon: Globe, module: 'marketing-roi', group: 'Маркетинг' },

    { name: 'AI агентууд', href: '/dashboard/ai-assistant/agents', icon: Bot, module: 'ai-assistant', group: 'AI' },
    { name: 'AI тохиргоо', href: '/dashboard/ai-settings', icon: Settings, module: 'ai-settings', group: 'AI' },

    { name: 'Тусламж', href: '/help', icon: HelpCircle, module: '', group: 'Систем' },
];

/* ------------------------------------------------------------------ */
/* Гар утасны доод таб — 4 цэс + голд «+» түргэн үйлдэл.               */
/* ------------------------------------------------------------------ */

export const MOBILE_TABS: NavItem[] = [
    PRIMARY_NAV[0], // Өнөөдөр
    PRIMARY_NAV[1], // Лид
    PRIMARY_NAV[2], // Уулзалт
];

/* ------------------------------------------------------------------ */
/* Туслах функцууд                                                     */
/* ------------------------------------------------------------------ */

const ALL_ITEMS: NavItem[] = [...PRIMARY_NAV, ...BOTTOM_NAV];

/**
 * Тухайн зам энэ цэсэнд харьяалагдах эсэх.
 * `/dashboard` нь зөвхөн ЯГ таарвал идэвхтэй (бусад бүх зам түүгээр эхэлдэг).
 */
export function isNavItemActive(item: NavItem, pathname: string): boolean {
    if (item.href === '/dashboard') return pathname === '/dashboard';
    if (pathname === item.href) return true;
    if (pathname.startsWith(item.href + '/')) return true;
    return (item.children ?? []).some(
        (c) => pathname === c.href || pathname.startsWith(c.href + '/'),
    );
}

/** Хамгийн тодорхой (урт href) таарсан цэсийг буцаана. */
export function findNavItem(pathname: string): NavItem | undefined {
    const matches = ALL_ITEMS.filter((i) => isNavItemActive(i, pathname));
    if (!matches.length) return undefined;
    return matches.reduce((a, b) => (b.href.length > a.href.length ? b : a));
}

export interface Crumb {
    name: string;
    href?: string;
}

/**
 * Хамгийн ихдээ 3 шат: [Хэсэг] › [Дэд хуудас] › [Бичлэг].
 * Ганц түвшний хуудсанд хоосон массив буцаана — Header зөвхөн гарчгийг харуулна.
 */
export function getBreadcrumb(pathname: string): Crumb[] {
    const item = findNavItem(pathname);
    if (!item) {
        // Хоёрдогч замуудаас хамгийн урт (тодорхой) таарсныг авна:
        // /dashboard/finance/projects → «Санхүүгийн төслүүд», «Санхүү» биш.
        const secondary = SECONDARY_ROUTES
            .filter((r) => pathname === r.href || pathname.startsWith(r.href + '/'))
            .reduce<SecondaryRoute | undefined>((a, b) => (!a || b.href.length > a.href.length ? b : a), undefined);
        return secondary ? [{ name: secondary.name, href: secondary.href }] : [];
    }

    const crumbs: Crumb[] = [{ name: item.name, href: item.href }];
    if (pathname === item.href) return crumbs;

    const child = (item.children ?? [])
        .filter((c) => c.href !== item.href)
        .filter((c) => pathname === c.href || pathname.startsWith(c.href + '/'))
        .reduce<NavChild | undefined>((a, b) => (!a || b.href.length > a.href.length ? b : a), undefined);

    if (child) {
        crumbs.push({ name: child.name, href: child.href });
        if (pathname !== child.href) crumbs.push({ name: 'Дэлгэрэнгүй' });
        return crumbs;
    }

    // Динамик бичлэг: /dashboard/properties/<id>
    crumbs.push({ name: 'Дэлгэрэнгүй' });
    return crumbs;
}

/** Хуудасны гарчиг — Header болон <title>-д. */
export function getNavTitle(pathname: string): string {
    const crumbs = getBreadcrumb(pathname);
    if (crumbs.length) return crumbs[crumbs.length - 1].name;
    return 'Vertmon Hub';
}

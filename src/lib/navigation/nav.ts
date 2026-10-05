/**
 * Vertmon Hub — навигацийн ганц эх сурвалж (v3, 2026-10).
 *
 * Sidebar, ⌘K, замын мөр (breadcrumb), <title>, шууд URL-ийн эрхийн шалгалт бүгд
 * эндээс уншина. v3-т:
 *  • Цэс бүлэгтэй: Өнөөдөр · Борлуулалт · Үр дүн, доор нь Тохиргоо.
 *  • «Удирдлага» (админ хуудсууд) зөвхөн super_admin-д, үндсэн shell дотор.
 *  • AI туслах дээд мөрөнд (⌘J); бүтэн хуудас нь ⌘K-аас.
 *  • Зөвхөн веб (desktop) — гар утасны доод таб байхгүй.
 *
 * Ховор хэрэглэгддэг хуудсууд цэсэнд байхгүй ч УСТААГҮЙ — ⌘K хайлт эсвэл шууд
 * URL-аар нээгдэнэ (SECONDARY_ROUTES). Нэр томьёо нь UI v3-ийн толь бичгийг дагана
 * (Мессеж, Шатаар, Өгөөж (ROI), Имэйл товхимол).
 *
 * Энэ файл нь зөвхөн дата — 'use client' хэрэггүй.
 */
import type { ComponentType, SVGAttributes } from 'react';
import {
    CalendarCheck,
    Users,
    Contact,
    CalendarDays,
    FileText,
    Building2,
    MessagesSquare,
    BarChart3,
    Megaphone,
    Sparkles,
    Settings,
    ListChecks,
    GitBranch,
    ClipboardList,
    Search,
    Headphones,
    Target,
    Calendar,
    Share2,
    Mail,
    Bot,
    HelpCircle,
    FileSpreadsheet,
    Tags,
    LayoutDashboard,
    UserCog,
    FolderKanban,
    Shield,
    Upload,
    Plug,
    SlidersHorizontal,
    History,
} from 'lucide-react';

type IconType = ComponentType<SVGAttributes<SVGSVGElement>>;

export interface NavItem {
    name: string;
    href: string;
    icon: IconType;
    /** RBAC модуль (ALL_MODULES-аас). '' = модулиар хязгаарлахгүй. */
    module: string;
    /** Зөвхөн super_admin (Удирдлага). */
    superAdmin?: boolean;
    /** Sidebar-ийн баруун талд гарах тоо (жишээ: шинэ лид, хариу хүлээж буй мессеж). */
    countKey?: CountKey;
    /** Хуудасны дотоод хэсгүүд — sidebar-т харагдахгүй; идэвхтэй төлөв, замын мөр, ⌘K-д. */
    children?: NavChild[];
    /** ⌘K хайлтын нэмэлт түлхүүр үг. */
    keywords?: string[];
}

export interface NavChild {
    name: string;
    href: string;
}

/** Sidebar дээр амьд тоо харуулах түлхүүрүүд (useNavCounts-аас ирнэ). */
export type CountKey = 'leads' | 'inbox' | 'meetings';

export interface NavSection {
    id: 'today' | 'sales' | 'results' | 'admin';
    /** Бүлгийн гарчиг; null бол гарчиггүй (эхний бүлэг). */
    label: string | null;
    items: NavItem[];
    /** Зөвхөн super_admin-д харагдана. */
    superAdmin?: boolean;
}

/* ------------------------------------------------------------------ */
/* Үндсэн цэс — өдрийн ажлын урсгалаар.                                */
/* ------------------------------------------------------------------ */

const TODAY: NavItem = {
    name: 'Өнөөдөр',
    href: '/dashboard',
    icon: CalendarCheck,
    module: 'dashboard',
    children: [
        { name: 'Самбар', href: '/dashboard' },
        { name: 'Миний ажлууд', href: '/dashboard/tasks' },
    ],
    keywords: ['самбар', 'dashboard', 'нүүр'],
};

const LEADS: NavItem = {
    name: 'Лид',
    href: '/dashboard/leads',
    icon: Users,
    module: 'leads',
    countKey: 'leads',
    children: [
        { name: 'Жагсаалт', href: '/dashboard/leads' },
        { name: 'Шатаар', href: '/dashboard/leads/pipeline' },
        { name: 'Шинэ лид', href: '/dashboard/leads/new' },
    ],
    keywords: ['lead', 'сэжим'],
};

const MEETINGS: NavItem = {
    name: 'Уулзалт',
    href: '/dashboard/viewings',
    icon: CalendarDays,
    module: 'viewings',
    countKey: 'meetings',
    keywords: ['үзлэг', 'viewing', 'meeting'],
};

const CONTRACTS: NavItem = {
    name: 'Гэрээ',
    href: '/dashboard/contracts',
    icon: FileText,
    module: 'contracts',
    children: [
        { name: 'Жагсаалт', href: '/dashboard/contracts' },
        { name: 'Гэрээ үүсгэх', href: '/dashboard/contracts/generate' },
    ],
    keywords: ['contract', 'төлбөр'],
};

const CUSTOMERS: NavItem = {
    name: 'Харилцагч',
    href: '/dashboard/customers',
    icon: Contact,
    module: 'customers',
    keywords: ['customer', 'crm', 'худалдан авагч'],
};

const MESSAGES: NavItem = {
    name: 'Мессеж',
    href: '/dashboard/inbox',
    icon: MessagesSquare,
    module: 'inbox',
    countKey: 'inbox',
    children: [
        { name: 'Жагсаалт', href: '/dashboard/inbox' },
        { name: 'Яриа', href: '/dashboard/inbox/messages' },
    ],
    keywords: ['inbox', 'messenger', 'facebook', 'instagram', 'яриа', 'чат'],
};

const UNITS: NavItem = {
    name: 'Байр',
    href: '/dashboard/properties',
    icon: Building2,
    module: 'properties',
    children: [
        { name: 'Жагсаалт', href: '/dashboard/properties' },
        { name: 'Блокууд', href: '/dashboard/properties/blocks' },
        { name: 'Шинэ байр', href: '/dashboard/properties/new' },
    ],
    keywords: ['нэгж', 'тоот', 'шатар', 'unit', 'property'],
};

const WEEKLY: NavItem = {
    name: 'Хурлын бэлтгэл',
    href: '/dashboard/weekly',
    icon: ClipboardList,
    module: 'dashboard',
    keywords: ['лхагва', 'хурал', 'weekly'],
};

const REPORTS: NavItem = {
    name: 'Тайлан',
    href: '/dashboard/reports',
    icon: BarChart3,
    module: 'reports',
    children: [
        { name: 'Сарын KPI', href: '/dashboard/reports/kpi' },
        { name: 'Үйл ажиллагаа', href: '/dashboard/reports/operations' },
        { name: 'ERP импорт, тайлан', href: '/dashboard/reports/erp' },
        { name: 'Менежерийн гүйцэтгэл', href: '/dashboard/reports/manager-performance' },
        { name: 'Лид', href: '/dashboard/reports/leads' },
        { name: 'Байр', href: '/dashboard/reports/properties' },
        { name: 'Уулзалт', href: '/dashboard/reports/meetings' },
    ],
    keywords: ['report', 'kpi'],
};

const MARKETING: NavItem = {
    name: 'Маркетинг',
    href: '/marketing',
    icon: Megaphone,
    module: 'marketing-roi',
    children: [
        { name: 'Тойм', href: '/marketing' },
        { name: 'Төсөв', href: '/marketing/budget' },
        { name: 'Өгөөж (ROI)', href: '/dashboard/marketing-roi' },
        { name: 'Сувгууд', href: '/marketing/sources' },
        { name: 'Кампанит ажил', href: '/marketing/campaigns' },
        { name: 'Имэйл товхимол', href: '/marketing/newsletter' },
        { name: 'Экспорт импорт', href: '/marketing/channel-reports' },
    ],
    keywords: ['marketing', 'meta', 'зар'],
};

/* ------------------------------------------------------------------ */
/* Удирдлага — super_admin, үндсэн shell дотор (өмнө тусдаа /admin апп). */
/* ------------------------------------------------------------------ */

export const ADMIN_NAV: NavItem[] = [
    { name: 'Тойм', href: '/admin/dashboard', icon: LayoutDashboard, module: '', superAdmin: true, keywords: ['админ', 'admin'] },
    { name: 'Хэрэглэгчид', href: '/admin/users', icon: UserCog, module: '', superAdmin: true, keywords: ['ажилтан', 'урилга', 'users'] },
    { name: 'Төслүүд', href: '/admin/projects', icon: FolderKanban, module: '', superAdmin: true, keywords: ['төсөл', 'project'] },
    { name: 'Төлөвлөгөө ба баг', href: '/admin/sales-targets', icon: Target, module: '', superAdmin: true, keywords: ['зорилт', 'менежер', 'roster', 'target'] },
    { name: 'Дүрүүд', href: '/admin/roles', icon: Shield, module: '', superAdmin: true, keywords: ['эрх', 'role', 'rbac'] },
    { name: 'Импорт', href: '/admin/import', icon: Upload, module: '', superAdmin: true, keywords: ['excel', 'csv', 'нэгж', 'import'] },
    { name: 'Холболтууд', href: '/admin/integrations', icon: Plug, module: '', superAdmin: true, keywords: ['elysium', 'integration'] },
    { name: 'Систем', href: '/admin/settings', icon: SlidersHorizontal, module: '', superAdmin: true, keywords: ['admin settings'] },
];

/** Sidebar-ийн бүлгүүд (дарааллаараа). */
export const NAV_SECTIONS: NavSection[] = [
    { id: 'today', label: null, items: [TODAY] },
    { id: 'sales', label: 'Борлуулалт', items: [LEADS, MEETINGS, CONTRACTS, CUSTOMERS, MESSAGES, UNITS] },
    { id: 'results', label: 'Үр дүн', items: [WEEKLY, REPORTS, MARKETING] },
    { id: 'admin', label: 'Удирдлага', items: ADMIN_NAV, superAdmin: true },
];

/** Бүх хэрэглэгчийн үндсэн цэс (Удирдлагаас бусад бүлэг). */
export const PRIMARY_NAV: NavItem[] = NAV_SECTIONS.filter((s) => !s.superAdmin).flatMap((s) => s.items);

/** Sidebar-ийн доод хэсэг. */
export const BOTTOM_NAV: NavItem[] = [
    { name: 'Тохиргоо', href: '/dashboard/settings', icon: Settings, module: 'settings', keywords: ['settings', 'профайл', 'мэдэгдэл'] },
];

/* ------------------------------------------------------------------ */
/* Хоёрдогч замууд — цэсэнд БАЙХГҮЙ ч ⌘K-аас нээгдэнэ.                  */
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
    { name: 'Лид — шатаар', href: '/dashboard/leads/pipeline', icon: GitBranch, module: 'leads', group: 'Ажил', keywords: ['pipeline', 'kanban', 'шат'] },
    { name: 'Санал гомдол', href: '/dashboard/customer-service', icon: Headphones, module: 'customer-service', group: 'Ажил' },

    { name: 'ERP импорт', href: '/dashboard/reports/erp', icon: ClipboardList, module: 'erp-imports', group: 'Санхүү', keywords: ['erp', 'импорт', 'snapshot', 'excel', 'csv', 'мягмар', 'өөрчлөлт'] },

    { name: 'Өрсөлдөгчийн судалгаа', href: '/dashboard/competitor-research', icon: Search, module: 'marketing-roi', group: 'Судалгаа' },

    { name: 'Сурталчилгаа', href: '/marketing/ads', icon: Target, module: 'marketing-roi', group: 'Маркетинг' },
    { name: 'Контентийн календарь', href: '/marketing/calendar', icon: Calendar, module: 'marketing-roi', group: 'Маркетинг' },
    { name: 'Сошиал', href: '/marketing/social', icon: Share2, module: 'marketing-roi', group: 'Маркетинг' },
    { name: 'Имэйл товхимол', href: '/marketing/newsletter', icon: Mail, module: 'marketing-roi', group: 'Маркетинг', keywords: ['newsletter', 'resend', 'имэйл'] },
    { name: 'Сувгийн экспорт импорт', href: '/marketing/channel-reports', icon: FileSpreadsheet, module: 'marketing-roi', group: 'Маркетинг', keywords: ['meta', 'facebook', 'callpro', 'sms', 'экспорт', 'импорт', 'excel', 'csv', 'дуудлага', 'хурал'] },

    { name: 'AI туслах', href: '/dashboard/ai-assistant', icon: Sparkles, module: 'ai-assistant', group: 'AI', keywords: ['ai', 'туслах', 'chat'] },
    { name: 'AI агентууд', href: '/dashboard/ai-assistant/agents', icon: Bot, module: 'ai-assistant', group: 'AI' },
    { name: 'AI үйлдлийн түүх', href: '/dashboard/ai-assistant/audit', icon: History, module: 'ai-assistant', group: 'AI', keywords: ['audit', 'аудит'] },
    { name: 'AI тохиргоо', href: '/dashboard/ai-settings', icon: Settings, module: 'ai-settings', group: 'AI' },

    { name: 'Лидийн ангилал', href: '/dashboard/settings#lead-categories', icon: Tags, module: 'settings', group: 'Систем', keywords: ['ангилал', 'category', 'лид', 'төрөл'] },
    { name: 'Тусламж', href: '/help', icon: HelpCircle, module: '', group: 'Систем' },
];

/* ------------------------------------------------------------------ */
/* Туслах функцууд                                                     */
/* ------------------------------------------------------------------ */

const APP_ITEMS: NavItem[] = [...PRIMARY_NAV, ...BOTTOM_NAV];
const ALL_ITEMS: NavItem[] = [...APP_ITEMS, ...ADMIN_NAV];
const ROUTE_MODULES = [
    ...SECONDARY_ROUTES,
    ...APP_ITEMS.flatMap(item => [item, ...(item.children ?? []).map(child => ({ ...child, module: item.module }))]),
];

function matchesPath(pathname: string, href: string): boolean {
    return pathname === href || pathname.startsWith(href + '/');
}

/** Direct URLs use the same module as navigation; the longest route wins. */
export function getRouteModule(pathname: string): string | undefined {
    return ROUTE_MODULES
        .filter(item => pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href + '/')))
        .sort((a, b) => b.href.length - a.href.length)[0]?.module;
}

/** Удирдлагын (super_admin) зам эсэх — `/admin` ба түүний доорх бүх хуудас. */
export function isSuperAdminRoute(pathname: string): boolean {
    return matchesPath(pathname, '/admin');
}

/**
 * Тухайн зам энэ цэсэнд харьяалагдах эсэх.
 * `/dashboard` нь зөвхөн ЯГ таарвал идэвхтэй (бусад бүх зам түүгээр эхэлдэг); «Миний ажлууд» нь Өнөөдрийнх.
 */
export function isNavItemActive(item: NavItem, pathname: string): boolean {
    if (item.href === '/dashboard') return pathname === '/dashboard' || pathname === '/dashboard/tasks';
    if (matchesPath(pathname, item.href)) return true;
    return (item.children ?? []).some((c) => matchesPath(pathname, c.href));
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
 * Хамгийн ихдээ 3 шат: [Хэсэг] › [Дэд хуудас] › [Бичлэг]. Удирдлагын хуудсууд «Удирдлага»-аар эхэлнэ.
 * Ганц түвшний хуудсанд нэг мөр буцаана; таних замгүй бол хоосон массив.
 */
export function getBreadcrumb(pathname: string): Crumb[] {
    const item = findNavItem(pathname);
    if (!item) {
        // Хоёрдогч замын нарийн (урт) href нь ерөнхийгөөсөө түрүүлнэ.
        const secondary = SECONDARY_ROUTES
            .filter((r) => matchesPath(pathname, r.href))
            .reduce<SecondaryRoute | undefined>((a, b) => (!a || b.href.length > a.href.length ? b : a), undefined);
        return secondary ? [{ name: secondary.name, href: secondary.href }] : [];
    }

    const crumbs: Crumb[] = item.superAdmin ? [{ name: 'Удирдлага', href: ADMIN_NAV[0].href }] : [];
    if (!(item.superAdmin && item.href === ADMIN_NAV[0].href)) crumbs.push({ name: item.name, href: item.href });
    if (pathname === item.href) return crumbs;

    const child = (item.children ?? [])
        .filter((c) => c.href !== item.href)
        .filter((c) => matchesPath(pathname, c.href))
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

/** Хуудасны гарчиг — дээд мөр болон <title>-д. */
export function getNavTitle(pathname: string): string {
    const crumbs = getBreadcrumb(pathname);
    if (crumbs.length) return crumbs[crumbs.length - 1].name;
    return 'Vertmon Hub';
}

/** Браузерын табын гарчиг: «Лид · Vertmon Hub». */
export function getDocumentTitle(title: string): string {
    return title && title !== 'Vertmon Hub' ? `${title} · Vertmon Hub` : 'Vertmon Hub';
}

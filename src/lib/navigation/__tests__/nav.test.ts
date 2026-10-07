import { describe, it, expect } from 'vitest';
import {
    NAV_SECTIONS,
    PRIMARY_NAV,
    ADMIN_NAV,
    BOTTOM_NAV,
    SECONDARY_ROUTES,
    isNavItemActive,
    isSuperAdminRoute,
    findNavItem,
    getBreadcrumb,
    getNavTitle,
    getDocumentTitle,
    getRouteModule,
} from '../nav';
import * as nav from '../nav';

describe('nav v3 — бүтэц', () => {
    it('direct URLs retain module boundaries including aliases and narrower child modules', () => {
        expect(getRouteModule('/dashboard/marketing-roi')).toBe('marketing-roi');
        expect(getRouteModule('/dashboard/competitor-research')).toBe('marketing-roi');
        expect(getRouteModule('/dashboard/properties/fixture-id')).toBe('properties');
        expect(getRouteModule('/dashboard/customer-service')).toBe('customer-service');
        expect(getRouteModule('/dashboard/customers')).toBe('customers');
        expect(getRouteModule('/dashboard/tasks')).toBe('dashboard');
        expect(getRouteModule('/dashboard/weekly')).toBe('dashboard');
        expect(getRouteModule('/dashboard/daily-report')).toBe('dashboard');
        expect(getRouteModule('/dashboard/ai-assistant/audit')).toBe('ai-assistant');
        expect(getRouteModule('/dashboard/leadsX')).toBeUndefined();
        // «Тайлан»-ийн хүүхэд мөр reports-ийг өвлөдөг ч ERP нь илүү нарийн эрх шаардана.
        expect(getRouteModule('/dashboard/reports/erp')).toBe('erp-imports');
    });

    it('sidebar бүлгүүд: Өнөөдөр · Борлуулалт · Үр дүн · Удирдлага (super_admin)', () => {
        expect(NAV_SECTIONS.map((s) => [s.label, s.items.map((i) => i.name)])).toEqual([
            [null, ['Өнөөдөр']],
            ['Борлуулалт', ['Лид', 'Уулзалт', 'Гэрээ', 'Харилцагч', 'Мессеж', 'Байр']],
            ['Үр дүн', ['Өдрийн тайлан', 'Хурлын бэлтгэл', 'Тайлан', 'Маркетинг']],
            ['Удирдлага', ['Тойм', 'Хэрэглэгчид', 'Төслүүд', 'Төлөвлөгөө ба баг', 'Дүрүүд', 'Импорт', 'Холболтууд', 'Систем']],
        ]);
        expect(NAV_SECTIONS.filter((s) => s.superAdmin).map((s) => s.id)).toEqual(['admin']);
        expect(PRIMARY_NAV.some((i) => i.superAdmin)).toBe(false);
        expect(ADMIN_NAV.every((i) => i.superAdmin && i.href.startsWith('/admin/'))).toBe(true);
    });

    it('доод цэс: зөвхөн Тохиргоо; AI туслах дээд мөрөнд ба ⌘K-д', () => {
        expect(BOTTOM_NAV.map((i) => i.name)).toEqual(['Тохиргоо']);
        expect(SECONDARY_ROUTES.some((r) => r.href === '/dashboard/ai-assistant')).toBe(true);
    });

    it('гар утасны доод таб v3-т байхгүй', () => {
        expect('MOBILE_TABS' in nav).toBe(false);
    });

    it('нэр томьёо толь бичгийг дагана: Мессеж, Шатаар, Өгөөж (ROI), Имэйл товхимол', () => {
        const names = [...PRIMARY_NAV, ...BOTTOM_NAV].flatMap((i) => [i.name, ...(i.children ?? []).map((c) => c.name)]);
        expect(names).toEqual(expect.arrayContaining(['Мессеж', 'Шатаар', 'Өгөөж (ROI)', 'Имэйл товхимол']));
        for (const old of ['Inbox', 'Pipeline', 'ROI', 'Newsletter']) expect(names).not.toContain(old);
    });

    it('устгасан санхүү/худалдан авалт/судалгааны зам цэс, ⌘K-д байхгүй', () => {
        const hrefs = [...PRIMARY_NAV, ...BOTTOM_NAV, ...SECONDARY_ROUTES].map((i) => i.href);
        for (const removed of ['/dashboard/finance', '/dashboard/procurement', '/dashboard/surveys']) {
            expect(hrefs.some((h) => h === removed || h.startsWith(removed + '/'))).toBe(false);
        }
        expect(SECONDARY_ROUTES.some((r) => r.href === '/dashboard/reports/erp')).toBe(true);
    });

    it('өгөгдөл ирдэггүй placeholder маркетинг хуудсууд цэс, ⌘K-д байхгүй ч эрхийн хил хэвээр', () => {
        const hrefs = [
            ...PRIMARY_NAV.flatMap((i) => [i.href, ...(i.children ?? []).map((c) => c.href)]),
            ...BOTTOM_NAV.map((i) => i.href),
            ...SECONDARY_ROUTES.map((r) => r.href),
        ];
        for (const placeholder of ['/marketing/analytics', '/marketing/brand', '/marketing/messaging']) {
            expect(hrefs).not.toContain(placeholder);
            // Хуудас устаагүй: шууд URL нь /marketing-ийн marketing-roi эрхээр хамгаалагдсан хэвээр.
            expect(getRouteModule(placeholder)).toBe('marketing-roi');
        }
    });

    it('href бүр давтагдахгүй', () => {
        const hrefs = [...PRIMARY_NAV, ...ADMIN_NAV, ...BOTTOM_NAV].map((i) => i.href);
        expect(new Set(hrefs).size).toBe(hrefs.length);
    });

    it('⌘K мөрүүд давхардахгүй (React key = href + name)', () => {
        const keys = SECONDARY_ROUTES.map((r) => r.href + r.name);
        expect(new Set(keys).size).toBe(keys.length);
        expect(SECONDARY_ROUTES.filter((r) => r.href === '/dashboard/reports/erp')).toHaveLength(1);
        expect(SECONDARY_ROUTES.filter((r) => r.href === '/marketing/newsletter')).toHaveLength(1);
    });
});

describe('isNavItemActive / isSuperAdminRoute', () => {
    const today = PRIMARY_NAV[0];
    const leads = PRIMARY_NAV.find(item => item.href === '/dashboard/leads')!;

    it('«Өнөөдөр» зөвхөн /dashboard ба «Миний ажлууд» дээр идэвхтэй', () => {
        expect(isNavItemActive(today, '/dashboard')).toBe(true);
        expect(isNavItemActive(today, '/dashboard/tasks')).toBe(true);
        expect(isNavItemActive(today, '/dashboard/leads')).toBe(false);
        expect(isNavItemActive(today, '/dashboard/contracts/generate')).toBe(false);
    });

    it('дэд зам болон children дээр идэвхтэй', () => {
        expect(isNavItemActive(leads, '/dashboard/leads')).toBe(true);
        expect(isNavItemActive(leads, '/dashboard/leads/pipeline')).toBe(true);
        expect(isNavItemActive(leads, '/dashboard/leads/new')).toBe(true);
        expect(isNavItemActive(leads, '/dashboard/leadsX')).toBe(false);
    });

    it('Маркетинг нь /marketing болон /dashboard/marketing-roi хоёуланд идэвхтэй', () => {
        const marketing = PRIMARY_NAV.find((i) => i.name === 'Маркетинг')!;
        expect(isNavItemActive(marketing, '/marketing/budget')).toBe(true);
        expect(isNavItemActive(marketing, '/dashboard/marketing-roi')).toBe(true);
    });

    it('/admin ба түүний доорх бүх хуудас super_admin-д', () => {
        expect(isSuperAdminRoute('/admin')).toBe(true);
        expect(isSuperAdminRoute('/admin/users')).toBe(true);
        expect(isSuperAdminRoute('/administrator')).toBe(false);
        expect(isSuperAdminRoute('/dashboard/settings')).toBe(false);
    });
});

describe('findNavItem / getBreadcrumb / getNavTitle / getDocumentTitle', () => {
    it('хамгийн тодорхой цэсийг олно', () => {
        expect(findNavItem('/dashboard/leads/pipeline')?.name).toBe('Лид');
        expect(findNavItem('/dashboard')?.name).toBe('Өнөөдөр');
        expect(findNavItem('/admin/roles')?.name).toBe('Дүрүүд');
        // AI туслах цэсэнд байхгүй — ⌘K-ийн хоёрдогч замаар гарчигтай.
        expect(findNavItem('/dashboard/ai-assistant/audit')).toBeUndefined();
        expect(getNavTitle('/dashboard/ai-assistant/audit')).toBe('AI үйлдлийн түүх');
    });

    it('ганц түвшний хуудсанд нэг crumb', () => {
        expect(getBreadcrumb('/dashboard/leads')).toEqual([{ name: 'Лид', href: '/dashboard/leads' }]);
        expect(getNavTitle('/dashboard/leads')).toBe('Лид');
        expect(getNavTitle('/dashboard/inbox')).toBe('Мессеж');
    });

    it('child хуудсанд 2 crumb, бичлэгт 3 crumb', () => {
        expect(getBreadcrumb('/dashboard/leads/pipeline')).toEqual([
            { name: 'Лид', href: '/dashboard/leads' },
            { name: 'Шатаар', href: '/dashboard/leads/pipeline' },
        ]);
        expect(getBreadcrumb('/dashboard/properties/abc-123')).toEqual([
            { name: 'Байр', href: '/dashboard/properties' },
            { name: 'Дэлгэрэнгүй' },
        ]);
        expect(getNavTitle('/dashboard/properties/abc-123')).toBe('Дэлгэрэнгүй');
    });

    it('Харилцагчийн картын бүтэн хуудас лидийн эрх, замын мөртэй', () => {
        expect(getRouteModule('/dashboard/leads/00000000-0000-4000-8000-000000000010')).toBe('leads');
        expect(getBreadcrumb('/dashboard/leads/00000000-0000-4000-8000-000000000010')).toEqual([
            { name: 'Лид', href: '/dashboard/leads' },
            { name: 'Дэлгэрэнгүй' },
        ]);
        expect(findNavItem('/dashboard/leads/00000000-0000-4000-8000-000000000010')?.name).toBe('Лид');
    });

    it('удирдлагын хуудсууд «Удирдлага»-аар эхэлнэ', () => {
        expect(getBreadcrumb('/admin/dashboard')).toEqual([{ name: 'Удирдлага', href: '/admin/dashboard' }]);
        expect(getBreadcrumb('/admin/users')).toEqual([
            { name: 'Удирдлага', href: '/admin/dashboard' },
            { name: 'Хэрэглэгчид', href: '/admin/users' },
        ]);
        expect(getNavTitle('/admin/sales-targets')).toBe('Төлөвлөгөө ба баг');
    });

    it('хоёрдогч зам (цэсэнд байхгүй) ч гарчигтай', () => {
        expect(getNavTitle('/dashboard/customer-service')).toBe('Санал гомдол');
        expect(getBreadcrumb('/dashboard/competitor-research')[0].name).toBe('Өрсөлдөгчийн судалгаа');
    });

    it('тодорхойгүй зам → Vertmon Hub', () => {
        expect(getNavTitle('/nowhere')).toBe('Vertmon Hub');
        expect(getBreadcrumb('/nowhere')).toEqual([]);
    });

    it('браузерын табын гарчиг', () => {
        expect(getDocumentTitle('Лид')).toBe('Лид · Vertmon Hub');
        expect(getDocumentTitle('Vertmon Hub')).toBe('Vertmon Hub');
        expect(getDocumentTitle('')).toBe('Vertmon Hub');
    });
});

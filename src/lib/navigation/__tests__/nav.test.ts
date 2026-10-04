import { describe, it, expect } from 'vitest';
import {
    PRIMARY_NAV,
    BOTTOM_NAV,
    MOBILE_TABS,
    SECONDARY_ROUTES,
    isNavItemActive,
    findNavItem,
    getBreadcrumb,
    getNavTitle,
    getRouteModule,
} from '../nav';

describe('nav v2 — бүтэц', () => {
    it('direct URLs retain module boundaries including aliases and narrower child modules', () => {
        expect(getRouteModule('/dashboard/marketing-roi')).toBe('marketing-roi');
        expect(getRouteModule('/dashboard/competitor-research')).toBe('marketing-roi');
        expect(getRouteModule('/dashboard/properties/fixture-id')).toBe('properties');
        expect(getRouteModule('/dashboard/customer-service')).toBe('customer-service');
        expect(getRouteModule('/dashboard/tasks')).toBe('dashboard');
        expect(getRouteModule('/dashboard/weekly')).toBe('dashboard');
        expect(getRouteModule('/dashboard/leadsX')).toBeUndefined();
        // «Тайлан»-ийн хүүхэд мөр reports-ийг өвлөдөг ч ERP нь илүү нарийн эрх шаардана.
        expect(getRouteModule('/dashboard/reports/erp')).toBe('erp-imports');
    });
    it('өдөр тутмын ажил ба хурлын бэлтгэл эхэнд байна', () => {
        expect(PRIMARY_NAV.map((i) => i.name)).toEqual([
            'Өнөөдөр', 'Хурлын бэлтгэл', 'Лид', 'Уулзалт', 'Гэрээ', 'Байр', 'Inbox', 'Тайлан', 'Маркетинг',
        ]);
    });

    it('доод цэс: AI туслах + Тохиргоо', () => {
        expect(BOTTOM_NAV.map((i) => i.name)).toEqual(['AI туслах', 'Тохиргоо']);
    });

    it('гар утаснаас хурлын бэлтгэлд шууд орно', () => {
        expect(MOBILE_TABS.map((i) => i.href)).toEqual(['/dashboard', '/dashboard/leads', '/dashboard/weekly']);
    });

    it('устгасан санхүү/худалдан авалт/судалгааны зам цэс, ⌘K-д байхгүй', () => {
        const hrefs = [...PRIMARY_NAV, ...BOTTOM_NAV, ...SECONDARY_ROUTES].map((i) => i.href);
        for (const removed of ['/dashboard/finance', '/dashboard/procurement', '/dashboard/surveys']) {
            expect(hrefs.some((h) => h === removed || h.startsWith(removed + '/'))).toBe(false);
        }
        expect(SECONDARY_ROUTES.some((r) => r.href === '/dashboard/reports/erp')).toBe(true);
    });

    it('href бүр давтагдахгүй', () => {
        const hrefs = [...PRIMARY_NAV, ...BOTTOM_NAV].map((i) => i.href);
        expect(new Set(hrefs).size).toBe(hrefs.length);
    });

    it('⌘K / «Бусад» мөрүүд давхардахгүй (React key = href + name)', () => {
        const keys = SECONDARY_ROUTES.map((r) => r.href + r.name);
        expect(new Set(keys).size).toBe(keys.length);
        expect(SECONDARY_ROUTES.filter((r) => r.href === '/dashboard/reports/erp')).toHaveLength(1);
        expect(SECONDARY_ROUTES.filter((r) => r.href === '/marketing/newsletter')).toHaveLength(1);
    });
});

describe('isNavItemActive', () => {
    const today = PRIMARY_NAV[0];
    const leads = PRIMARY_NAV.find(item => item.href === '/dashboard/leads')!;

    it('«Өнөөдөр» зөвхөн /dashboard дээр идэвхтэй (бусад зам түүгээр эхэлдэг ч)', () => {
        expect(isNavItemActive(today, '/dashboard')).toBe(true);
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
});

describe('findNavItem / getBreadcrumb / getNavTitle', () => {
    it('хамгийн тодорхой цэсийг олно', () => {
        expect(findNavItem('/dashboard/leads/pipeline')?.name).toBe('Лид');
        expect(findNavItem('/dashboard')?.name).toBe('Өнөөдөр');
        expect(findNavItem('/dashboard/ai-assistant/audit')?.name).toBe('AI туслах');
    });

    it('ганц түвшний хуудсанд нэг crumb', () => {
        expect(getBreadcrumb('/dashboard/leads')).toEqual([{ name: 'Лид', href: '/dashboard/leads' }]);
        expect(getNavTitle('/dashboard/leads')).toBe('Лид');
    });

    it('child хуудсанд 2 crumb, бичлэгт 3 crumb', () => {
        expect(getBreadcrumb('/dashboard/leads/pipeline')).toEqual([
            { name: 'Лид', href: '/dashboard/leads' },
            { name: 'Pipeline', href: '/dashboard/leads/pipeline' },
        ]);
        expect(getBreadcrumb('/dashboard/properties/abc-123')).toEqual([
            { name: 'Байр', href: '/dashboard/properties' },
            { name: 'Дэлгэрэнгүй' },
        ]);
        expect(getNavTitle('/dashboard/properties/abc-123')).toBe('Дэлгэрэнгүй');
    });

    it('хоёрдогч зам (цэсэнд байхгүй) ч гарчигтай', () => {
        expect(getNavTitle('/dashboard/customer-service')).toBe('Санал гомдол');
        expect(getBreadcrumb('/dashboard/competitor-research')[0].name).toBe('Өрсөлдөгчийн судалгаа');
    });

    it('тодорхойгүй зам → Vertmon Hub', () => {
        expect(getNavTitle('/nowhere')).toBe('Vertmon Hub');
        expect(getBreadcrumb('/nowhere')).toEqual([]);
    });
});

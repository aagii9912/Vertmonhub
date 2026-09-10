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
} from '../nav';

describe('nav v2 — бүтэц', () => {
    it('үндсэн цэс яг 8 зүйлтэй, өдрийн урсгалын дарааллаар', () => {
        expect(PRIMARY_NAV.map((i) => i.name)).toEqual([
            'Өнөөдөр', 'Лид', 'Уулзалт', 'Гэрээ', 'Байр', 'Inbox', 'Тайлан', 'Маркетинг',
        ]);
    });

    it('доод цэс: AI туслах + Тохиргоо', () => {
        expect(BOTTOM_NAV.map((i) => i.name)).toEqual(['AI туслах', 'Тохиргоо']);
    });

    it('гар утасны таб нь үндсэн цэсний эхний гурав', () => {
        expect(MOBILE_TABS.map((i) => i.href)).toEqual(['/dashboard', '/dashboard/leads', '/dashboard/viewings']);
    });

    it('санхүү / ERP цэсэнд БАЙХГҮЙ, харин хоёрдогч замд байна', () => {
        const primaryHrefs = PRIMARY_NAV.map((i) => i.href);
        expect(primaryHrefs).not.toContain('/dashboard/finance');
        expect(primaryHrefs).not.toContain('/dashboard/procurement');
        expect(SECONDARY_ROUTES.some((r) => r.href === '/dashboard/finance')).toBe(true);
        expect(SECONDARY_ROUTES.some((r) => r.href === '/dashboard/procurement')).toBe(true);
    });

    it('href бүр давтагдахгүй', () => {
        const hrefs = [...PRIMARY_NAV, ...BOTTOM_NAV].map((i) => i.href);
        expect(new Set(hrefs).size).toBe(hrefs.length);
    });
});

describe('isNavItemActive', () => {
    const today = PRIMARY_NAV[0];
    const leads = PRIMARY_NAV[1];

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
        expect(getNavTitle('/dashboard/finance')).toBe('Санхүү');
        expect(getBreadcrumb('/dashboard/finance/projects')[0].name).toBe('Санхүүгийн төслүүд');
    });

    it('тодорхойгүй зам → Vertmon Hub', () => {
        expect(getNavTitle('/nowhere')).toBe('Vertmon Hub');
        expect(getBreadcrumb('/nowhere')).toEqual([]);
    });
});

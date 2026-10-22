// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import type { DirectorPayload } from '@/lib/dashboard/director';

const state = vi.hoisted(() => ({ data: null as unknown }));
vi.mock('@/hooks/useDirector', () => ({
    useDirector: () => ({ data: state.data, isLoading: false, isFetching: false, isError: false, error: null, refetch: vi.fn() }),
}));
vi.mock('@/lib/navigation/pageTitle', () => ({ usePageTitle: () => undefined }));
vi.mock('@/lib/ai/context', () => ({ useRegisterAiContext: () => undefined }));

import { DirectorDashboard } from './DirectorDashboard';

function payload(sales: Partial<DirectorPayload['sales']>, missing: string[] = []) {
    return {
        year: 2026, month: 10, missing, leaderboard: [], funnel: { rows: [], totals: {} },
        sales: {
            actual: null, target: null, attainmentPct: null, lowerBound: false, momDeltaPct: null, units: 0, unitsByType: [],
            trendActual: Array(12).fill(null), trendTarget: Array(12).fill(null), trendLowerBound: Array(12).fill(false), yearActual: null, yearTarget: null, undated: 0, ...sales,
        },
    } as unknown as DirectorPayload;
}

// jsdom-д ResizeObserver байхгүй (12 сарын графикийн өргөн).
vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });

afterEach(cleanup);

describe('director sales vs plan card', () => {
    it('shows a lower bound with its percentage and never a guessed 0', () => {
        state.data = payload({ actual: 2_281_995_000, target: 5_352_996_000, attainmentPct: 43, lowerBound: true, undated: 10 });
        render(<DirectorDashboard />);
        expect(screen.getByText('43%+')).toBeInTheDocument();
        expect(screen.getByText(/Огноогүй 10 гэрээ сарын дүнд ороогүй/)).toBeInTheDocument();
        expect(screen.queryByText('0%')).not.toBeInTheDocument();
    });

    it('draws an unknown month as «—» and the current lower-bound month with «+», never as a zero bar', () => {
        const trendActual: Array<number | null> = Array(12).fill(null);
        const trendLowerBound: boolean[] = Array(12).fill(false);
        trendActual[6] = 0; // 7-р сар: огноотой гэрээгүй, огноогүй гэрээ ч алга → 0, «—» биш
        trendLowerBound[7] = true; // 8-р сар: огноогүй гэрээтэй, дүнгүй → тодорхойгүй
        trendActual[9] = 2_281_995_000; trendLowerBound[9] = true;
        state.data = payload({ actual: 2_281_995_000, target: 5_352_996_000, attainmentPct: 43, lowerBound: true, trendActual, trendLowerBound,
            trendTarget: Array(12).fill(5_352_996_000) });
        const { container } = render(<DirectorDashboard />);
        const chart = container.querySelector('svg[aria-label="12 сарын борлуулалт ба зорилт"]')!;
        expect(chart.querySelector('[data-unknown-month="8"]')?.textContent).toBe('—');
        expect(chart.querySelectorAll('[data-unknown-month]')).toHaveLength(1);
        expect(screen.getByText('2.3+')).toBeInTheDocument();
    });

    it('says the plan could not be read instead of offering to set a missing target', () => {
        state.data = payload({}, ['sales']);
        render(<DirectorDashboard />);
        expect(screen.getByText('Борлуулалт, зорилтыг уншиж чадсангүй')).toHaveAttribute('role', 'alert');
        expect(screen.queryByRole('link', { name: 'Сарын зорилт тохируулах' })).not.toBeInTheDocument();

        cleanup();
        state.data = payload({});
        render(<DirectorDashboard />);
        expect(screen.getByRole('link', { name: 'Сарын зорилт тохируулах' })).toHaveAttribute('href', '/admin/sales-targets');
    });
});

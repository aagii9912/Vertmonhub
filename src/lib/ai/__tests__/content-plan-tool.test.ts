// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ContentItem } from '@/lib/marketing/content-plan';
import { TOOL_CATALOG } from '@/lib/ai/tool-catalog';

const state = vi.hoisted(() => ({ items: [] as ContentItem[], ranges: [] as { from: string; to: string }[], fail: false }));
vi.mock('@/lib/supabase', () => ({ supabaseAdmin: () => ({}) }));
vi.mock('@/lib/marketing/content-plan-store', () => ({
    listContent: async (_db: unknown, _shop: string, range: { from: string; to: string }) => {
        state.ranges.push(range);
        return state.fail ? { error: { message: 'boom' } } : { items: state.items };
    },
}));

const { getContentPlanTool } = await import('../data-assistant/actions-content-plan');
const item = (scheduled_date: string, status: ContentItem['status'], extra: Partial<ContentItem> = {}): ContentItem => ({
    id: scheduled_date + status, title: 'Пост', type: 'post', platform: 'facebook', scheduled_date, scheduled_time: null, status,
    description: null, assigned_to: 'Анужин', color: null, image_paths: [], created_by: null, updated_at: '2026-10-01T00:00:00Z', ...extra,
});

describe('get_content_plan', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-10-14T03:00:00Z'));
        state.items = []; state.ranges = []; state.fail = false;
    });

    it('is a marketing read tool', () => {
        expect(TOOL_CATALOG.get_content_plan).toMatchObject({ kind: 'read', module: 'marketing-roi' });
    });

    it('defaults to this Ulaanbaatar month and summarises published vs planned without private image paths', async () => {
        state.items = [
            item('2026-10-02', 'published', { image_paths: ['shop/user/a.jpg'] }),
            item('2026-10-09', 'planned', { title: 'Reel', type: 'reel' }),
            item('2026-10-20', 'cancelled'),
        ];
        const result = await getContentPlanTool('shop-1', {});
        expect(state.ranges).toEqual([{ from: '2026-10-01', to: '2026-10-31' }]);
        expect(result).toMatchObject({
            totals: { planned: 2, published: 1, overdue: 1, cancelled: 1, published_pct: 50 },
            by_type: [{ type: 'Пост', planned: 1, published: 1 }, { type: 'Reel', planned: 1, published: 0 }],
        });
        const items = 'items' in result ? result.items ?? [] : [];
        expect(items[0]).toMatchObject({ date: '2026-10-02', type: 'Пост', platform: 'Facebook', status: 'Нийтэлсэн', images: 1, overdue: false });
        expect(items[1]).toMatchObject({ title: 'Reel', overdue: true });
        expect(JSON.stringify(result)).not.toContain('a.jpg');
    });

    it('rejects ranges the content-plan API rejects and reports load errors', async () => {
        expect(await getContentPlanTool('shop-1', { from: '2026-01-01', to: '2026-12-31' })).toHaveProperty('error');
        expect(state.ranges).toEqual([]);
        state.fail = true;
        expect(await getContentPlanTool('shop-1', { from: '2026-10-01', to: '2026-10-07' })).toEqual({ error: 'Контент төлөвлөгөөг уншиж чадсангүй. Дахин оролдоно уу.' });
    });
});

import { describe, expect, it } from 'vitest';
import { ContentCreateSchema, ContentPatchSchema, ContentRangeSchema, summarizeContentPlan, type ContentItem } from '../content-plan';

const item = (id: string, date: string, status: ContentItem['status'], type: ContentItem['type'] = 'post'): ContentItem => ({
    id, title: id, type, platform: 'facebook', scheduled_date: date, scheduled_time: null, status, description: null, assigned_to: null,
    color: null, image_paths: [], created_by: null, updated_at: '2026-10-01T00:00:00Z',
});

describe('marketing content plan', () => {
    it('measures the week against its own plan: cancelled is not planned, overdue is past and unpublished', () => {
        const items = [item('a', '2026-10-07', 'published', 'reel'), item('b', '2026-10-08', 'planned'), item('c', '2026-10-09', 'ready'),
            item('d', '2026-10-10', 'cancelled'), item('e', '2026-10-13', 'in_progress'), item('f', '2026-10-14', 'planned')];
        const week = summarizeContentPlan(items, { from: '2026-10-07', to: '2026-10-13' }, '2026-10-10');
        expect(week).toMatchObject({ planned: 4, published: 1, inProgress: 2, overdue: 2, cancelled: 1, pct: 25 });
        expect(week.overdueItems.map(entry => entry.id)).toEqual(['b', 'c']);
        expect(week.byType).toEqual([{ type: 'post', label: 'Пост', planned: 3, published: 0 }, { type: 'reel', label: 'Reel', planned: 1, published: 1 }]);
        expect(week.items.map(entry => entry.id)).toEqual(['a', 'b', 'c', 'd', 'e']);
        expect(summarizeContentPlan([], { from: '2026-10-07', to: '2026-10-13' }, '2026-10-10').pct).toBeNull();
    });

    it('accepts only known values, trims text and caps ranges and images', () => {
        const base = { title: '  Reel  ', type: 'reel', scheduledDate: '2026-10-08' };
        expect(ContentCreateSchema.parse(base)).toMatchObject({ title: 'Reel', status: 'planned', platform: null, assignedTo: null, imagePaths: [] });
        expect(ContentCreateSchema.safeParse({ ...base, type: 'tweet' }).success).toBe(false);
        expect(ContentCreateSchema.safeParse({ ...base, status: 'done' }).success).toBe(false);
        expect(ContentCreateSchema.safeParse({ ...base, shop_id: 'x' }).success).toBe(false);
        expect(ContentCreateSchema.safeParse({ ...base, scheduledDate: '2026-02-30' }).success).toBe(false);
        expect(ContentCreateSchema.safeParse({ ...base, imagePaths: ['../x.png'] }).success).toBe(false);
        expect(ContentPatchSchema.parse({ status: 'published', assignedTo: '  ' })).toEqual({ status: 'published', assignedTo: null });
        expect(ContentPatchSchema.safeParse({}).success).toBe(false);
        expect(ContentRangeSchema.safeParse({ from: '2026-10-07', to: '2026-10-20' }).success).toBe(true);
        expect(ContentRangeSchema.safeParse({ from: '2026-10-20', to: '2026-10-07' }).success).toBe(false);
        expect(ContentRangeSchema.safeParse({ from: '2026-01-01', to: '2026-12-31' }).success).toBe(false);
    });
});

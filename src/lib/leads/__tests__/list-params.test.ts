import { describe, expect, it } from 'vitest';
import { emptyLeadFilters, hasLeadFilters, parseLeadFilters, serializeLeadFilters, viewQuery } from '../list-params';

const parse = (query: string) => parseLeadFilters(new URLSearchParams(query));

describe('lead list filters in the URL', () => {
    it('keeps the plain page clean', () => {
        expect(serializeLeadFilters(emptyLeadFilters()).toString()).toBe('');
        expect(hasLeadFilters(parse(''))).toBe(false);
    });

    it('round-trips every filter', () => {
        const query = 'view=mine&status=offered&source=facebook&manager=%D0%9D%D0%BE%D0%BC%D0%B8%D0%BD&project=p1&category=none&period=month&q=9911&sort=customer_name&dir=asc&page=3';
        const filters = parse(query);
        expect(filters).toMatchObject({ view: 'mine', status: 'offered', source: 'facebook', manager: 'Номин', category: 'none', period: 'month', q: '9911', sort: 'customer_name', dir: 'asc', page: 3 });
        expect(serializeLeadFilters(filters).toString()).toBe(query);
    });

    it('gives each attention queue its own default order without writing it', () => {
        const overdue = parse('queue=overdue');
        expect(overdue).toMatchObject({ queue: 'overdue', sort: 'next_followup_at', dir: 'asc' });
        expect(serializeLeadFilters(overdue).toString()).toBe('queue=overdue');
        expect(parse('queue=unassigned')).toMatchObject({ sort: 'created_at', dir: 'asc' });
        expect(hasLeadFilters(overdue)).toBe(true);
    });

    it('ignores unknown or hostile values', () => {
        expect(parse('queue=everything&view=admin&sort=password&dir=up&period=forever&page=-4')).toEqual(emptyLeadFilters());
        expect(parse(`q=${'а'.repeat(500)}`).q).toHaveLength(200);
    });

    it('saves views without the page number', () => {
        expect(viewQuery(parse('view=new&page=4'))).toBe('view=new');
    });
});

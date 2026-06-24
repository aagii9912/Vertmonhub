/**
 * Pagination util tests
 */

import { describe, it, expect } from 'vitest';
import { parsePagination, buildPageMeta, MAX_PAGE_SIZE, DEFAULT_PAGE_SIZE } from '@/lib/utils/pagination';

function sp(query: string): URLSearchParams {
    return new URLSearchParams(query);
}

describe('parsePagination', () => {
    it('applies a safety cap when no params are provided', () => {
        const p = parsePagination(sp(''));
        expect(p.explicit).toBe(false);
        expect(p.pageSize).toBe(MAX_PAGE_SIZE);
        expect(p.from).toBe(0);
        expect(p.to).toBe(MAX_PAGE_SIZE - 1);
    });

    it('parses page + pageSize', () => {
        const p = parsePagination(sp('page=3&pageSize=20'));
        expect(p.explicit).toBe(true);
        expect(p.page).toBe(3);
        expect(p.pageSize).toBe(20);
        expect(p.from).toBe(40); // (3-1)*20
        expect(p.to).toBe(59);
    });

    it('parses limit + offset (takes precedence over page)', () => {
        const p = parsePagination(sp('limit=10&offset=30&page=99'));
        expect(p.limit).toBe(10);
        expect(p.offset).toBe(30);
        expect(p.from).toBe(30);
        expect(p.to).toBe(39);
        expect(p.page).toBe(4); // floor(30/10)+1
    });

    it('clamps pageSize to MAX_PAGE_SIZE', () => {
        const p = parsePagination(sp('pageSize=99999'));
        expect(p.pageSize).toBe(MAX_PAGE_SIZE);
    });

    it('falls back to default page size for invalid pageSize', () => {
        const p = parsePagination(sp('page=1&pageSize=abc'));
        expect(p.pageSize).toBe(DEFAULT_PAGE_SIZE);
    });

    it('treats negative/zero page as page 1', () => {
        expect(parsePagination(sp('page=0&pageSize=10')).page).toBe(1);
        expect(parsePagination(sp('page=-5&pageSize=10')).page).toBe(1);
    });
});

describe('buildPageMeta', () => {
    it('computes total pages and hasMore', () => {
        const p = parsePagination(sp('page=1&pageSize=20'));
        const meta = buildPageMeta(45, p);
        expect(meta.total).toBe(45);
        expect(meta.totalPages).toBe(3);
        expect(meta.hasMore).toBe(true);
    });

    it('reports no more on the last page', () => {
        const p = parsePagination(sp('page=3&pageSize=20'));
        const meta = buildPageMeta(45, p);
        expect(meta.hasMore).toBe(false);
    });

    it('always reports at least one page', () => {
        const p = parsePagination(sp('page=1&pageSize=20'));
        expect(buildPageMeta(0, p).totalPages).toBe(1);
    });
});

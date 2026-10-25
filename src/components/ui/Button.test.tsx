import React from 'react';
import { render, screen } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';

// next/link-ийг тэмдэглэгээтэй <a> болгож, аль замаар зурсныг шалгана.
const mocks = vi.hoisted(() => ({ link: vi.fn() }));
vi.mock('next/link', () => ({
    default: ({ href, className, children }: { href: string; className?: string; children: React.ReactNode }) => {
        mocks.link(href);
        return <a href={href} className={className} data-next-link="">{children}</a>;
    },
}));
import { Button, isApiHref } from './Button';

beforeEach(() => { vi.clearAllMocks(); });

it('renders an API route as a plain anchor so it is never prefetched or client-navigated', () => {
    render(<Button href="/api/marketing/facebook/ads/connect?shop_id=shop-1" variant="secondary">Meta Ads холбох</Button>);
    const link = screen.getByRole('link', { name: 'Meta Ads холбох' });
    expect(link).toHaveAttribute('href', '/api/marketing/facebook/ads/connect?shop_id=shop-1');
    expect(link).not.toHaveAttribute('data-next-link');
    expect(link.className).toContain('border-border-strong');
    expect(mocks.link).not.toHaveBeenCalled();
});

it('keeps next/link for app pages', () => {
    render(<Button href="/dashboard/weekly">Хурлын бэлтгэл</Button>);
    expect(screen.getByRole('link', { name: 'Хурлын бэлтгэл' })).toHaveAttribute('data-next-link');
    expect(mocks.link).toHaveBeenCalledWith('/dashboard/weekly');
});

it('treats only the /api/ prefix as an API route', () => {
    expect(isApiHref('/api/auth/facebook?shop_id=1')).toBe(true);
    expect(isApiHref('/apis')).toBe(false);
    expect(isApiHref('/marketing?tab=records')).toBe(false);
});

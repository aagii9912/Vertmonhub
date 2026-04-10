/**
 * BestSellersTable Component Tests
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BestSellersTable } from '../dashboard/BestSellersTable';

// Mock Next.js Image component
vi.mock('next/image', () => ({
    default: ({ src, alt, ...props }: { src: string; alt: string }) => (

        <img src={src} alt={alt} {...props} />
    ),
}));

import { vi } from 'vitest';

const mockProducts = [
    {
        id: '1',
        name: 'iPhone 15 Pro',
        image: 'https://example.com/iphone.jpg',
        quantity: 150,
        revenue: 450000000,
        rank: 1,
        percent: 100,
    },
    {
        id: '2',
        name: 'MacBook Air M3',
        image: 'https://example.com/macbook.jpg',
        quantity: 80,
        revenue: 280000000,
        rank: 2,
        percent: 62,
    },
    {
        id: '3',
        name: 'AirPods Pro',
        image: null,
        quantity: 200,
        revenue: 100000000,
        rank: 3,
        percent: 45,
    },
    {
        id: '4',
        name: 'iPad Pro',
        image: 'https://example.com/ipad.jpg',
        quantity: 50,
        revenue: 75000000,
        rank: 4,
        percent: 30,
    },
];

describe('BestSellersTable', () => {
    describe('Loading State', () => {
        it('shows loading skeletons when loading is true', () => {
            const { container } = render(
                <BestSellersTable products={[]} loading={true} />
            );
            const skeletons = container.querySelectorAll('.animate-pulse');
            expect(skeletons.length).toBe(5);
        });

        it('shows 5 skeleton rows', () => {
            const { container } = render(
                <BestSellersTable products={[]} loading={true} />
            );
            const rows = container.querySelectorAll('.animate-pulse');
            expect(rows).toHaveLength(5);
        });
    });

    describe('Empty State', () => {
        it('shows empty state when products array is empty', () => {
            render(<BestSellersTable products={[]} />);
            expect(screen.getByText('Борлуулалтын өгөгдөл байхгүй')).toBeInTheDocument();
        });

        it('shows Package icon in empty state', () => {
            const { container } = render(<BestSellersTable products={[]} />);
            expect(container.querySelector('svg')).toBeInTheDocument();
        });
    });

    describe('Product List Rendering', () => {
        it('renders all products', () => {
            render(<BestSellersTable products={mockProducts} />);
            expect(screen.getByText('iPhone 15 Pro')).toBeInTheDocument();
            expect(screen.getByText('MacBook Air M3')).toBeInTheDocument();
            expect(screen.getByText('AirPods Pro')).toBeInTheDocument();
            expect(screen.getByText('iPad Pro')).toBeInTheDocument();
        });

        it('renders product quantities', () => {
            render(<BestSellersTable products={mockProducts} />);
            expect(screen.getByText('150 ширхэг борлуулсан')).toBeInTheDocument();
            expect(screen.getByText('80 ширхэг борлуулсан')).toBeInTheDocument();
        });

        it('renders formatted revenue', () => {
            render(<BestSellersTable products={mockProducts} />);
            expect(screen.getByText('₮450,000,000')).toBeInTheDocument();
            expect(screen.getByText('₮280,000,000')).toBeInTheDocument();
        });
    });

    describe('Rank Styling', () => {
        it('applies gold styling for rank 1', () => {
            render(<BestSellersTable products={mockProducts} />);
            const rank1 = screen.getByText('1');
            expect(rank1.className).toContain('bg-yellow-100');
            expect(rank1.className).toContain('text-yellow-700');
        });

        it('applies silver styling for rank 2', () => {
            render(<BestSellersTable products={mockProducts} />);
            const rank2 = screen.getByText('2');
            expect(rank2.className).toContain('bg-[#1C1650]');
            expect(rank2.className).toContain('text-white/70');
        });

        it('applies bronze styling for rank 3', () => {
            render(<BestSellersTable products={mockProducts} />);
            const rank3 = screen.getByText('3');
            expect(rank3.className).toContain('bg-orange-100');
            expect(rank3.className).toContain('text-orange-700');
        });

        it('applies default styling for rank > 3', () => {
            render(<BestSellersTable products={mockProducts} />);
            const rank4 = screen.getByText('4');
            expect(rank4.className).toContain('bg-[#151040]');
            expect(rank4.className).toContain('text-white/60');
        });
    });

    describe('Product Images', () => {
        it('renders product image when available', () => {
            render(<BestSellersTable products={mockProducts} />);
            const images = screen.getAllByRole('img');
            expect(images.length).toBeGreaterThan(0);
            expect(images[0]).toHaveAttribute('src', 'https://example.com/iphone.jpg');
        });

        it('shows Package icon when image is null', () => {
            render(<BestSellersTable products={[mockProducts[2]]} />); // AirPods Pro with null image
            const { container } = render(<BestSellersTable products={[mockProducts[2]]} />);
            // Should show Package icon instead of image
            expect(container.querySelectorAll('svg').length).toBeGreaterThan(0);
        });
    });

    describe('Progress Bar', () => {
        it('renders progress bar for each product', () => {
            const { container } = render(<BestSellersTable products={mockProducts} />);
            const progressBars = container.querySelectorAll('[style*="width"]');
            expect(progressBars.length).toBeGreaterThan(0);
        });

        it('sets correct width based on percent', () => {
            const { container } = render(<BestSellersTable products={[mockProducts[0]]} />);
            const progressBar = container.querySelector('[style*="width: 100%"]');
            expect(progressBar).toBeInTheDocument();
        });
    });

    describe('Hover Effects', () => {
        it('has hover transition classes', () => {
            const { container } = render(<BestSellersTable products={mockProducts} />);
            const rows = container.querySelectorAll('.transition-colors');
            expect(rows.length).toBe(mockProducts.length);
        });
    });

    describe('Accessibility', () => {
        it('has alt text for images', () => {
            render(<BestSellersTable products={mockProducts} />);
            const images = screen.getAllByRole('img');
            images.forEach(img => {
                expect(img).toHaveAttribute('alt');
            });
        });
    });
});

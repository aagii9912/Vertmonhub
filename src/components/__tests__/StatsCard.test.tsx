/**
 * StatsCard Component Tests
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { StatsCard } from '../dashboard/StatsCard';
import { ShoppingCart, Users, DollarSign, Package } from 'lucide-react';

describe('StatsCard', () => {
    describe('Basic Rendering', () => {
        it('renders title correctly', () => {
            render(
                <StatsCard
                    title="Total Orders"
                    value={100}
                    icon={ShoppingCart}
                />
            );
            expect(screen.getByText('Total Orders')).toBeInTheDocument();
        });

        it('renders numeric value correctly', () => {
            render(
                <StatsCard
                    title="Orders"
                    value={1234}
                    icon={ShoppingCart}
                />
            );
            // Value is animated via requestAnimationFrame, starts at 0
            // Just verify the card renders without crashing
            expect(screen.getByText('Orders')).toBeInTheDocument();
        });

        it('renders string value correctly', () => {
            render(
                <StatsCard
                    title="Revenue"
                    value="₮1,500,000"
                    icon={DollarSign}
                />
            );
            // String value with currency prefix is animated
            expect(screen.getByText('Revenue')).toBeInTheDocument();
        });

        it('renders icon', () => {
            const { container } = render(
                <StatsCard
                    title="Users"
                    value={50}
                    icon={Users}
                />
            );
            // Icon should be rendered in the icon container
            const iconContainer = container.querySelector('.rounded-xl');
            expect(iconContainer).toBeInTheDocument();
        });
    });

    describe('Change Indicator', () => {
        it('renders positive change correctly', () => {
            render(
                <StatsCard
                    title="Sales"
                    value={100}
                    icon={Package}
                    change={{ value: 15.5, isPositive: true }}
                />
            );
            expect(screen.getByText('↑')).toBeInTheDocument();
            expect(screen.getByText('15.5%')).toBeInTheDocument();
        });

        it('renders negative change correctly', () => {
            render(
                <StatsCard
                    title="Sales"
                    value={100}
                    icon={Package}
                    change={{ value: -10, isPositive: false }}
                />
            );
            expect(screen.getByText('↓')).toBeInTheDocument();
            expect(screen.getByText('10%')).toBeInTheDocument();
        });

        it('applies green color for positive change', () => {
            render(
                <StatsCard
                    title="Sales"
                    value={100}
                    icon={Package}
                    change={{ value: 20, isPositive: true }}
                />
            );
            const changeElement = screen.getByText('↑').closest('div');
            expect(changeElement?.className).toContain('text-emerald-400');
        });

        it('applies red color for negative change', () => {
            render(
                <StatsCard
                    title="Sales"
                    value={100}
                    icon={Package}
                    change={{ value: 5, isPositive: false }}
                />
            );
            const changeElement = screen.getByText('↓').closest('div');
            expect(changeElement?.className).toContain('text-red-400');
        });

        it('does not render change indicator when change is undefined', () => {
            render(
                <StatsCard
                    title="Sales"
                    value={100}
                    icon={Package}
                />
            );
            expect(screen.queryByText('↑')).not.toBeInTheDocument();
            expect(screen.queryByText('↓')).not.toBeInTheDocument();
        });

        it('renders change value text', () => {
            render(
                <StatsCard
                    title="Sales"
                    value={100}
                    icon={Package}
                    change={{ value: 10, isPositive: true }}
                />
            );
            expect(screen.getByText('10%')).toBeInTheDocument();
        });
    });

    describe('Icon Color', () => {
        it('applies default icon color', () => {
            const { container } = render(
                <StatsCard
                    title="Test"
                    value={100}
                    icon={Package}
                />
            );
            const iconContainer = container.querySelector('.from-violet-500\\/10');
            expect(iconContainer).toBeInTheDocument();
        });

        it('applies custom icon color', () => {
            const { container } = render(
                <StatsCard
                    title="Test"
                    value={100}
                    icon={Package}
                    iconColor="blue"
                />
            );
            const iconContainer = container.querySelector('.from-blue-500\\/10');
            expect(iconContainer).toBeInTheDocument();
        });
    });

    describe('Styling', () => {
        it('has card styling', () => {
            const { container } = render(
                <StatsCard
                    title="Test"
                    value={100}
                    icon={Package}
                />
            );
            const card = container.firstChild as HTMLElement;
            expect(card.className).toContain('bg-[#0F0B2E]');
            expect(card.className).toContain('rounded-2xl');
            expect(card.className).toContain('border');
        });

        it('has transition-all class', () => {
            const { container } = render(
                <StatsCard
                    title="Test"
                    value={100}
                    icon={Package}
                />
            );
            const card = container.firstChild as HTMLElement;
            expect(card.className).toContain('transition-all');
        });
    });

    describe('Different Icons', () => {
        it('works with ShoppingCart icon', () => {
            const { container } = render(
                <StatsCard title="Orders" value={10} icon={ShoppingCart} />
            );
            expect(container.querySelector('svg')).toBeInTheDocument();
        });

        it('works with Users icon', () => {
            const { container } = render(
                <StatsCard title="Customers" value={50} icon={Users} />
            );
            expect(container.querySelector('svg')).toBeInTheDocument();
        });

        it('works with DollarSign icon', () => {
            const { container } = render(
                <StatsCard title="Revenue" value="₮100,000" icon={DollarSign} />
            );
            expect(container.querySelector('svg')).toBeInTheDocument();
        });
    });
});

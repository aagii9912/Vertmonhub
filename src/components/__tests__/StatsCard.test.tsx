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
                <StatsCard title="Orders" value={1234} icon={ShoppingCart} />
            );
            expect(screen.getByText('1234')).toBeInTheDocument();
        });

        it('renders string value correctly', () => {
            render(
                <StatsCard title="Revenue" value="₮1,500,000" icon={DollarSign} />
            );
            expect(screen.getByText('₮1,500,000')).toBeInTheDocument();
        });

        it('renders the icon container', () => {
            const { container } = render(
                <StatsCard title="Users" value={50} icon={Users} />
            );
            const iconContainer = container.querySelector('.rounded-xl');
            expect(iconContainer).toBeInTheDocument();
            expect(container.querySelector('svg')).toBeInTheDocument();
        });
    });

    describe('Change Indicator', () => {
        it('renders positive change with TrendingUp icon and percent value', () => {
            const { container } = render(
                <StatsCard
                    title="Sales"
                    value={100}
                    icon={Package}
                    change={{ value: 15.5, isPositive: true }}
                />
            );
            // Component renders TrendingUp/TrendingDown lucide icons (svg) instead of arrow text.
            expect(screen.getByText('15.5%')).toBeInTheDocument();
            expect(container.querySelector('.lucide-trending-up')).toBeInTheDocument();
        });

        it('renders negative change with TrendingDown icon and absolute percent', () => {
            const { container } = render(
                <StatsCard
                    title="Sales"
                    value={100}
                    icon={Package}
                    change={{ value: -10, isPositive: false }}
                />
            );
            expect(screen.getByText('10%')).toBeInTheDocument();
            expect(container.querySelector('.lucide-trending-down')).toBeInTheDocument();
        });

        it('applies emerald colour token for positive change', () => {
            render(
                <StatsCard
                    title="Sales"
                    value={100}
                    icon={Package}
                    change={{ value: 20, isPositive: true }}
                />
            );
            const pill = screen.getByText('20%').closest('div');
            expect(pill?.className).toContain('text-status-success');
        });

        it('applies red colour token for negative change', () => {
            render(
                <StatsCard
                    title="Sales"
                    value={100}
                    icon={Package}
                    change={{ value: 5, isPositive: false }}
                />
            );
            const pill = screen.getByText('5%').closest('div');
            expect(pill?.className).toContain('text-status-danger');
        });

        it('does not render change indicator when change is undefined', () => {
            const { container } = render(
                <StatsCard title="Sales" value={100} icon={Package} />
            );
            expect(container.querySelector('.lucide-trending-up')).not.toBeInTheDocument();
            expect(container.querySelector('.lucide-trending-down')).not.toBeInTheDocument();
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
        it('applies the default gold gradient', () => {
            const { container } = render(
                <StatsCard title="Test" value={100} icon={Package} />
            );
            // Default iconColor is 'bg-brand' → amber/orange gradient.
            const iconContainer = container.querySelector('.from-amber-400');
            expect(iconContainer).toBeInTheDocument();
        });

        it('applies the requested gradient when iconColor is set', () => {
            const { container } = render(
                <StatsCard
                    title="Test"
                    value={100}
                    icon={Package}
                    iconColor="bg-blue"
                />
            );
            const iconContainer = container.querySelector('.from-blue-400');
            expect(iconContainer).toBeInTheDocument();
        });
    });

    describe('Styling', () => {
        it('applies card styling tokens', () => {
            const { container } = render(
                <StatsCard title="Test" value={100} icon={Package} />
            );
            const card = container.firstChild as HTMLElement;
            expect(card.className).toContain('rounded-2xl');
            expect(card.className).toContain('border');
            expect(card.className).toContain('bg-gradient-to-br');
        });

        it('has transition-all class', () => {
            const { container } = render(
                <StatsCard title="Test" value={100} icon={Package} />
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

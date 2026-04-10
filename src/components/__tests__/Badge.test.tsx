/**
 * Badge Component Tests
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Badge, OrderStatusBadge } from '../ui/Badge';

describe('Badge', () => {
    describe('렌더링', () => {
        it('renders children correctly', () => {
            render(<Badge>Test Badge</Badge>);
            expect(screen.getByText('Test Badge')).toBeInTheDocument();
        });

        it('renders as a div element', () => {
            render(<Badge>Badge</Badge>);
            const badge = screen.getByText('Badge');
            expect(badge.tagName).toBe('DIV');
        });
    });

    describe('Variants', () => {
        it('applies default variant styling', () => {
            render(<Badge variant="default">Default</Badge>);
            const badge = screen.getByText('Default');
            expect(badge.className).toContain('bg-secondary');
        });

        it('applies success variant styling', () => {
            render(<Badge variant="success">Success</Badge>);
            const badge = screen.getByText('Success');
            expect(badge.className).toContain('bg-green-100');
            expect(badge.className).toContain('text-green-700');
        });

        it('applies warning variant styling', () => {
            render(<Badge variant="warning">Warning</Badge>);
            const badge = screen.getByText('Warning');
            expect(badge.className).toContain('bg-blue-100');
            expect(badge.className).toContain('text-blue-400');
        });

        it('applies destructive variant styling', () => {
            render(<Badge variant="destructive">Danger</Badge>);
            const badge = screen.getByText('Danger');
            expect(badge.className).toContain('bg-red-100');
            expect(badge.className).toContain('text-red-400');
        });

        it('applies info variant styling', () => {
            render(<Badge variant="info">Info</Badge>);
            const badge = screen.getByText('Info');
            expect(badge.className).toContain('bg-blue-100');
            expect(badge.className).toContain('text-blue-400');
        });

        it('applies vip variant styling', () => {
            render(<Badge variant="vip">VIP</Badge>);
            const badge = screen.getByText('VIP');
            expect(badge.className).toContain('bg-gradient-to-r');
            expect(badge.className).toContain('font-semibold');
        });
    });

    describe('Sizes', () => {
        it('applies default size', () => {
            render(<Badge>Small</Badge>);
            const badge = screen.getByText('Small');
            expect(badge.className).toContain('px-2.5');
            expect(badge.className).toContain('text-xs');
        });
    });

    describe('Custom className', () => {
        it('accepts custom className', () => {
            render(<Badge className="custom-class">Custom</Badge>);
            const badge = screen.getByText('Custom');
            expect(badge.className).toContain('custom-class');
        });
    });

    describe('Common styles', () => {
        it('has rounded-full class', () => {
            render(<Badge>Round</Badge>);
            const badge = screen.getByText('Round');
            expect(badge.className).toContain('rounded-full');
        });

        it('has font-medium class', () => {
            render(<Badge>Font</Badge>);
            const badge = screen.getByText('Font');
            expect(badge.className).toContain('font-medium');
        });

        it('has inline-flex class', () => {
            render(<Badge>Flex</Badge>);
            const badge = screen.getByText('Flex');
            expect(badge.className).toContain('inline-flex');
        });
    });
});

describe('OrderStatusBadge', () => {
    describe('Order Status Mapping', () => {
        it('renders pending status correctly', () => {
            render(<OrderStatusBadge status="pending" />);
            expect(screen.getByText('Хүлээгдэж буй')).toBeInTheDocument();
        });

        it('renders confirmed status correctly', () => {
            render(<OrderStatusBadge status="confirmed" />);
            expect(screen.getByText('Баталгаажсан')).toBeInTheDocument();
        });

        it('renders shipping status correctly', () => {
            render(<OrderStatusBadge status="shipping" />);
            expect(screen.getByText('Хүргэлтэнд')).toBeInTheDocument();
        });

        it('renders delivered status correctly', () => {
            render(<OrderStatusBadge status="delivered" />);
            expect(screen.getByText('Хүргэгдсэн')).toBeInTheDocument();
        });

        it('renders cancelled status correctly', () => {
            render(<OrderStatusBadge status="cancelled" />);
            expect(screen.getByText('Цуцлагдсан')).toBeInTheDocument();
        });

        it('renders unknown status as-is', () => {
            render(<OrderStatusBadge status="unknown_status" />);
            expect(screen.getByText('unknown_status')).toBeInTheDocument();
        });
    });

    describe('Variant Colors', () => {
        it('uses warning variant for pending', () => {
            render(<OrderStatusBadge status="pending" />);
            const badge = screen.getByText('Хүлээгдэж буй').closest('div');
            expect(badge?.className).toContain('bg-blue-100');
        });

        it('uses info variant for confirmed', () => {
            render(<OrderStatusBadge status="confirmed" />);
            const badge = screen.getByText('Баталгаажсан').closest('div');
            expect(badge?.className).toContain('bg-blue-100');
        });

        it('uses success variant for delivered', () => {
            render(<OrderStatusBadge status="delivered" />);
            const badge = screen.getByText('Хүргэгдсэн').closest('div');
            expect(badge?.className).toContain('bg-green-100');
        });

        it('uses destructive variant for cancelled', () => {
            render(<OrderStatusBadge status="cancelled" />);
            const badge = screen.getByText('Цуцлагдсан').closest('div');
            expect(badge?.className).toContain('bg-red-100');
        });
    });
});

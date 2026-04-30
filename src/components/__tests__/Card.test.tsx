/**
 * Card Component Tests
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Card, CardHeader, CardContent, CardTitle } from '../ui/Card';

describe('Card', () => {
    describe('Base Card', () => {
        it('renders children correctly', () => {
            render(<Card>Card Content</Card>);
            expect(screen.getByText('Card Content')).toBeInTheDocument();
        });

        it('applies default styles', () => {
            const { container } = render(<Card>Test</Card>);
            const card = container.firstChild as HTMLElement;
            expect(card.className).toContain('bg-surface');
            expect(card.className).toContain('rounded-2xl');
            expect(card.className).toContain('border');
        });

        it('applies hover styles when hover prop is true', () => {
            const { container } = render(<Card hover>Hoverable</Card>);
            const card = container.firstChild as HTMLElement;
            expect(card.className).toContain('hover:border-border-strong');
            expect(card.className).toContain('transition-all');
        });

        it('does not apply hover styles when hover prop is false', () => {
            const { container } = render(<Card hover={false}>No Hover</Card>);
            const card = container.firstChild as HTMLElement;
            expect(card.className).not.toContain('hover:border-border-strong');
        });

        it('accepts custom className', () => {
            const { container } = render(<Card className="custom-card">Custom</Card>);
            const card = container.firstChild as HTMLElement;
            expect(card.className).toContain('custom-card');
        });

        it('passes additional props', () => {
            render(<Card data-testid="card-test">Props Test</Card>);
            expect(screen.getByTestId('card-test')).toBeInTheDocument();
        });
    });

    describe('CardHeader', () => {
        it('renders children correctly', () => {
            render(<CardHeader>Header Content</CardHeader>);
            expect(screen.getByText('Header Content')).toBeInTheDocument();
        });

        it('applies default padding styles', () => {
            const { container } = render(<CardHeader>Header</CardHeader>);
            const header = container.firstChild as HTMLElement;
            expect(header.className).toContain('px-4');
            expect(header.className).toContain('py-4');
        });

        it('has border-bottom style', () => {
            const { container } = render(<CardHeader>Header</CardHeader>);
            const header = container.firstChild as HTMLElement;
            expect(header.className).toContain('border-b');
        });

        it('accepts custom className', () => {
            const { container } = render(<CardHeader className="custom-header">Custom Header</CardHeader>);
            const header = container.firstChild as HTMLElement;
            expect(header.className).toContain('custom-header');
        });
    });

    describe('CardContent', () => {
        it('renders children correctly', () => {
            render(<CardContent>Content</CardContent>);
            expect(screen.getByText('Content')).toBeInTheDocument();
        });

        it('applies default padding styles', () => {
            const { container } = render(<CardContent>Content</CardContent>);
            const content = container.firstChild as HTMLElement;
            expect(content.className).toContain('px-4');
            expect(content.className).toContain('py-4');
        });

        it('accepts custom className', () => {
            const { container } = render(<CardContent className="custom-content">Custom Content</CardContent>);
            const content = container.firstChild as HTMLElement;
            expect(content.className).toContain('custom-content');
        });
    });

    describe('CardTitle', () => {
        it('renders children correctly', () => {
            render(<CardTitle>Title</CardTitle>);
            expect(screen.getByText('Title')).toBeInTheDocument();
        });

        it('renders as h3 element', () => {
            render(<CardTitle>Heading</CardTitle>);
            expect(screen.getByRole('heading', { level: 3 })).toBeInTheDocument();
        });

        it('applies font styles', () => {
            render(<CardTitle>Title</CardTitle>);
            const title = screen.getByText('Title');
            expect(title.className).toContain('font-semibold');
            expect(title.className).toContain('text-foreground');
        });

        it('accepts custom className', () => {
            render(<CardTitle className="custom-title">Custom Title</CardTitle>);
            const title = screen.getByText('Custom Title');
            expect(title.className).toContain('custom-title');
        });
    });

    describe('Card Composition', () => {
        it('renders full card structure correctly', () => {
            render(
                <Card data-testid="full-card">
                    <CardHeader>
                        <CardTitle>Card Title</CardTitle>
                    </CardHeader>
                    <CardContent>Card Body</CardContent>
                </Card>
            );

            expect(screen.getByTestId('full-card')).toBeInTheDocument();
            expect(screen.getByRole('heading', { name: 'Card Title' })).toBeInTheDocument();
            expect(screen.getByText('Card Body')).toBeInTheDocument();
        });
    });
});

/**
 * Button Component Tests
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Button } from '../ui/Button';

// Mock next/link
vi.mock('next/link', () => ({
    default: ({ children, href }: { children: React.ReactNode; href: string }) => (
        <a href={href}>{children}</a>
    ),
}));

describe('Button', () => {
    describe('렌더링', () => {
        it('renders children correctly', () => {
            render(<Button>Click me</Button>);
            expect(screen.getByRole('button', { name: 'Click me' })).toBeInTheDocument();
        });

        it('renders as a button by default', () => {
            render(<Button>Test</Button>);
            expect(screen.getByRole('button')).toBeInTheDocument();
        });

        it('renders as a link when href is provided', () => {
            render(<Button href="/test">Link Button</Button>);
            expect(screen.getByRole('link', { name: 'Link Button' })).toBeInTheDocument();
            expect(screen.getByRole('link')).toHaveAttribute('href', '/test');
        });
    });

    describe('Variants', () => {
        it('applies primary variant by default', () => {
            render(<Button>Primary</Button>);
            const button = screen.getByRole('button');
            expect(button.className).toContain('bg-brand');
        });

        it('applies secondary variant', () => {
            render(<Button variant="secondary">Secondary</Button>);
            const button = screen.getByRole('button');
            expect(button.className).toContain('bg-surface');
        });

        it('applies danger variant', () => {
            render(<Button variant="danger">Danger</Button>);
            const button = screen.getByRole('button');
            expect(button.className).toContain('bg-destructive');
        });

        it('applies ghost variant', () => {
            render(<Button variant="ghost">Ghost</Button>);
            const button = screen.getByRole('button');
            expect(button.className).toContain('text-muted-foreground');
        });

        it('applies outline variant', () => {
            render(<Button variant="outline">Outline</Button>);
            const button = screen.getByRole('button');
            expect(button.className).toContain('border');
        });
    });

    describe('Sizes', () => {
        it('applies md size by default', () => {
            render(<Button>Medium</Button>);
            const button = screen.getByRole('button');
            expect(button.className).toContain('min-h-[40px]');
        });

        it('applies sm size', () => {
            render(<Button size="sm">Small</Button>);
            const button = screen.getByRole('button');
            expect(button.className).toContain('min-h-[36px]');
        });

        it('applies lg size', () => {
            render(<Button size="lg">Large</Button>);
            const button = screen.getByRole('button');
            expect(button.className).toContain('min-h-[44px]');
        });

        it('applies icon size', () => {
            render(<Button size="icon">🎯</Button>);
            const button = screen.getByRole('button');
            expect(button.className).toContain('h-10');
            expect(button.className).toContain('w-10');
        });
    });

    describe('Loading State', () => {
        it('shows loading spinner when isLoading is true', () => {
            render(<Button isLoading>Loading</Button>);
            const button = screen.getByRole('button');
            expect(button.querySelector('svg')).toBeInTheDocument();
        });

        it('disables button when isLoading is true', () => {
            render(<Button isLoading>Loading</Button>);
            expect(screen.getByRole('button')).toBeDisabled();
        });

        it('shows loading spinner in link button', () => {
            render(<Button href="/test" isLoading>Link Loading</Button>);
            const link = screen.getByRole('link');
            expect(link.querySelector('svg')).toBeInTheDocument();
        });
    });

    describe('Disabled State', () => {
        it('is disabled when disabled prop is true', () => {
            render(<Button disabled>Disabled</Button>);
            expect(screen.getByRole('button')).toBeDisabled();
        });

        it('applies disabled styles', () => {
            render(<Button disabled>Disabled</Button>);
            const button = screen.getByRole('button');
            expect(button.className).toContain('disabled:opacity-50');
        });
    });

    describe('Interactions', () => {
        it('calls onClick when clicked', () => {
            const handleClick = vi.fn();
            render(<Button onClick={handleClick}>Click</Button>);
            fireEvent.click(screen.getByRole('button'));
            expect(handleClick).toHaveBeenCalledTimes(1);
        });

        it('does not call onClick when disabled', () => {
            const handleClick = vi.fn();
            render(<Button onClick={handleClick} disabled>Click</Button>);
            fireEvent.click(screen.getByRole('button'));
            expect(handleClick).not.toHaveBeenCalled();
        });

        it('does not call onClick when loading', () => {
            const handleClick = vi.fn();
            render(<Button onClick={handleClick} isLoading>Click</Button>);
            fireEvent.click(screen.getByRole('button'));
            expect(handleClick).not.toHaveBeenCalled();
        });
    });

    describe('Custom className', () => {
        it('accepts custom className', () => {
            render(<Button className="custom-class">Custom</Button>);
            const button = screen.getByRole('button');
            expect(button.className).toContain('custom-class');
        });
    });
});

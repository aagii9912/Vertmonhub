'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/utils';
import { BrandMark } from './BrandMark';

const NAV_LINKS = [
    { href: '#feature', label: 'Боломжууд' },
    { href: '#journey', label: 'Үйл явц' },
    { href: '#proof', label: 'Үр дүн' },
];

/**
 * Sticky дээд навигаци. Scroll хийхэд backdrop + border тодорно.
 */
export function LandingNav() {
    const [scrolled, setScrolled] = useState(false);

    useEffect(() => {
        const onScroll = () => setScrolled(window.scrollY > 8);
        onScroll();
        window.addEventListener('scroll', onScroll, { passive: true });
        return () => window.removeEventListener('scroll', onScroll);
    }, []);

    return (
        <header
            className={cn(
                'fixed inset-x-0 top-0 z-50 transition-colors duration-300',
                scrolled
                    ? 'border-b border-border bg-background/80 backdrop-blur-xl'
                    : 'border-b border-transparent bg-transparent',
            )}
        >
            <nav
                aria-label="Үндсэн цэс"
                className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5 sm:px-6"
            >
                <Link
                    href="/"
                    className="rounded-md outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                    aria-label="Vertmon Hub нүүр хуудас"
                >
                    <BrandMark />
                </Link>

                <div className="hidden items-center gap-1 md:flex">
                    {NAV_LINKS.map((link) => (
                        <a
                            key={link.href}
                            href={link.href}
                            className="rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:text-foreground outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                        >
                            {link.label}
                        </a>
                    ))}
                </div>

                <div className="flex items-center gap-2">
                    <Button href="/auth/login" variant="ghost" size="sm" className="hidden sm:inline-flex">
                        Нэвтрэх
                    </Button>
                    <Button href="/auth/register" variant="primary" size="sm">
                        Үнэгүй эхлэх
                        <ArrowRight className="h-4 w-4" aria-hidden="true" />
                    </Button>
                </div>
            </nav>
        </header>
    );
}

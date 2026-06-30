import Link from 'next/link';
import { BrandMark } from './BrandMark';

const LINKS = [
    { href: '/privacy', label: 'Нууцлалын бодлого' },
    { href: '/terms', label: 'Үйлчилгээний нөхцөл' },
    { href: '/help', label: 'Тусламж' },
];

/**
 * Public footer — лого, эрх зүйн холбоосууд, copyright.
 */
export function LandingFooter() {
    const year = new Date().getFullYear();

    return (
        <footer className="border-t border-border px-5 py-12 sm:px-6">
            <div className="mx-auto flex max-w-6xl flex-col gap-8 sm:flex-row sm:items-center sm:justify-between">
                <div className="space-y-3">
                    <BrandMark />
                    <p className="max-w-xs text-sm text-muted-foreground">
                        Монголын үл хөдлөхийн AI борлуулалт ба CRM платформ.
                    </p>
                </div>

                <nav aria-label="Хөл цэс">
                    <ul className="flex flex-wrap gap-x-6 gap-y-2">
                        {LINKS.map((link) => (
                            <li key={link.href}>
                                <Link
                                    href={link.href}
                                    className="rounded-md text-sm text-muted-foreground transition-colors hover:text-foreground outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                                >
                                    {link.label}
                                </Link>
                            </li>
                        ))}
                    </ul>
                </nav>
            </div>

            <div className="mx-auto mt-10 max-w-6xl border-t border-border pt-6">
                <p className="text-2xs text-muted-foreground">© {year} Vertmon Hub. Бүх эрх хуулиар хамгаалагдсан.</p>
            </div>
        </footer>
    );
}

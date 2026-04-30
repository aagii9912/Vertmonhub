'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
    LayoutDashboard,
    Building2,
    BarChart3,
    Menu,
    X,
    Users,
    Settings,
    Bot,
    FileText,
    Eye,
    TrendingUp,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const primaryNavItems = [
    { name: 'Нүүр', href: '/dashboard', icon: LayoutDashboard },
    { name: 'Үл хөдлөх', href: '/dashboard/properties', icon: Building2 },
    { name: 'Тайлан', href: '/dashboard/reports', icon: BarChart3 },
];

const secondaryNavItems = [
    { name: 'Лийд', href: '/dashboard/leads', icon: Users },
    { name: 'Үзлэг', href: '/dashboard/viewings', icon: Eye },
    { name: 'Гэрээ', href: '/dashboard/contracts', icon: FileText },
    { name: 'Маркетинг', href: '/dashboard/marketing-roi', icon: TrendingUp },
    { name: 'AI Тохиргоо', href: '/dashboard/ai-settings', icon: Bot },
    { name: 'Тохиргоо', href: '/dashboard/settings', icon: Settings },
];

export function MobileNav() {
    const pathname = usePathname();
    const [showMore, setShowMore] = useState(false);

    const isActiveItem = (href: string) => {
        return pathname === href || (href !== '/dashboard' && pathname.startsWith(href));
    };

    const isMoreActive = secondaryNavItems.some((item) => isActiveItem(item.href));

    return (
        <>
            {showMore && (
                <div className="fixed inset-0 z-40 md:hidden" onClick={() => setShowMore(false)}>
                    <div className="absolute inset-0 bg-foreground/40 backdrop-blur-sm" />
                    <div
                        className="absolute bottom-[72px] left-4 right-4 bg-surface rounded-xl shadow-xl border border-border overflow-hidden"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="p-2">
                            <div className="flex items-center justify-between px-4 py-3 border-b border-border/60">
                                <span className="heading-section text-sm text-foreground">Бусад</span>
                                <button
                                    onClick={() => setShowMore(false)}
                                    className="p-2 rounded-full hover:bg-surface-2"
                                >
                                    <X className="w-5 h-5 text-muted-foreground" />
                                </button>
                            </div>
                            <div className="grid grid-cols-3 gap-2 p-3">
                                {secondaryNavItems.map((item) => (
                                    <Link
                                        key={item.name}
                                        href={item.href}
                                        onClick={() => setShowMore(false)}
                                        className={cn(
                                            'flex flex-col items-center gap-2 p-4 rounded-md transition-colors',
                                            isActiveItem(item.href)
                                                ? 'bg-brand-soft text-brand-strong'
                                                : 'hover:bg-surface-2 text-muted-foreground',
                                        )}
                                    >
                                        <item.icon className="w-6 h-6" />
                                        <span className="text-xs font-medium text-center">{item.name}</span>
                                    </Link>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Bottom Navigation */}
            <nav className="fixed bottom-0 left-0 right-0 z-50 bg-surface border-t border-border pb-safe block md:hidden">
                <ul className="flex justify-around items-stretch h-[72px]">
                    {primaryNavItems.map((item) => {
                        const isActive = isActiveItem(item.href);
                        return (
                            <li key={item.name} className="flex-1">
                                <Link
                                    href={item.href}
                                    className={cn(
                                        'flex flex-col items-center justify-center w-full h-full gap-1.5 transition-colors active:scale-95',
                                        isActive ? 'text-brand' : 'text-muted-foreground',
                                    )}
                                >
                                    <div className={cn('p-2 rounded-md transition-colors', isActive && 'bg-brand-soft')}>
                                        <item.icon className="w-6 h-6" strokeWidth={isActive ? 2.25 : 1.75} />
                                    </div>
                                    <span className="text-xs font-medium">{item.name}</span>
                                </Link>
                            </li>
                        );
                    })}

                    <li className="flex-1">
                        <button
                            onClick={() => setShowMore(!showMore)}
                            className={cn(
                                'flex flex-col items-center justify-center w-full h-full gap-1.5 transition-colors active:scale-95',
                                showMore || isMoreActive ? 'text-brand' : 'text-muted-foreground',
                            )}
                        >
                            <div
                                className={cn(
                                    'p-2 rounded-md transition-colors',
                                    (showMore || isMoreActive) && 'bg-brand-soft',
                                )}
                            >
                                <Menu className="w-6 h-6" strokeWidth={showMore || isMoreActive ? 2.25 : 1.75} />
                            </div>
                            <span className="text-xs font-medium">Бусад</span>
                        </button>
                    </li>
                </ul>
            </nav>
        </>
    );
}

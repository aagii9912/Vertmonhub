'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Menu, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { canAccessModule, canAccessModuleDynamic } from '@/lib/rbac';
import { BOTTOM_ITEMS, isNavItemActive, type NavItem } from '@/lib/navigation/workspaces';
import { useActiveWorkspace } from '@/lib/navigation/useActiveWorkspace';

interface MoreGroup {
    title: string;
    items: NavItem[];
}

export function MobileNav() {
    const pathname = usePathname();
    const { user } = useAuth();
    const [showMore, setShowMore] = useState(false);
    const active = useActiveWorkspace();

    const canSee = (module: string): boolean => {
        if (module === '') return true;
        if (user?.permissions) return canAccessModuleDynamic(user.permissions, module);
        return canAccessModule(user?.role || 'viewer', module);
    };

    // Идэвхтэй workspace-ийн үндсэн 3 цэс
    const primaryItems = active.mobilePrimary.filter((i) => canSee(i.module));
    const primaryHrefs = new Set(active.mobilePrimary.map((i) => i.href));

    // "Бусад" — хэсгээр бүлэглэсэн (БОРЛУУЛАЛТ / САНХҮҮ / АНАЛИТИК) + нийтлэг доод цэс
    const moreGroups: MoreGroup[] = [
        ...active.sections
            .map((s) => ({
                title: s.title,
                items: s.items.filter((i) => !primaryHrefs.has(i.href) && canSee(i.module)),
            }))
            .filter((g) => g.items.length > 0),
        ...(() => {
            const bottom = BOTTOM_ITEMS.filter((i) => canSee(i.module));
            return bottom.length ? [{ title: 'ЕРӨНХИЙ', items: bottom }] : [];
        })(),
    ];

    const isActiveItem = (href: string) =>
        isNavItemActive(pathname || '', href, { home: active.home });

    const isMoreActive = moreGroups.some((g) => g.items.some((item) => isActiveItem(item.href)));

    return (
        <>
            {showMore && (
                <div className="fixed inset-0 z-40 md:hidden" onClick={() => setShowMore(false)}>
                    <div className="absolute inset-0 bg-foreground/40 backdrop-blur-sm" />
                    <div
                        className="absolute bottom-[72px] left-4 right-4 max-h-[70vh] overflow-y-auto bg-surface rounded-2xl shadow-xl border border-border"
                        onClick={(e) => e.stopPropagation()}
                        role="dialog"
                        aria-label="Бусад цэс"
                    >
                        <div className="sticky top-0 flex items-center justify-between px-4 py-3 border-b border-border/60 bg-surface">
                            <span className="heading-section text-sm text-foreground">Бусад</span>
                            <button
                                onClick={() => setShowMore(false)}
                                aria-label="Хаах"
                                className="p-2 rounded-full hover:bg-surface-2"
                            >
                                <X className="w-5 h-5 text-muted-foreground" />
                            </button>
                        </div>
                        <div className="p-3 space-y-4">
                            {moreGroups.map((group) => (
                                <div key={group.title}>
                                    <p className="font-mono text-2xs font-medium tracking-[0.2em] text-muted-foreground/70 px-1 mb-2">
                                        {group.title}
                                    </p>
                                    <div className="grid grid-cols-3 gap-2">
                                        {group.items.map((item) => (
                                            <Link
                                                key={item.href}
                                                href={item.href}
                                                onClick={() => setShowMore(false)}
                                                aria-current={isActiveItem(item.href) ? 'page' : undefined}
                                                className={cn(
                                                    'flex flex-col items-center gap-2 p-3 rounded-md transition-colors',
                                                    isActiveItem(item.href)
                                                        ? 'bg-brand-soft text-brand-strong'
                                                        : 'hover:bg-surface-2 text-muted-foreground',
                                                )}
                                            >
                                                <item.icon className="w-6 h-6" />
                                                <span className="text-xs font-medium text-center leading-tight">{item.name}</span>
                                            </Link>
                                        ))}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {/* Доод навигаци */}
            <nav className="fixed bottom-0 left-0 right-0 z-50 bg-surface border-t border-border pb-safe block md:hidden">
                <ul className="flex justify-around items-stretch h-[72px]">
                    {primaryItems.map((item) => {
                        const itemActive = isActiveItem(item.href);
                        return (
                            <li key={item.href} className="flex-1">
                                <Link
                                    href={item.href}
                                    className={cn(
                                        'flex flex-col items-center justify-center w-full h-full gap-1.5 transition-colors active:scale-95',
                                        itemActive ? 'text-brand' : 'text-muted-foreground',
                                    )}
                                >
                                    <div className={cn('p-2 rounded-md transition-colors', itemActive && 'bg-brand-soft')}>
                                        <item.icon className="w-6 h-6" strokeWidth={itemActive ? 2.25 : 1.75} />
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

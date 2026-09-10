'use client';

import React, { useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { MoreHorizontal, Plus, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { canAccessModule, canAccessModuleDynamic } from '@/lib/rbac';
import {
    MOBILE_TABS,
    PRIMARY_NAV,
    BOTTOM_NAV,
    SECONDARY_ROUTES,
    isNavItemActive,
    type NavItem,
} from '@/lib/navigation/nav';
import { useNavCounts } from '@/hooks/useNavCounts';
import { openQuickCreate } from '@/lib/navigation/commandPalette';

/**
 * Гар утасны доод таб: Өнөөдөр · Лид · [+] · Уулзалт · Бусад.
 *
 * v1-д 13 цэсний 10 нь «Бусад» доор нуугдаж, төв дэх түргэн үйлдэл байгаагүй.
 * v2-т голын «+» нь талбай дээр лид/уулзалт бүртгэх гол зам болно.
 */
export function MobileNav() {
    const pathname = usePathname() || '';
    const [sheetOpen, setSheetOpen] = useState(false);
    const { user } = useAuth();
    const counts = useNavCounts();

    const userRole = user?.role || 'viewer';
    const userPermissions = user?.permissions;

    const can = useMemo(() => {
        return (module: string) => {
            if (!module) return true;
            return userPermissions
                ? canAccessModuleDynamic(userPermissions, module)
                : canAccessModule(userRole, module);
        };
    }, [userRole, userPermissions]);

    const tabs = MOBILE_TABS.filter((t) => can(t.module));
    const rest = [
        ...PRIMARY_NAV.filter((i) => !MOBILE_TABS.includes(i)),
        ...BOTTOM_NAV,
    ].filter((i) => can(i.module));
    const secondary = SECONDARY_ROUTES.filter((r) => can(r.module));

    const moreActive = rest.some((i) => isNavItemActive(i, pathname));

    return (
        <>
            <nav
                className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-surface md:hidden"
                style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
                aria-label="Гар утасны цэс"
            >
                <div className="flex h-14 items-stretch">
                    {tabs.slice(0, 2).map((item) => (
                        <MobileTab key={item.href} item={item} pathname={pathname} count={item.countKey ? counts[item.countKey] : undefined} />
                    ))}

                    {/* Голын түргэн үйлдэл */}
                    <div className="relative flex w-[72px] shrink-0 items-start justify-center">
                        <button
                            type="button"
                            onClick={() => openQuickCreate('lead')}
                            className="-mt-5 flex h-11 w-11 items-center justify-center rounded-full bg-brand text-brand-fg shadow-lg transition-transform active:scale-95 focus-ring"
                            aria-label="Шинэ лид бүртгэх"
                        >
                            <Plus className="h-5 w-5" strokeWidth={2.25} />
                        </button>
                    </div>

                    {tabs.slice(2).map((item) => (
                        <MobileTab key={item.href} item={item} pathname={pathname} count={item.countKey ? counts[item.countKey] : undefined} />
                    ))}

                    <button
                        type="button"
                        onClick={() => setSheetOpen(true)}
                        className={cn(
                            'flex flex-1 flex-col items-center justify-center gap-0.5 transition-colors focus-ring',
                            moreActive ? 'text-brand' : 'text-muted-foreground',
                        )}
                        aria-label="Бусад цэс"
                    >
                        <MoreHorizontal className="h-5 w-5" strokeWidth={1.75} />
                        <span className="text-[11px] font-medium">Бусад</span>
                    </button>
                </div>
            </nav>

            {sheetOpen && (
                <div className="fixed inset-0 z-50 md:hidden" role="dialog" aria-modal="true" aria-label="Бусад цэс">
                    <button
                        type="button"
                        className="absolute inset-0 bg-[rgba(21,24,30,0.4)]"
                        onClick={() => setSheetOpen(false)}
                        aria-label="Хаах"
                    />
                    <div
                        className="absolute inset-x-0 bottom-0 max-h-[82vh] overflow-y-auto rounded-t-xl border-t border-border bg-surface"
                        style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 12px)' }}
                    >
                        <div className="sticky top-0 flex items-center gap-3 border-b border-border bg-surface px-4 py-3">
                            <h2 className="text-[15px] font-semibold text-foreground">Бусад</h2>
                            <button
                                type="button"
                                onClick={() => setSheetOpen(false)}
                                className="ml-auto flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground hover:bg-surface-2 hover:text-foreground focus-ring"
                                aria-label="Хаах"
                            >
                                <X className="h-4.5 w-4.5" />
                            </button>
                        </div>

                        <div className="flex flex-col gap-1 p-2">
                            {rest.map((item) => {
                                const Icon = item.icon;
                                const active = isNavItemActive(item, pathname);
                                return (
                                    <Link
                                        key={item.href}
                                        href={item.href}
                                        onClick={() => setSheetOpen(false)}
                                        className={cn(
                                            'flex min-h-11 items-center gap-3 rounded-md px-3 text-[14px] font-medium transition-colors',
                                            active ? 'bg-brand-soft text-brand' : 'text-fg-2 active:bg-surface-2',
                                        )}
                                    >
                                        <Icon className="h-[18px] w-[18px] shrink-0" strokeWidth={1.75} />
                                        {item.name}
                                    </Link>
                                );
                            })}
                        </div>

                        {secondary.length > 0 && (
                            <div className="border-t border-border p-2">
                                <div className="px-3 pb-1 pt-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                                    Нэмэлт
                                </div>
                                <div className="flex flex-col gap-1">
                                    {secondary.map((item) => {
                                        const Icon = item.icon;
                                        return (
                                            <Link
                                                key={item.href + item.name}
                                                href={item.href}
                                                onClick={() => setSheetOpen(false)}
                                                className="flex min-h-11 items-center gap-3 rounded-md px-3 text-[14px] text-fg-2 transition-colors active:bg-surface-2"
                                            >
                                                <Icon className="h-[18px] w-[18px] shrink-0 text-muted-foreground" strokeWidth={1.75} />
                                                {item.name}
                                            </Link>
                                        );
                                    })}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </>
    );
}

function MobileTab({ item, pathname, count }: { item: NavItem; pathname: string; count?: number }) {
    const active = isNavItemActive(item, pathname);
    const Icon = item.icon;

    return (
        <Link
            href={item.href}
            aria-current={active ? 'page' : undefined}
            className={cn(
                'relative flex flex-1 flex-col items-center justify-center gap-0.5 transition-colors focus-ring',
                active ? 'text-brand' : 'text-muted-foreground',
            )}
        >
            <span className="relative">
                <Icon className="h-5 w-5" strokeWidth={1.75} />
                {typeof count === 'number' && count > 0 && (
                    <span className="absolute -right-1.5 -top-1 h-1.5 w-1.5 rounded-full bg-status-danger" />
                )}
            </span>
            <span className="text-[11px] font-medium">{item.name}</span>
        </Link>
    );
}

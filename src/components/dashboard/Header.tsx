'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import { LogOut, Settings, ChevronDown, Search } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { NotificationButton } from '@/components/NotificationButton';
import { ShopSwitcher } from '@/components/dashboard/ShopSwitcher';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { getNavTitle, getBreadcrumb } from '@/lib/navigation/workspaces';
import { OPEN_COMMAND_EVENT } from '@/components/dashboard/CommandPalette';
import {
    Breadcrumb,
    BreadcrumbList,
    BreadcrumbItem,
    BreadcrumbLink,
    BreadcrumbPage,
    BreadcrumbSeparator,
} from '@/components/ui/Breadcrumb';

export function Header() {
    const router = useRouter();
    const pathname = usePathname();
    const { user, shop, shops, signOut } = useAuth();
    const [showDropdown, setShowDropdown] = useState(false);
    const [loggingOut, setLoggingOut] = useState(false);

    const handleLogout = async () => {
        setLoggingOut(true);
        try {
            if (typeof window !== 'undefined' && 'caches' in window) {
                const cacheNames = await caches.keys();
                await Promise.all(cacheNames.map((name) => caches.delete(name)));
            }
            await signOut();
        } catch (error) {
            console.error('Logout error:', error);
            if (typeof window !== 'undefined') window.location.href = '/auth/login';
        }
    };

    const openCommand = () => {
        if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent(OPEN_COMMAND_EVENT));
        }
    };

    const fullName = user?.fullName || user?.email?.split('@')[0] || 'User';
    const firstName = fullName.split(' ')[0];
    const displayEmail = user?.email || '';

    const path = pathname || '';
    const isRoot = path === '/dashboard' || path === '/dashboard/';
    const crumbs = getBreadcrumb(path);

    return (
        <header className="h-14 md:h-16 bg-surface border-b border-border sticky top-0 z-40 grid grid-cols-[1fr_auto_1fr] items-center gap-2 px-4 md:px-6">
            {/* Зүүн: breadcrumb / мэндчилгээ */}
            <div className="min-w-0 justify-self-start">
                {/* Том дэлгэц: breadcrumb эсвэл мэндчилгээ */}
                <div className="hidden sm:block min-w-0">
                    {isRoot ? (
                        <>
                            <h1 className="heading-display text-base md:text-lg text-foreground truncate">
                                Сайн байна уу, {fullName}!
                            </h1>
                            {shop && <p className="text-xs text-muted-foreground truncate">{shop.name}</p>}
                        </>
                    ) : (
                        <Breadcrumb>
                            <BreadcrumbList>
                                {crumbs.map((c, i) => {
                                    const last = i === crumbs.length - 1;
                                    return (
                                        <React.Fragment key={i}>
                                            <BreadcrumbItem>
                                                {last || !c.href ? (
                                                    <BreadcrumbPage className="truncate max-w-[40vw]">{c.label}</BreadcrumbPage>
                                                ) : (
                                                    <BreadcrumbLink asChild>
                                                        <Link href={c.href}>{c.label}</Link>
                                                    </BreadcrumbLink>
                                                )}
                                            </BreadcrumbItem>
                                            {!last && <BreadcrumbSeparator />}
                                        </React.Fragment>
                                    );
                                })}
                            </BreadcrumbList>
                        </Breadcrumb>
                    )}
                </div>
                {/* Жижиг дэлгэц: одоогийн хуудасны нэр */}
                <h1 className="sm:hidden heading-section text-base text-foreground truncate">
                    {isRoot ? 'Нүүр' : getNavTitle(path)}
                </h1>
            </div>

            {/* Төв: ⌘K хайлт */}
            <div className="justify-self-center">
                <button
                    onClick={openCommand}
                    aria-label="Хайх (⌘K)"
                    className="flex items-center gap-2 rounded-md border border-border bg-surface-2/60 hover:bg-surface-2 text-muted-foreground transition-colors px-2.5 h-9 md:w-64 md:justify-between focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                >
                    <span className="flex items-center gap-2 min-w-0">
                        <Search className="w-4 h-4 shrink-0" />
                        <span className="hidden md:inline truncate text-sm">Хайх эсвэл командлах...</span>
                    </span>
                    <kbd className="hidden md:inline-flex items-center gap-0.5 rounded border border-border bg-surface px-1.5 font-mono text-2xs text-muted-foreground">
                        ⌘K
                    </kbd>
                </button>
            </div>

            {/* Баруун: Үйлдлүүд */}
            <div className="justify-self-end flex items-center gap-2 md:gap-3">
                {shops.length > 1 && <ShopSwitcher />}

                <div className="hidden sm:block">
                    <LanguageSwitcher />
                </div>

                <NotificationButton />

                {/* Профайл цэс */}
                <div className="relative">
                    <button
                        onClick={() => setShowDropdown(!showDropdown)}
                        className="flex items-center gap-2 hover:bg-surface-2 rounded-md transition-colors p-1.5 md:px-3 md:py-2"
                        aria-label="Профайл цэс"
                        aria-expanded={showDropdown}
                        aria-haspopup="menu"
                    >
                        <div className="w-8 h-8 md:w-9 md:h-9 rounded-full bg-foreground text-background flex items-center justify-center font-medium text-sm">
                            {firstName[0]?.toUpperCase()}
                        </div>
                        <ChevronDown className="w-4 h-4 text-muted-foreground/60 hidden md:block" />
                    </button>

                    {/* Унждаг цэс */}
                    {showDropdown && (
                        <>
                            <div
                                className="fixed inset-0 z-40"
                                onClick={() => setShowDropdown(false)}
                            />
                            <div
                                className="absolute right-0 top-full mt-2 w-64 bg-surface rounded-xl shadow-lg border border-border z-50 overflow-hidden"
                                role="menu"
                                aria-label="Профайл цэс"
                            >
                                <div className="p-4 border-b border-border/60 bg-surface-2">
                                    <p className="font-medium text-foreground truncate">{fullName}</p>
                                    <p className="text-sm text-muted-foreground truncate">{displayEmail}</p>
                                </div>
                                <div className="p-2 space-y-1">
                                    <button
                                        onClick={() => {
                                            setShowDropdown(false);
                                            router.push('/dashboard/settings');
                                        }}
                                        className="w-full flex items-center gap-3 px-3 py-2.5 text-sm text-foreground hover:bg-surface-2 rounded-md transition-colors"
                                        role="menuitem"
                                    >
                                        <Settings className="w-4 h-4 text-muted-foreground/70" />
                                        Тохиргоо
                                    </button>
                                    <button
                                        onClick={handleLogout}
                                        disabled={loggingOut}
                                        className="w-full flex items-center gap-3 px-3 py-2.5 text-sm text-status-danger hover:bg-status-danger-soft rounded-md transition-colors"
                                        role="menuitem"
                                    >
                                        <LogOut className="w-4 h-4" />
                                        {loggingOut ? 'Гарч байна...' : 'Гарах'}
                                    </button>
                                </div>
                            </div>
                        </>
                    )}
                </div>
            </div>
        </header>
    );
}

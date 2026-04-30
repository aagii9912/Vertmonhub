'use client';

import React, { useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { LogOut, Settings, ChevronDown } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { NotificationButton } from '@/components/NotificationButton';
import { ShopSwitcher } from '@/components/dashboard/ShopSwitcher';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';

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

    const fullName = user?.fullName || user?.email?.split('@')[0] || 'User';
    const firstName = fullName.split(' ')[0];
    const displayEmail = user?.email || '';

    const getHeaderTitle = () => {
        const path = pathname || '';
        if (path === '/dashboard' || path === '/dashboard/') {
            return (
                <h1 className="heading-section text-base md:text-lg text-foreground truncate">
                    <span className="hidden sm:inline">Сайн байна уу, {fullName}!</span>
                    <span className="sm:hidden">Сайн уу, {firstName}!</span>
                </h1>
            );
        }

        let title = 'Dashboard';
        if (path.includes('/pipeline')) title = 'Pipeline';
        else if (path.includes('/leads')) title = 'Лийд';
        else if (path.includes('/orders')) title = 'Захиалга';
        else if (path.includes('/products')) title = 'Бүтээгдэхүүн';
        else if (path.includes('/customers')) title = 'Харилцагч';
        else if (path.includes('/reports')) title = 'Тайлан';
        else if (path.includes('/settings')) title = 'Тохиргоо';
        else if (path.includes('/inbox')) title = 'Идэвхтэй Сагс';
        else if (path.includes('/viewings')) title = 'Үзлэг';
        else if (path.includes('/contracts')) title = 'Гэрээ';
        else if (path.includes('/marketing-roi')) title = 'Маркетинг ROI';
        else if (path.includes('/ai-settings')) title = 'AI Тохиргоо';
        else if (path.includes('/ai-assistant')) title = 'AI Туслах';
        else if (path.includes('/surveys')) title = 'Судалгаа';
        else if (path.includes('/subscription')) title = 'Төлбөр & Эрх';

        return <h1 className="heading-section text-base md:text-lg text-foreground">{title}</h1>;
    };

    return (
        <header className="h-14 md:h-16 bg-surface border-b border-border flex items-center justify-between px-4 md:px-6 sticky top-0 z-40">
            {/* Left: Title or Greeting */}
            <div className="flex-1 min-w-0">
                {getHeaderTitle()}
                {shop && (pathname === '/dashboard' || pathname === '/dashboard/') && (
                    <p className="text-xs text-muted-foreground truncate hidden sm:block">
                        {shop.name}
                    </p>
                )}
            </div>

            {/* Right: Actions */}
            <div className="flex items-center gap-2 md:gap-3">
                {shops.length > 1 && <ShopSwitcher />}

                <LanguageSwitcher />

                <NotificationButton />

                {/* Profile Dropdown */}
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

                    {/* Dropdown Menu */}
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

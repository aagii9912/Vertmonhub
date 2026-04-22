'use client';

import React, { useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { User, LogOut, Settings, ChevronDown } from 'lucide-react';
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
                await Promise.all(cacheNames.map(name => caches.delete(name)));
            }
            await signOut();
        } catch (error) {
            console.error('Logout error:', error);
            if (typeof window !== 'undefined') window.location.href = '/auth/login';
        }
    };

    // Get first name for mobile, full name for desktop
    const fullName = user?.fullName || user?.email?.split('@')[0] || 'User';
    const firstName = fullName.split(' ')[0];
    const displayEmail = user?.email || '';

    // Determine header title based on current path
    const getHeaderTitle = () => {
        const path = pathname || '';
        if (path === '/dashboard' || path === '/dashboard/') {
            return (
                <h1 className="text-base md:text-lg font-semibold text-gray-900 truncate">
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

        return (
            <h1 className="text-lg font-bold text-gray-900">
                {title}
            </h1>
        );
    };

    return (
        <header className="h-14 md:h-16 bg-white border-b border-gray-200 flex items-center justify-between px-4 md:px-6 sticky top-0 z-40">
            {/* Left: Title or Greeting */}
            <div className="flex-1 min-w-0">
                {getHeaderTitle()}
                {shop && (pathname === '/dashboard' || pathname === '/dashboard/') && (
                    <p className="text-xs text-gray-500 truncate hidden sm:block">
                        {shop.name}
                    </p>
                )}
            </div>

            {/* Right: Actions */}
            <div className="flex items-center gap-2 md:gap-3">
                {/* Shop Switcher - show if user has multiple shops */}
                {shops.length > 1 && <ShopSwitcher />}

                {/* Language Switcher */}
                <LanguageSwitcher />

                {/* Notifications */}
                <NotificationButton />

                {/* Profile Dropdown */}
                <div className="relative">
                    <button
                        onClick={() => setShowDropdown(!showDropdown)}
                        aria-label="Хэрэглэгчийн цэс"
                        aria-expanded={showDropdown}
                        aria-haspopup="menu"
                        className="flex items-center gap-2 hover:bg-gray-100 rounded-xl transition-colors p-1.5 md:px-3 md:py-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1"
                    >
                        <div className="w-8 h-8 md:w-9 md:h-9 rounded-full bg-gradient-to-br from-gold to-gold-dark flex items-center justify-center text-neutral-900 font-medium text-sm">
                            {firstName[0]?.toUpperCase()}
                        </div>
                        <ChevronDown className="w-4 h-4 text-gray-400 hidden md:block" />
                    </button>

                    {/* Dropdown Menu */}
                    {showDropdown && (
                        <>
                            <div
                                className="fixed inset-0 z-40"
                                onClick={() => setShowDropdown(false)}
                            />
                            <div className="absolute right-0 top-full mt-2 w-64 bg-white rounded-xl shadow-lg border border-gray-200 z-50 overflow-hidden">
                                <div className="p-4 border-b border-gray-100 bg-gray-50">
                                    <p className="font-medium text-gray-900 truncate">{fullName}</p>
                                    <p className="text-sm text-gray-500 truncate">{displayEmail}</p>
                                </div>
                                <div className="p-2 space-y-1">
                                    <button
                                        onClick={() => {
                                            setShowDropdown(false);
                                            router.push('/dashboard/settings');
                                        }}
                                        className="w-full flex items-center gap-3 px-3 py-2.5 text-sm text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                                    >
                                        <Settings className="w-4 h-4 text-gray-400" />
                                        Тохиргоо
                                    </button>
                                    <button
                                        onClick={handleLogout}
                                        disabled={loggingOut}
                                        className="w-full flex items-center gap-3 px-3 py-2.5 text-sm text-red-600 hover:bg-red-50 rounded-lg transition-colors"
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

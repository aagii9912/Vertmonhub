'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import Link from 'next/link';
import {
    LayoutDashboard, Users, Upload, Shield,
    FileText, Settings, LogOut, ChevronRight, Menu, X
} from 'lucide-react';

const isDev = process.env.NODE_ENV === 'development';

interface AdminLayoutProps {
    children: React.ReactNode;
}

const navItems = [
    { href: '/admin', label: 'Dashboard', icon: LayoutDashboard },
    { href: '/admin/shops', label: 'Shops', icon: Users },
    { href: '/admin/users', label: 'Хэрэглэгчид', icon: Shield },
    { href: '/admin/roles', label: 'Дүрүүд', icon: Shield },
    { href: '/admin/import', label: 'Import Data', icon: Upload },
    { href: '/admin/invoices', label: 'Invoices', icon: FileText },
    { href: '/admin/settings', label: 'Settings', icon: Settings },
];

export default function AdminLayout({ children }: AdminLayoutProps) {
    const router = useRouter();
    const pathname = usePathname();
    const { isSignedIn, isLoaded } = useAuth();
    const [loading, setLoading] = useState(true);
    const [admin, setAdmin] = useState<{ email: string; role: string } | null>(null);
    const [sidebarOpen, setSidebarOpen] = useState(false);

    // Allow login page to render without auth check
    const isLoginPage = pathname?.startsWith('/admin/login');

    useEffect(() => {
        if (isLoginPage) {
            setLoading(false);
            return;
        }

        if (!isLoaded) return;

        if (!isSignedIn) {
            router.push('/admin/login');
            return;
        }

        // Check if user is admin
        checkAdmin();
    }, [isLoaded, isSignedIn, isLoginPage]);

    async function checkAdmin() {
        try {
            const res = await fetch('/api/admin/dashboard', {
                credentials: 'include',
                headers: { 'Cache-Control': 'no-cache' }
            });

            if (res.ok) {
                const data = await res.json();
                if (isDev) console.log('Admin verified:', data.admin?.email);
                setAdmin(data.admin);
            } else {
                if (isDev) console.log('Not an admin, redirecting');
                // Not an admin - redirect to regular dashboard
                router.push('/dashboard');
            }
        } catch (error) {
            if (isDev) console.error('Admin check error:', error);
            router.push('/dashboard');
        } finally {
            setLoading(false);
        }
    }

    // Login page renders without layout
    if (isLoginPage) {
        return <>{children}</>;
    }

    if (loading || !isLoaded) {
        return (
            <div className="min-h-screen bg-gray-100 flex items-center justify-center">
                <div className="animate-spin w-8 h-8 border-4 border-violet-600 border-t-transparent rounded-full"></div>
            </div>
        );
    }

    if (!admin) {
        return null;
    }

    return (
        <div className="min-h-screen bg-gray-100">
            {/* Mobile sidebar overlay */}
            {sidebarOpen && (
                <div
                    className="fixed inset-0 bg-black/50 z-40 lg:hidden"
                    onClick={() => setSidebarOpen(false)}
                />
            )}

            {/* Sidebar */}
            <aside className={`
                fixed top-0 left-0 z-50 h-full w-64 bg-gray-900 text-white
                transform transition-transform duration-200 ease-in-out
                ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
                lg:translate-x-0
            `}>
                {/* Logo */}
                <div className="h-16 flex items-center justify-between px-4 border-b border-gray-800">
                    <span className="text-xl font-bold text-violet-400">Vertmon Admin</span>
                    <button
                        className="lg:hidden p-2 hover:bg-gray-800 rounded-lg"
                        onClick={() => setSidebarOpen(false)}
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Navigation */}
                <nav className="p-4 space-y-1">
                    {navItems.map((item) => {
                        const isActive = pathname === item.href || (item.href !== '/admin' && pathname?.startsWith(item.href));
                        return (
                            <Link
                                key={item.href}
                                href={item.href}
                                className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${isActive
                                    ? 'bg-violet-600 text-white'
                                    : 'text-gray-300 hover:bg-gray-800 hover:text-white'
                                    }`}
                                onClick={() => setSidebarOpen(false)}
                            >
                                <item.icon className="w-5 h-5" />
                                <span>{item.label}</span>
                            </Link>
                        );
                    })}
                </nav>

                {/* Admin info */}
                <div className="absolute bottom-0 left-0 right-0 p-4 border-t border-gray-800">
                    <div className="flex items-center gap-3 px-4 py-2">
                        <div className="w-8 h-8 rounded-full bg-violet-600 flex items-center justify-center text-sm font-bold">
                            {admin.email[0].toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">{admin.email}</p>
                            <p className="text-xs text-gray-400 capitalize">{admin.role.replace('_', ' ')}</p>
                        </div>
                    </div>
                    <Link
                        href="/dashboard"
                        className="flex items-center gap-3 px-4 py-2 mt-2 text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition-colors"
                    >
                        <LogOut className="w-5 h-5" />
                        <span>Exit Admin</span>
                    </Link>
                </div>
            </aside>

            {/* Main content */}
            <div className="lg:pl-64">
                {/* Top bar */}
                <header className="h-16 bg-white border-b border-gray-200 flex items-center justify-between px-4 lg:px-8">
                    <button
                        className="lg:hidden p-2 hover:bg-gray-100 rounded-lg"
                        onClick={() => setSidebarOpen(true)}
                    >
                        <Menu className="w-6 h-6" />
                    </button>

                    <div className="flex items-center gap-2 text-sm text-gray-500">
                        <Link href="/admin" className="hover:text-gray-900">Admin</Link>
                        <ChevronRight className="w-4 h-4" />
                        <span className="text-gray-900 font-medium">
                            {navItems.find(n => pathname?.startsWith(n.href))?.label || 'Dashboard'}
                        </span>
                    </div>

                    <div className="flex items-center gap-4">
                        <span className="text-sm text-gray-500">
                            {new Date().toLocaleDateString('mn-MN', {
                                weekday: 'long',
                                year: 'numeric',
                                month: 'long',
                                day: 'numeric'
                            })}
                        </span>
                    </div>
                </header>

                {/* Page content */}
                <main className="p-4 lg:p-8">
                    {children}
                </main>
            </div>
        </div>
    );
}

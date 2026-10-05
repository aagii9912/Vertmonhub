'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import Link from 'next/link';
import {
    LayoutDashboard, Users, Upload, Shield,
    Settings, LogOut, ChevronRight, Menu, X, Target, Building2, Plug
} from 'lucide-react';

interface AdminLayoutProps {
    children: React.ReactNode;
}

const navItems = [
    { href: '/admin/dashboard', label: 'Хянах самбар', icon: LayoutDashboard },
    { href: '/admin/users', label: 'Хэрэглэгчид', icon: Users },
    { href: '/admin/projects', label: 'Төслүүд', icon: Building2 },
    { href: '/admin/sales-targets', label: 'Борлуулалтын төлөвлөгөө', icon: Target },
    { href: '/admin/roles', label: 'Дүрүүд', icon: Shield },
    { href: '/admin/import', label: 'Дата импорт', icon: Upload },
    { href: '/admin/integrations', label: 'Холболтууд', icon: Plug },
    { href: '/admin/settings', label: 'Тохиргоо', icon: Settings },
];

export default function AdminLayout({ children }: AdminLayoutProps) {
    const router = useRouter();
    const pathname = usePathname();
    const { user, isSignedIn, isLoaded } = useAuth();
    const userId = user?.id;
    const userRole = user?.role;
    const [loading, setLoading] = useState(true);
    const [admin, setAdmin] = useState<{ userId: string; email: string; role: string } | null>(null);
    const [sidebarOpen, setSidebarOpen] = useState(false);

    // Allow login page to render without auth check
    const isLoginPage = pathname?.startsWith('/admin/login');

    useEffect(() => {
        if (isLoginPage) {
            setAdmin(null);
            setLoading(false);
            return;
        }

        if (!isLoaded) return;

        setAdmin(null);

        if (!isSignedIn) {
            setLoading(false);
            router.replace('/admin/login');
            return;
        }
        if (!userId || userRole !== 'super_admin') {
            setLoading(false);
            router.replace('/dashboard');
            return;
        }

        setLoading(true);

        let active = true;
        async function checkAdmin() {
            try {
                const res = await fetch('/api/admin/settings', { cache: 'no-store' });
                if (res.ok) {
                    const data = await res.json();
                    if (active) setAdmin({ ...data.admin, userId: userId! });
                } else {
                    if (active) router.replace('/dashboard');
                }
            } catch (error) {
                console.error('Admin check error:', error);
                if (active) router.replace('/dashboard');
            } finally {
                if (active) setLoading(false);
            }
        }
        void checkAdmin();
        return () => { active = false; };
    }, [isLoaded, isSignedIn, isLoginPage, router, userId, userRole]);

    // Login page renders without layout
    if (isLoginPage) {
        return <>{children}</>;
    }

    if (loading || !isLoaded) {
        return (
            <div className="min-h-screen bg-surface-2 flex items-center justify-center">
                <div className="animate-spin w-8 h-8 border-4 border-brand border-t-transparent rounded-full"></div>
            </div>
        );
    }

    if (!admin || !isSignedIn || userRole !== 'super_admin' || admin.userId !== userId) {
        return null;
    }

    return (
        <div className="min-h-screen bg-surface-2">
            {/* Mobile sidebar overlay */}
            {sidebarOpen && (
                <button
                    type="button"
                    aria-label="Цэсийг хаах"
                    className="fixed inset-0 bg-black/50 z-40 lg:hidden"
                    onClick={() => setSidebarOpen(false)}
                />
            )}

            {/* Sidebar */}
            <aside className={`
                fixed top-0 left-0 z-50 h-full w-64 bg-foreground text-background
                transform transition-transform duration-200 ease-in-out
                ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
                lg:translate-x-0
            `}>
                {/* Logo */}
                <div className="h-16 flex items-center justify-between px-4 border-b border-background/10">
                    <span className="heading-display text-lg text-background">Vertmon Админ</span>
                    <button
                        type="button"
                        aria-label="Цэсийг хаах"
                        className="lg:hidden p-2 hover:bg-background/10 rounded-md"
                        onClick={() => setSidebarOpen(false)}
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Navigation */}
                <nav className="p-4 space-y-1">
                    {navItems.map((item) => {
                        const isActive = pathname === item.href || pathname?.startsWith(item.href + '/');
                        return (
                            <Link
                                key={item.href}
                                href={item.href}
                                className={`flex items-center gap-3 px-4 py-3 rounded-md transition-colors ${isActive
                                    ? 'bg-brand text-brand-fg'
                                    : 'text-background/70 hover:bg-background/10 hover:text-background'
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
                <div className="absolute bottom-0 left-0 right-0 p-4 border-t border-background/10">
                    <div className="flex items-center gap-3 px-4 py-2">
                        <div className="w-8 h-8 rounded-full bg-brand flex items-center justify-center text-sm font-medium text-brand-fg">
                            {admin.email[0]?.toUpperCase() || 'A'}
                        </div>
                        <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate text-background">{admin.email}</p>
                            <p className="text-xs text-background/60 capitalize">{admin.role.replace('_', ' ')}</p>
                        </div>
                    </div>
                    <Link
                        href="/dashboard"
                        className="flex items-center gap-3 px-4 py-2 mt-2 text-background/70 hover:text-background hover:bg-background/10 rounded-md transition-colors"
                    >
                        <LogOut className="w-5 h-5" />
                        <span>Админаас гарах</span>
                    </Link>
                </div>
            </aside>

            {/* Main content */}
            <div className="lg:pl-64">
                {/* Top bar */}
                <header className="h-16 bg-surface border-b border-border flex items-center justify-between px-4 lg:px-8">
                    <button
                        type="button"
                        aria-label="Цэс нээх"
                        aria-expanded={sidebarOpen}
                        className="lg:hidden p-2 hover:bg-surface-2 rounded-lg"
                        onClick={() => setSidebarOpen(true)}
                    >
                        <Menu className="w-6 h-6" />
                    </button>

                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Link href="/admin" className="hover:text-foreground">Админ</Link>
                        <ChevronRight className="w-4 h-4" />
                        <span className="text-foreground font-medium">
                        {navItems.find(n => pathname === n.href || pathname?.startsWith(n.href + '/'))?.label || 'Хянах самбар'}
                        </span>
                    </div>

                    <div className="flex items-center gap-4">
                        <span className="text-sm text-muted-foreground">
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

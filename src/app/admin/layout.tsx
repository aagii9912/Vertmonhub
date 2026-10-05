'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { AppShell } from '@/components/dashboard/AppShell';
import { Spinner } from '@/components/ui/Spinner';
import { useAuth } from '@/contexts/AuthContext';

/**
 * Админ хэсэг үндсэн AppShell дотор (UI v3, 2-р шат) — тусдаа sidebar, толгой байхгүй.
 *
 * Хамгаалалт: нэвтрээгүй бол нэвтрэх хуудас руу (буцах замтай), super_admin биш бол
 * /dashboard руу. Жинхэнэ эрх нь `/api/admin/settings`-ийн серверийн шалгалт; түүнийг
 * давсны дараа л хуудсыг харуулна (admin API бүр эрхийг дахин шалгана).
 */
export default function AdminLayout({ children }: { children: React.ReactNode }) {
    const router = useRouter();
    const pathname = usePathname();
    const { user, isSignedIn, isLoaded } = useAuth();
    // Super Admin-ийн identity, бусад үед null. Солигдвол (өөр хэрэглэгч, дүр хасагдсан) дахин шалгана.
    const adminId = isLoaded && isSignedIn && user?.role === 'super_admin' && user.id ? user.id : null;
    const [verifiedId, setVerifiedId] = useState<string | null>(null);
    const [checkedId, setCheckedId] = useState(adminId);
    if (checkedId !== adminId) {
        setCheckedId(adminId);
        setVerifiedId(null);
    }

    useEffect(() => {
        if (!isLoaded) return;
        if (!isSignedIn) router.replace(`/auth/login?redirect_url=${encodeURIComponent(pathname || '/admin/dashboard')}`);
    }, [isLoaded, isSignedIn, pathname, router]);

    useEffect(() => {
        if (isLoaded && isSignedIn && !adminId) router.replace('/dashboard');
    }, [isLoaded, isSignedIn, adminId, router]);

    useEffect(() => {
        if (!adminId) return;
        let active = true;
        (async () => {
            try {
                const res = await fetch('/api/admin/settings', { cache: 'no-store' });
                if (!active) return;
                if (res.ok) setVerifiedId(adminId);
                else router.replace('/dashboard');
            } catch (error) {
                console.error('Admin check error:', error);
                if (active) router.replace('/dashboard');
            }
        })();
        return () => { active = false; };
    }, [adminId, router]);

    if (adminId && verifiedId === adminId) return <AppShell>{children}</AppShell>;

    return (
        <div className="flex min-h-screen items-center justify-center bg-background">
            <Spinner size="lg" />
        </div>
    );
}

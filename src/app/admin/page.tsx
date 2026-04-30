'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';

export default function AdminIndexPage() {
    const router = useRouter();
    const { isSignedIn, isLoaded } = useAuth();

    useEffect(() => {
        if (!isLoaded) return;

        if (isSignedIn) {
            // User is signed in, go to dashboard
            router.replace('/admin/dashboard');
        } else {
            // Not signed in, go to login
            router.replace('/admin/login');
        }
    }, [isLoaded, isSignedIn, router]);

    return (
        <div className="min-h-screen bg-surface-2 flex items-center justify-center">
            <div className="animate-spin w-8 h-8 border-4 border-violet-600 border-t-transparent rounded-full"></div>
        </div>
    );
}


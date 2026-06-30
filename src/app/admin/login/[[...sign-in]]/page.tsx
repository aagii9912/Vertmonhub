'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { Shield } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { createSupabaseBrowserClient } from '@/lib/supabase-browser';
import { useState } from 'react';

export default function AdminLoginPage() {
    const { isSignedIn, loading } = useAuth();
    const router = useRouter();
    const supabase = createSupabaseBrowserClient();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [submitting, setSubmitting] = useState(false);

    // If already signed in, redirect to admin dashboard
    useEffect(() => {
        if (!loading && isSignedIn) {
            router.push('/admin');
        }
    }, [loading, isSignedIn, router]);

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setSubmitting(true);

        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) {
            setError(error.message === 'Invalid login credentials'
                ? 'Имэйл эсвэл нууц үг буруу байна'
                : error.message);
            setSubmitting(false);
        } else {
            router.push('/admin');
            router.refresh();
        }
    };

    return (
        <div className="min-h-screen bg-background flex items-center justify-center p-4">
            <div className="w-full max-w-md">
                {/* Logo */}
                <div className="text-center mb-8">
                    <div className="w-16 h-16 bg-brand rounded-2xl flex items-center justify-center mx-auto mb-4">
                        <Shield className="w-8 h-8 text-brand-fg" />
                    </div>
                    <h1 className="heading-display text-2xl text-foreground">Vertmon Hub · Админ</h1>
                    <p className="text-muted-foreground mt-2">Админ нэвтрэх хэсэг</p>
                </div>

                {/* Login Form */}
                <div className="bg-surface border border-border shadow-lg rounded-xl p-6 space-y-4">
                    <form onSubmit={handleLogin} className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-fg-2 mb-1.5">Имэйл</label>
                            <input
                                type="email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                className="w-full px-4 py-2.5 rounded-md bg-surface-2 border border-border text-foreground placeholder:text-muted-2 outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40 focus-visible:ring-offset-2 focus-visible:ring-offset-background text-sm"
                                placeholder="admin@example.com"
                                required
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-fg-2 mb-1.5">Нууц үг</label>
                            <input
                                type="password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                className="w-full px-4 py-2.5 rounded-md bg-surface-2 border border-border text-foreground placeholder:text-muted-2 outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40 focus-visible:ring-offset-2 focus-visible:ring-offset-background text-sm"
                                placeholder="••••••••"
                                required
                            />
                        </div>
                        {error && (
                            <div className="text-sm text-status-danger bg-status-danger-soft rounded-md px-3 py-2">{error}</div>
                        )}
                        <button
                            type="submit"
                            disabled={submitting}
                            className="w-full py-2.5 rounded-md bg-brand hover:bg-brand-strong text-brand-fg font-medium text-sm transition-colors disabled:opacity-50"
                        >
                            {submitting ? 'Нэвтэрч байна...' : 'Нэвтрэх'}
                        </button>
                    </form>
                </div>

                {/* Footer */}
                <p className="text-center text-muted-foreground text-sm mt-6">
                    © Vertmon Hub
                </p>
            </div>
        </div>
    );
}

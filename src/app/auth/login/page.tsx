'use client';

import { useState } from 'react';
import { createBrowserClient } from '@supabase/ssr';

export default function LoginPage() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const supabase = createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    );

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError(null);

        try {
            const res = await fetch('/api/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password }),
            });
            const data = await res.json();

            if (res.ok && data.success) {
                window.location.href = '/dashboard';
                return;
            }

            setError(data.error || 'Нэвтрэх үед алдаа гарлаа');
        } catch {
            setError('Сүлжээний алдаа');
        } finally {
            setLoading(false);
        }
    };

    const handleGoogleLogin = async () => {
        setLoading(true);
        const { error } = await supabase.auth.signInWithOAuth({
            provider: 'google',
            options: { redirectTo: `${window.location.origin}/auth/callback` },
        });
        if (error) {
            setError(error.message);
            setLoading(false);
        }
    };

    const handleAppleLogin = async () => {
        setLoading(true);
        const { error } = await supabase.auth.signInWithOAuth({
            provider: 'apple',
            options: { redirectTo: `${window.location.origin}/auth/callback` },
        });
        if (error) {
            setError(error.message);
            setLoading(false);
        }
    };

    const handleFacebookLogin = async () => {
        setLoading(true);
        const { error } = await supabase.auth.signInWithOAuth({
            provider: 'facebook',
            options: { redirectTo: `${window.location.origin}/auth/callback` },
        });
        if (error) {
            setError(error.message);
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-background px-4 py-12">
            <div className="w-full max-w-md p-8 space-y-6 bg-surface rounded-xl border border-border shadow-lg">
                <div className="text-center">
                    <p className="font-mono text-[10px] tracking-[0.24em] text-muted-foreground/80 uppercase mb-2">
                        Vertmon — Hub
                    </p>
                    <h1 className="heading-display text-3xl text-foreground">Хөдөлмөрт орох</h1>
                    <p className="text-muted-foreground mt-2 text-sm">AI Борлуулагч Платформ</p>
                </div>

                {error && (
                    <div className="bg-status-danger-soft border border-status-danger/30 text-status-danger px-4 py-3 rounded-md text-sm">
                        {error}
                    </div>
                )}

                <form onSubmit={handleLogin} className="space-y-4">
                    <div>
                        <label className="block text-xs font-medium uppercase tracking-[0.06em] text-muted-foreground/80 mb-1.5">
                            Имэйл
                        </label>
                        <input
                            type="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            className="w-full px-4 py-3 bg-background border border-border rounded-md text-foreground placeholder-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-ring/40 focus:border-border-strong transition-colors"
                            placeholder="email@example.com"
                            required
                        />
                    </div>

                    <div>
                        <label className="block text-xs font-medium uppercase tracking-[0.06em] text-muted-foreground/80 mb-1.5">
                            Нууц үг
                        </label>
                        <input
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            className="w-full px-4 py-3 bg-background border border-border rounded-md text-foreground placeholder-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-ring/40 focus:border-border-strong transition-colors"
                            placeholder="••••••••"
                            required
                        />
                    </div>

                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full py-3 bg-foreground text-background hover:bg-fg-2 font-medium rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {loading ? 'Түр хүлээнэ үү...' : 'Нэвтрэх'}
                    </button>
                </form>

                <div className="relative">
                    <div className="absolute inset-0 flex items-center">
                        <div className="w-full border-t border-border"></div>
                    </div>
                    <div className="relative flex justify-center text-xs uppercase tracking-[0.16em]">
                        <span className="px-3 bg-surface text-muted-foreground/80">эсвэл</span>
                    </div>
                </div>

                <div className="space-y-3">
                    <button
                        onClick={handleGoogleLogin}
                        disabled={loading}
                        className="w-full py-3 bg-background border border-border hover:bg-surface-2 text-foreground font-medium rounded-md transition-colors flex items-center justify-center gap-3 disabled:opacity-50"
                    >
                        <svg className="w-5 h-5" viewBox="0 0 24 24">
                            <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                            <path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                            <path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                            <path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                        </svg>
                        Google-ээр нэвтрэх
                    </button>

                    <button
                        onClick={handleAppleLogin}
                        disabled={loading}
                        className="w-full py-3 bg-foreground hover:bg-fg-2 text-background font-medium rounded-md transition-colors flex items-center justify-center gap-3 disabled:opacity-50"
                    >
                        <svg className="w-5 h-5" viewBox="0 0 384 512">
                            <path fill="currentColor" d="M318.7 268.7c-.2-36.7 16.4-64.4 50-84.8-18.8-26.9-47.2-41.7-84.1-44.6-35.9-2.8-74.3 22.7-93.1 22.7-18.9 0-50.1-22.9-80.1-22.3-40.4 .6-77.9 23.4-98.8 59.5-42.3 73.1-10.8 181.9 30.6 241.8 19.9 29.5 43.1 63.6 74.4 62.5 30.2-1.2 41.7-19.9 78-19.9 36.1 0 46.7 19.9 78.4 19.3 32.5-.6 52.8-32.1 72.3-61.6 22.9-34.6 32.4-68.2 32.9-69.9-1.2-.4-70.1-26.9-70.4-102.7zm-86.8-197.8c18.3-22.1 30.7-52.9 27.3-83.4-25.1 1-56.1 16.7-74.8 38.6-14.8 17.5-29.2 49.3-25.2 78.7 28.2 2.2 55.4-12.8 72.7-33.9z" />
                        </svg>
                        Apple-ээр нэвтрэх
                    </button>

                    <button
                        onClick={handleFacebookLogin}
                        disabled={loading}
                        className="w-full py-3 bg-status-info text-white font-medium rounded-md transition-opacity hover:opacity-90 flex items-center justify-center gap-3 disabled:opacity-50"
                    >
                        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                            <path
                                fillRule="evenodd"
                                d="M22 12c0-5.523-4.477-10-10-10S2 6.477 2 12c0 4.991 3.657 9.128 8.438 9.878v-6.987h-2.54V12h2.54V9.797c0-2.506 1.492-3.89 3.777-3.89 1.094 0 2.238.195 2.238.195v2.46h-1.26c-1.243 0-1.63.771-1.63 1.562V12h2.773l-.443 2.89h-2.33v6.988C18.343 21.128 22 16.991 22 12z"
                                clipRule="evenodd"
                            />
                        </svg>
                        Facebook-ээр нэвтрэх
                    </button>
                </div>

                <p className="text-center text-muted-foreground/70 text-xs">
                    Нэвтрэх эрхгүй бол админтай холбогдоно уу
                </p>
            </div>
        </div>
    );
}

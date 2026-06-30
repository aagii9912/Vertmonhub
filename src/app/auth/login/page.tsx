'use client';

import { useState } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import { AuthShell } from '@/components/auth/AuthShell';
import { AuthCard } from '@/components/auth/AuthCard';
import { OAuthButton } from '@/components/auth/OAuthButton';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { FormField } from '@/components/ui/FormField';
import { Alert } from '@/components/ui/Alert';

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
        <AuthShell
            footer={
                <p className="text-xs text-muted-foreground/70">
                    Нэвтрэх эрхгүй бол админтай холбогдоно уу
                </p>
            }
        >
            <AuthCard title="Нэвтрэх" subtitle="AI Борлуулагч Платформ">
                {error && (
                    <Alert variant="danger" className="mb-5">
                        {error}
                    </Alert>
                )}

                <form onSubmit={handleLogin} className="space-y-4">
                    <FormField label="Имэйл" htmlFor="login-email">
                        <Input
                            id="login-email"
                            type="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            placeholder="email@example.com"
                            required
                        />
                    </FormField>

                    <FormField label="Нууц үг" htmlFor="login-password">
                        <Input
                            id="login-password"
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            placeholder="••••••••"
                            required
                        />
                    </FormField>

                    <Button type="submit" isLoading={loading} className="w-full" size="lg">
                        {loading ? 'Түр хүлээнэ үү...' : 'Нэвтрэх'}
                    </Button>
                </form>

                <div className="relative my-6">
                    <div className="absolute inset-0 flex items-center">
                        <div className="w-full border-t border-border" />
                    </div>
                    <div className="relative flex justify-center text-xs uppercase tracking-[0.16em]">
                        <span className="bg-surface px-3 text-muted-foreground/80">эсвэл</span>
                    </div>
                </div>

                <div className="space-y-3">
                    <OAuthButton provider="google" onClick={handleGoogleLogin} disabled={loading}>
                        Google-ээр нэвтрэх
                    </OAuthButton>

                    <button
                        type="button"
                        onClick={handleAppleLogin}
                        disabled={loading}
                        className="flex w-full items-center justify-center gap-3 rounded-md bg-foreground px-4 py-3 text-sm font-medium text-background transition-colors hover:bg-fg-2 outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40 focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50"
                    >
                        <svg className="h-5 w-5" viewBox="0 0 384 512" aria-hidden="true">
                            <path
                                fill="currentColor"
                                d="M318.7 268.7c-.2-36.7 16.4-64.4 50-84.8-18.8-26.9-47.2-41.7-84.1-44.6-35.9-2.8-74.3 22.7-93.1 22.7-18.9 0-50.1-22.9-80.1-22.3-40.4 .6-77.9 23.4-98.8 59.5-42.3 73.1-10.8 181.9 30.6 241.8 19.9 29.5 43.1 63.6 74.4 62.5 30.2-1.2 41.7-19.9 78-19.9 36.1 0 46.7 19.9 78.4 19.3 32.5-.6 52.8-32.1 72.3-61.6 22.9-34.6 32.4-68.2 32.9-69.9-1.2-.4-70.1-26.9-70.4-102.7zm-86.8-197.8c18.3-22.1 30.7-52.9 27.3-83.4-25.1 1-56.1 16.7-74.8 38.6-14.8 17.5-29.2 49.3-25.2 78.7 28.2 2.2 55.4-12.8 72.7-33.9z"
                            />
                        </svg>
                        Apple-ээр нэвтрэх
                    </button>

                    <OAuthButton provider="facebook" onClick={handleFacebookLogin} disabled={loading}>
                        Facebook-ээр нэвтрэх
                    </OAuthButton>
                </div>
            </AuthCard>
        </AuthShell>
    );
}

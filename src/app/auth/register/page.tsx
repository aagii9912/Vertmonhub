'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';
import { createSupabaseBrowserClient } from '@/lib/supabase-browser';
import { useLanguage } from '@/contexts/LanguageContext';
import { LanguageSwitcherLight } from '@/components/LanguageSwitcher';

export default function RegisterPage() {
    const router = useRouter();
    const supabase = createSupabaseBrowserClient();
    const { t } = useLanguage();

    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [fullName, setFullName] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const [success, setSuccess] = useState(false);

    const handleSignUp = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setLoading(true);

        if (password.length < 6) {
            setError(t.auth.passwordMinLength);
            setLoading(false);
            return;
        }

        const { error } = await supabase.auth.signUp({
            email,
            password,
            options: {
                data: {
                    full_name: fullName,
                },
                emailRedirectTo: `${window.location.origin}/auth/callback?redirect_url=/setup`,
            },
        });

        if (error) {
            setError(error.message === 'User already registered'
                ? t.auth.alreadyRegistered
                : error.message);
            setLoading(false);
        } else {
            setSuccess(true);
        }
    };

    const handleOAuthLogin = async (provider: 'google' | 'facebook') => {
        setError('');
        const { error } = await supabase.auth.signInWithOAuth({
            provider,
            options: {
                redirectTo: `${window.location.origin}/auth/callback?redirect_url=/setup`,
                ...(provider === 'facebook' && { scopes: 'public_profile' }),
            },
        });
        if (error) {
            setError(error.message);
        }
    };

    if (success) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/5 via-background to-secondary/10 px-4">
                <div className="w-full max-w-md text-center">
                    <div className="bg-card border border-border rounded-2xl shadow-xl p-8">
                        <div className="text-5xl mb-4">📧</div>
                        <h2 className="text-xl font-bold text-foreground mb-2">{t.auth.checkEmail}</h2>
                        <p className="text-muted-foreground text-sm mb-4">
                            <strong>{email}</strong> {t.auth.checkEmailDesc}
                        </p>
                        <Link href="/auth/login" className="text-primary hover:text-primary/80 font-medium text-sm">
                            {t.auth.backToLogin}
                        </Link>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/5 via-background to-secondary/10 px-4">
            <div className="w-full max-w-md">
                {/* Language Switcher */}
                <div className="flex justify-end mb-4">
                    <LanguageSwitcherLight />
                </div>

                <div className="text-center mb-8">
                    <Image
                        src="/logo.png"
                        alt="Syncly"
                        width={64}
                        height={64}
                        className="rounded-lg mx-auto mb-4"
                    />
                    <h1 className="text-3xl font-bold text-foreground mb-2">
                        Syncly
                    </h1>
                    <p className="text-muted-foreground">
                        {t.auth.registerSubtitle}
                    </p>
                </div>

                <div className="bg-card border border-border rounded-2xl shadow-xl p-6 space-y-5">
                    {/* OAuth Buttons */}
                    <div className="space-y-3">
                        <button
                            onClick={() => handleOAuthLogin('google')}
                            className="w-full flex items-center justify-center gap-3 px-4 py-3 rounded-xl border border-border bg-background hover:bg-secondary transition-colors text-sm font-medium"
                        >
                            <svg className="w-5 h-5" viewBox="0 0 24 24">
                                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
                                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                            </svg>
                            {t.auth.registerWithGoogle}
                        </button>

                        <button
                            onClick={() => handleOAuthLogin('facebook')}
                            className="w-full flex items-center justify-center gap-3 px-4 py-3 rounded-xl border border-border bg-[#1877F2] hover:bg-[#166FE5] transition-colors text-sm font-medium text-white"
                        >
                            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                                <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
                            </svg>
                            {t.auth.registerWithFacebook}
                        </button>
                    </div>

                    <div className="relative">
                        <div className="absolute inset-0 flex items-center">
                            <div className="w-full border-t border-border"></div>
                        </div>
                        <div className="relative flex justify-center text-xs">
                            <span className="px-2 bg-card text-muted-foreground">{t.common.or}</span>
                        </div>
                    </div>

                    {/* Email/Password Form */}
                    <form onSubmit={handleSignUp} className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-foreground mb-1.5">
                                {t.auth.fullName}
                            </label>
                            <input
                                type="text"
                                value={fullName}
                                onChange={(e) => setFullName(e.target.value)}
                                className="w-full px-4 py-2.5 rounded-xl border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 text-sm"
                                placeholder={t.auth.fullNamePlaceholder}
                                required
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-foreground mb-1.5">
                                {t.auth.email}
                            </label>
                            <input
                                type="email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                className="w-full px-4 py-2.5 rounded-xl border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 text-sm"
                                placeholder="name@example.com"
                                required
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-foreground mb-1.5">
                                {t.auth.password}
                            </label>
                            <input
                                type="password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                className="w-full px-4 py-2.5 rounded-xl border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 text-sm"
                                placeholder={t.auth.passwordPlaceholder}
                                required
                                minLength={6}
                            />
                        </div>

                        {error && (
                            <div className="text-sm text-red-500 bg-red-500/10 rounded-lg px-3 py-2">
                                {error}
                            </div>
                        )}

                        <button
                            type="submit"
                            disabled={loading}
                            className="w-full py-2.5 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground font-medium text-sm transition-colors disabled:opacity-50"
                        >
                            {loading ? t.auth.registering : t.auth.register}
                        </button>
                    </form>

                    <p className="text-center text-sm text-muted-foreground">
                        {t.auth.hasAccount}{' '}
                        <Link href="/auth/login" className="text-primary hover:text-primary/80 font-medium">
                            {t.auth.login}
                        </Link>
                    </p>
                </div>
            </div>
        </div>
    );
}

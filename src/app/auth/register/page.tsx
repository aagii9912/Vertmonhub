'use client';

import { useState } from 'react';
import Link from 'next/link';
import { MailCheck } from 'lucide-react';
import { createSupabaseBrowserClient } from '@/lib/supabase-browser';
import { useLanguage } from '@/contexts/LanguageContext';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { AuthShell } from '@/components/auth/AuthShell';
import { AuthCard } from '@/components/auth/AuthCard';
import { OAuthButton } from '@/components/auth/OAuthButton';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { FormField } from '@/components/ui/FormField';
import { Alert } from '@/components/ui/Alert';

export default function RegisterPage() {
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
                emailRedirectTo: `${window.location.origin}/auth/callback?redirect_url=/dashboard`,
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
                redirectTo: `${window.location.origin}/auth/callback?redirect_url=/dashboard`,
                ...(provider === 'facebook' && { scopes: 'public_profile' }),
            },
        });
        if (error) {
            setError(error.message);
        }
    };

    if (success) {
        return (
            <AuthShell topRight={<LanguageSwitcher />}>
                <AuthCard title={t.auth.checkEmail}>
                    <div className="flex flex-col items-center text-center">
                        <span className="mb-4 flex h-14 w-14 items-center justify-center rounded-md bg-brand-soft text-brand-strong">
                            <MailCheck className="h-7 w-7" aria-hidden="true" />
                        </span>
                        <p className="mb-4 text-sm text-muted-foreground">
                            <strong className="text-foreground">{email}</strong> {t.auth.checkEmailDesc}
                        </p>
                        <Link
                            href="/auth/login"
                            className="text-sm font-medium text-brand-strong hover:text-brand"
                        >
                            {t.auth.backToLogin}
                        </Link>
                    </div>
                </AuthCard>
            </AuthShell>
        );
    }

    return (
        <AuthShell
            topRight={<LanguageSwitcher />}
            footer={
                <p className="text-sm text-muted-foreground">
                    {t.auth.hasAccount}{' '}
                    <Link href="/auth/login" className="font-medium text-brand-strong hover:text-brand">
                        {t.auth.login}
                    </Link>
                </p>
            }
        >
            <AuthCard title={t.auth.register} subtitle={t.auth.registerSubtitle}>
                <div className="space-y-3">
                    <OAuthButton provider="google" onClick={() => handleOAuthLogin('google')}>
                        {t.auth.registerWithGoogle}
                    </OAuthButton>

                    <OAuthButton provider="facebook" onClick={() => handleOAuthLogin('facebook')}>
                        {t.auth.registerWithFacebook}
                    </OAuthButton>
                </div>

                <div className="relative my-5">
                    <div className="absolute inset-0 flex items-center">
                        <div className="w-full border-t border-border" />
                    </div>
                    <div className="relative flex justify-center text-xs">
                        <span className="bg-surface px-2 text-muted-foreground">{t.common.or}</span>
                    </div>
                </div>

                <form onSubmit={handleSignUp} className="space-y-4">
                    <FormField label={t.auth.fullName} htmlFor="register-fullname">
                        <Input
                            id="register-fullname"
                            type="text"
                            value={fullName}
                            onChange={(e) => setFullName(e.target.value)}
                            placeholder={t.auth.fullNamePlaceholder}
                            required
                        />
                    </FormField>

                    <FormField label={t.auth.email} htmlFor="register-email">
                        <Input
                            id="register-email"
                            type="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            placeholder="name@example.com"
                            required
                        />
                    </FormField>

                    <FormField label={t.auth.password} htmlFor="register-password">
                        <Input
                            id="register-password"
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            placeholder={t.auth.passwordPlaceholder}
                            required
                            minLength={6}
                        />
                    </FormField>

                    {error && <Alert variant="danger">{error}</Alert>}

                    <Button type="submit" isLoading={loading} className="w-full" size="lg">
                        {loading ? t.auth.registering : t.auth.register}
                    </Button>
                </form>
            </AuthCard>
        </AuthShell>
    );
}

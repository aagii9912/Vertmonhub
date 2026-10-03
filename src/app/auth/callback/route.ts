import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/auth/supabase-auth';

export async function GET(request: Request) {
    const requestUrl = new URL(request.url);
    const code = requestUrl.searchParams.get('code');
    const tokenHash = requestUrl.searchParams.get('token_hash');
    const type = requestUrl.searchParams.get('type');

    const redirect = (path: string) => {
        const response = NextResponse.redirect(new URL(path, requestUrl.origin));
        response.headers.set('Cache-Control', 'private, no-store');
        return response;
    };
    const failed = (errorCode?: string) => redirect(`/auth/login?auth_error=${errorCode === 'otp_expired' ? 'link_expired' : 'callback_failed'}`);
    // Ашигласан холбоосыг дахин нээсэн ч хүчинтэй session-тэй хэрэглэгчийг аппад үлдээнэ.
    const failedUnlessSignedIn = async (supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>, errorCode?: string) => {
        const { data } = await supabase.auth.getUser();
        return data.user ? redirect('/dashboard') : failed(errorCode);
    };

    if (requestUrl.searchParams.has('error') || requestUrl.searchParams.has('error_description')) {
        return failed(requestUrl.searchParams.get('error_code') || undefined);
    }

    try {
        if (requestUrl.searchParams.has('token_hash')) {
            if (!tokenHash || (type !== 'invite' && type !== 'magiclink' && type !== 'email')) return failed();
            const supabase = await createSupabaseServerClient();
            const { data, error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
            if (error || !data.session) return await failedUnlessSignedIn(supabase, error?.code);
        } else if (code) {
            const supabase = await createSupabaseServerClient();
            const { data, error } = await supabase.auth.exchangeCodeForSession(code);
            if (error || !data.session) return await failedUnlessSignedIn(supabase, error?.code);
        }
    } catch {
        return failed();
    }

    return redirect('/dashboard');
}

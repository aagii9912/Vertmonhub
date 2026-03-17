import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { handleDataAssistantQuery } from '@/lib/ai/data-assistant';
import { supabaseAdmin } from '@/lib/supabase';
import { safeErrorResponse } from '@/lib/utils/safe-error';

export const maxDuration = 60; // Set to 60 seconds max

/**
 * AI Data Assistant API Route
 * Handles queries from internal staff regarding business data
 * Super admin gets write access, others get read-only
 */
export async function POST(req: Request) {
    try {
        const cookieStore = await cookies();

        // 1. Authenticate user
        const supabase = createServerClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
            {
                cookies: {
                    getAll() {
                        return cookieStore.getAll();
                    },
                    setAll(cookiesToSet) {
                        try {
                            cookiesToSet.forEach(({ name, value, options }) =>
                                cookieStore.set(name, value, options)
                            );
                        } catch {
                            // Ignore
                        }
                    },
                },
            }
        );

        const { data: { session }, error: authError } = await supabase.auth.getSession();

        if (authError || !session) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // 2. Check admin role for write permissions
        let userRole: 'super_admin' | 'admin' | 'user' = 'user';
        const adminDb = supabaseAdmin();
        const { data: adminData } = await adminDb
            .from('admins')
            .select('role')
            .eq('user_id', session.user.id)
            .eq('is_active', true)
            .single();

        if (adminData) {
            userRole = adminData.role as 'super_admin' | 'admin';
        }

        // 3. Parse request
        const { message, shopId, history = [] } = await req.json();

        if (!message) {
            return NextResponse.json({ error: 'Message is required' }, { status: 400 });
        }

        if (!process.env.GEMINI_API_KEY) {
            return NextResponse.json({ error: 'Gemini API key not configured' }, { status: 500 });
        }

        // 4. Process query using AI Data Assistant
        const response = await handleDataAssistantQuery(
            message,
            shopId,
            session.user.id,
            history,
            userRole
        );

        return NextResponse.json({
            response: response.text,
            data: response.data,
            chartConfig: response.chartConfig
        });

    } catch (error) {
        return safeErrorResponse(error, 'AI түгээх үед алдаа гарлаа');
    }
}

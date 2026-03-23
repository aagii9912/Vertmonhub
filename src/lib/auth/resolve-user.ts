/**
 * Shared auth resolver for API routes
 * Supports both Supabase Auth and custom vertmon-session cookie (GoTrue bypass)
 */
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import crypto from 'crypto';

const SESSION_SECRET = process.env.SUPABASE_SERVICE_ROLE_KEY || 'fallback-secret-key-32chars-min!!';

function decryptSession(encryptedText: string): { userId: string; email: string; role: string; expiresAt: number } | null {
    try {
        const key = crypto.scryptSync(SESSION_SECRET, 'salt', 32);
        const parts = encryptedText.split(':');
        const iv = Buffer.from(parts[0], 'hex');
        const authTag = Buffer.from(parts[1], 'hex');
        const encrypted = parts[2];
        const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
        decipher.setAuthTag(authTag);
        let decrypted = decipher.update(encrypted, 'hex', 'utf8');
        decrypted += decipher.final('utf8');
        return JSON.parse(decrypted);
    } catch {
        return null;
    }
}

export interface ResolvedUser {
    id: string;
    email: string;
}

/**
 * Resolve the current authenticated user from Supabase session or custom session cookie.
 * Returns null if no valid session found.
 */
export async function resolveApiUser(): Promise<ResolvedUser | null> {
    const cookieStore = await cookies();

    // 1. Try Supabase session
    try {
        const supabase = createServerClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
            {
                cookies: {
                    getAll() { return cookieStore.getAll(); },
                    setAll(cookiesToSet: any[]) {
                        try { cookiesToSet.forEach(({ name, value, options }: any) => cookieStore.set(name, value, options)); } catch {}
                    },
                },
            }
        );
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user) {
            return { id: session.user.id, email: session.user.email || '' };
        }
    } catch {}

    // 2. Fallback: custom vertmon-session cookie
    const sessionCookie = cookieStore.get('vertmon-session');
    if (sessionCookie?.value) {
        const session = decryptSession(sessionCookie.value);
        if (session && session.expiresAt > Date.now()) {
            return { id: session.userId, email: session.email };
        }
    }

    return null;
}

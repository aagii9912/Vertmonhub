/**
 * Business API route-ын нийтлэг хаалт: модулийн эрх (унших / бичих / устгах) → идэвхтэй
 * байгууллага (`getUserShop` нь x-shop-id-г эзэмшил ∪ гишүүнчлэлээр шалгана) → handler.
 * Барьж аваагүй алдаа серверт лог болж, хэрэглэгчид ерөнхий монгол мессеж буцна;
 * `ProjectScopeError` өөрийн статус, мессежтэй. Хувийн (self-scope), cron, webhook,
 * нийтийн route-ууд өөрийн хаалтаа хэвээр хэрэглэнэ.
 *
 *   export const GET = withRoute({ module: 'leads' }, async ({ request, shop }) => { ... });
 *   export const PATCH = withRoute<{ id: string }>({ module: 'leads', access: 'write' }, async ({ params }) => { ... });
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireAnyModule, requireModule, requireModuleDelete, requireModuleWrite } from '@/lib/auth/require-permission';
import { getUserShop } from '@/lib/auth/supabase-auth';
import { ProjectScopeError } from '@/lib/sales/project-scope';
import { logger } from '@/lib/utils/logger';

export type RouteShop = NonNullable<Awaited<ReturnType<typeof getUserShop>>>;

export interface RouteOptions {
    /** Шаардах модуль. Массив = аль нэг нь (зөвхөн уншихад). */
    module: string | readonly string[];
    /** Анхдагч `read`. */
    access?: 'read' | 'write' | 'delete';
    /** Барьж аваагүй алдааны үед хэрэглэгчид харуулах мессеж. */
    error?: string;
}

export interface RouteContext<P> {
    request: NextRequest;
    shop: RouteShop;
    params: P;
}

function gate({ module, access = 'read' }: RouteOptions) {
    if (typeof module !== 'string') return requireAnyModule([...module]);
    if (access === 'write') return requireModuleWrite(module);
    if (access === 'delete') return requireModuleDelete(module);
    return requireModule(module);
}

export function withRoute<P extends Record<string, string | string[]> = Record<string, never>>(
    options: RouteOptions,
    handler: (context: RouteContext<P>) => Promise<Response>,
) {
    if (typeof options.module !== 'string' && options.access && options.access !== 'read') {
        throw new Error('withRoute: write/delete access needs a single module');
    }
    // Next үргэлж NextRequest дамжуулна; тест болон дотоод дуудлага энгийн Request өгч болно.
    return async (input?: Request, context?: { params: Promise<P> }): Promise<Response> => {
        const request = input instanceof NextRequest ? input : new NextRequest(input ?? 'http://localhost/');
        try {
            const denied = await gate(options);
            if (denied) return denied;
            const shop = await getUserShop();
            if (!shop) return NextResponse.json({ error: 'Байгууллагад хандах эрх олдсонгүй' }, { status: 403 });
            return await handler({ request, shop, params: context ? await context.params : ({} as P) });
        } catch (error) {
            if (error instanceof ProjectScopeError) return NextResponse.json({ error: error.message }, { status: error.status });
            logger.error(`[API] ${request.method} ${request.nextUrl.pathname} failed`, { error });
            return NextResponse.json({ error: options.error ?? 'Хүсэлтийг гүйцэтгэж чадсангүй. Дахин оролдоно уу.' }, { status: 500 });
        }
    };
}

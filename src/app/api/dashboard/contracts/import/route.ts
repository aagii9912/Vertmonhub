import { NextResponse } from 'next/server';
import { z } from 'zod';
import { supabaseAdmin } from '@/lib/supabase';
import { getUserId } from '@/lib/auth/supabase-auth';
import { requireModuleWrite } from '@/lib/auth/require-permission';
import { withRoute } from '@/lib/api/route';
import { resolveSalesProjectScope } from '@/lib/sales/project-scope';
import { resolveManagerIdentity } from '@/lib/sales/manager-identity';
import { soleShopProjectId } from '@/lib/projects/shop-project';
import { ERP_LIMITS } from '@/lib/erp/import';
import { ubDateStr } from '@/lib/utils/date';
import { dateSchema } from '@/lib/marketing/performance';
import {
    commitContractListImport, loadLatestContractListImport, previewContractListImport,
} from '@/lib/services/ContractListImportService';

export const runtime = 'nodejs';
export const maxDuration = 60;
const noCache = { 'Cache-Control': 'no-store' };

const flag = z.preprocess(value => value === 'true' || value === '1' || value === true, z.boolean());
const FormSchema = z.object({
    action: z.enum(['preview', 'commit']),
    // Хуанлийн бодит огноо (2026-02-31 биш) — overdue_as_of болж хадгалагдана.
    reportDate: dateSchema.optional(),
    requestId: z.string().uuid().optional(),
    planHash: z.string().regex(/^[0-9a-f]{64}$/).optional(),
    acceptReview: flag,
    allowOlder: flag,
});
const field = (form: FormData, name: string) => {
    const value = form.get(name);
    return typeof value === 'string' && value.trim() ? value.trim() : undefined;
};

// ============================================
// GET /api/dashboard/contracts/import
// Сүүлийн гэрээний жагсаалтын (HUB) импорт: огноо, файл, мөрийн тоо.
// ============================================
export const GET = withRoute({ module: 'contracts', error: 'Гэрээний импортын түүх уншиж чадсангүй' }, async ({ shop }) => {
    const result = await loadLatestContractListImport(supabaseAdmin(), shop.id);
    return NextResponse.json(result, { headers: noCache });
});

// ============================================
// POST /api/dashboard/contracts/import (multipart)
// file + action: 'preview' (юу ч бичихгүй) | 'commit' (requestId, planHash, acceptReview, allowOlder).
// Гэрээ + ERP импортын бичих эрх, хязгааргүй (удирдлагын) хэрэглэгч, shop-ийн ганц төсөл.
// ============================================
export const POST = withRoute({ module: 'contracts', access: 'write', error: 'Гэрээний импорт амжилтгүй. Дахин оролдоно уу.' }, async ({ request, shop }) => {
    const denied = await requireModuleWrite('erp-imports');
    if (denied) return denied;
    const userId = await getUserId();
    if (!userId) return NextResponse.json({ error: 'Нэвтрэх шаардлагатай' }, { status: 401 });

    const db = supabaseAdmin();
    const scope = await resolveSalesProjectScope(db, shop.id);
    if (scope.projectIds !== null) return NextResponse.json({ error: 'Гэрээний импорт удирдлагад зориулагдсан' }, { status: 403 });
    const projectId = await soleShopProjectId(db, shop.id);
    if (!projectId) return NextResponse.json({ error: 'Энэ байгууллагад нэг төсөл бүртгэгдээгүй тул гэрээ импортлох боломжгүй' }, { status: 400 });

    if (Number(request.headers.get('content-length')) > ERP_LIMITS.bytes + 65536) {
        return NextResponse.json({ error: 'Файл 4 MB-аас ихгүй байна' }, { status: 413 });
    }
    const form = await request.formData().catch(() => null);
    const file = form?.get('file');
    if (!form || !(file instanceof File)) return NextResponse.json({ error: '4 MB хүртэл .xlsx, .csv эсвэл .tsv файл сонгоно уу' }, { status: 400 });
    const parsed = FormSchema.safeParse({
        action: field(form, 'action'), reportDate: field(form, 'reportDate'), requestId: field(form, 'requestId'),
        planHash: field(form, 'planHash'), acceptReview: field(form, 'acceptReview'), allowOlder: field(form, 'allowOlder'),
    });
    if (!parsed.success) return NextResponse.json({ error: 'Импортын хүсэлт буруу байна' }, { status: 400 });
    const input = parsed.data;
    const reportDate = input.reportDate ?? ubDateStr();

    const identity = await resolveManagerIdentity(db, shop.id, userId);
    const context = { db, shopId: shop.id, projectId, userId, userName: identity.managerName ?? identity.fullName };
    const upload = { name: file.name, buffer: await file.arrayBuffer() };
    let result;
    if (input.action === 'preview') {
        result = await previewContractListImport(context, upload, { reportDate });
    } else {
        if (!input.requestId || !input.planHash) return NextResponse.json({ error: 'Эхлээд файлаа шалгана уу' }, { status: 400 });
        result = await commitContractListImport(context, upload, {
            reportDate, requestId: input.requestId, planHash: input.planHash, acceptReview: input.acceptReview, allowOlder: input.allowOlder,
        });
    }
    return NextResponse.json(result.body, { status: result.status, headers: noCache });
});

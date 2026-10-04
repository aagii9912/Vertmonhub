import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getUserId } from '@/lib/auth/supabase-auth';
import { withRoute } from '@/lib/api/route';
import { resolveSalesProjectScope } from '@/lib/sales/project-scope';
import { resolveManagerIdentity } from '@/lib/sales/manager-identity';
import { listContractTransfers, transferContract } from '@/lib/services/ContractService';

// ============================================
// GET /api/dashboard/contracts/[id]/transfer
// Гэрээний эзэмшигчийн түүх (шилжүүлэг, нэр засвар)
// ============================================
export const GET = withRoute<{ id: string }>({ module: 'contracts', error: 'Эзэмшигчийн түүх татахад алдаа гарлаа' }, async ({ shop, params }) => {
    const { id } = await params;
    const result = await listContractTransfers(supabaseAdmin(), shop.id, id);
    if ('error' in result) return NextResponse.json({ error: result.error }, { status: result.status });
    return NextResponse.json(result);
});

// ============================================
// POST /api/dashboard/contracts/[id]/transfer
// Гэрээг өөр хүнд шилжүүлэх эсвэл эзэмшигчийн нэр засах. Гүйцэтгэгч, менежерийн
// хүрээ серверээс; төлбөр, менежер, гэрээний огноо хэвээр (transfer_contract RPC).
// ============================================
export const POST = withRoute<{ id: string }>({ module: 'contracts', access: 'write', error: 'Гэрээ шилжүүлэхэд алдаа гарлаа' }, async ({ request, shop, params }) => {
    const { id } = await params;
    const body = await request.json().catch(() => null);
    const userId = await getUserId();
    if (!userId) return NextResponse.json({ error: 'Нэвтрэх шаардлагатай' }, { status: 401 });

    const db = supabaseAdmin();
    const [scope, identity] = await Promise.all([
        resolveSalesProjectScope(db, shop.id),
        resolveManagerIdentity(db, shop.id, userId),
    ]);
    const result = await transferContract(db, shop.id, id, body, { userId, name: identity.managerName, scope });
    if ('error' in result) return NextResponse.json({ error: result.error }, { status: result.status });

    return NextResponse.json({
        transfer: result.transfer,
        replayed: result.replayed,
        message: result.transfer.kind === 'rename' ? 'Эзэмшигчийн нэр засагдлаа' : 'Гэрээ шилжүүлэгдлээ',
    }, { status: result.replayed ? 200 : 201 });
});

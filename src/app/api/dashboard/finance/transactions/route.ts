import { NextResponse, NextRequest } from 'next/server';
import { getUserShop } from '@/lib/auth/supabase-auth';
import { supabaseAdmin } from '@/lib/supabase';
import { logger } from '@/lib/utils/logger';
import { CreateFinanceTransactionSchema, validateBody } from '@/lib/validations/schemas';
import { logFinanceAudit } from '@/lib/erp/audit';

/**
 * GET /api/dashboard/finance/transactions — Гүйлгээний жагсаалт (шүүлттэй)
 */
export async function GET(request: NextRequest) {
    try {
        const authShop = await getUserShop();
        if (!authShop) {
            return NextResponse.json({ transactions: [] });
        }

        const supabase = supabaseAdmin();
        const sp = request.nextUrl.searchParams;
        const type = sp.get('type'); // receipt | disbursement
        const limit = Math.min(parseInt(sp.get('limit') || '50', 10) || 50, 500);

        let query = supabase
            .from('finance_transactions')
            .select('id, txn_date, type, amount, vat_amount, method, account_id, contract_id, project_id, note, created_at')
            .eq('shop_id', authShop.id)
            .order('txn_date', { ascending: false })
            .order('created_at', { ascending: false })
            .limit(limit);

        if (type === 'receipt' || type === 'disbursement') {
            query = query.eq('type', type);
        }

        const { data: transactions, error } = await query;
        if (error) throw error;

        return NextResponse.json({ transactions: transactions || [] });
    } catch (error) {
        logger.error('[Finance Transactions] GET error', { error });
        return NextResponse.json({ error: 'Гүйлгээ татахад алдаа гарлаа' }, { status: 500 });
    }
}

/**
 * POST /api/dashboard/finance/transactions — Гар бичилт (орлого/зарлага)
 */
export async function POST(request: NextRequest) {
    try {
        const authShop = await getUserShop();
        if (!authShop) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await request.json();
        const validation = validateBody(CreateFinanceTransactionSchema, body);
        if (!validation.success) {
            return validation.response;
        }
        const d = validation.data;

        const supabase = supabaseAdmin();
        const { data: txn, error } = await supabase
            .from('finance_transactions')
            .insert({
                shop_id: authShop.id,
                txn_date: d.txn_date || new Date().toISOString().slice(0, 10),
                type: d.type,
                amount: d.amount,
                vat_amount: d.vat_amount || 0,
                method: d.method || null,
                account_id: d.account_id || null,
                contract_id: d.contract_id || null,
                payment_schedule_id: d.payment_schedule_id || null,
                project_id: d.project_id || null,
                note: d.note || null,
            })
            .select()
            .single();

        if (error) throw error;

        await logFinanceAudit({
            shopId: authShop.id,
            action: 'transaction.create',
            entity: 'finance_transaction',
            entityId: txn.id,
            amount: d.amount,
            meta: { type: d.type, method: d.method || null },
        });

        return NextResponse.json({ transaction: txn, message: 'Гүйлгээ бүртгэлээ' }, { status: 201 });
    } catch (error) {
        logger.error('[Finance Transactions] POST error', { error });
        return NextResponse.json({ error: 'Гүйлгээ бүртгэхэд алдаа гарлаа' }, { status: 500 });
    }
}

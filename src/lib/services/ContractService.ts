/**
 * Гэрээний эзэмшигчийн өөрчлөлт (шилжүүлэг / нэр засвар) ба түүх.
 * API route ба AI tool хоёулаа энд дамжина. Бичилт зөвхөн `transfer_contract` RPC-ээр:
 * гэрээг түгжиж, түүх, шинэ эзэмшигчийн харилцагч, лидийн timeline, аудитыг нэг гүйлгээнд
 * хадгална. Төлбөр, менежер, гэрээний огноо, лид, тоот, дугаар хэвээр (PaymentService загвар).
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { logger } from '@/lib/utils/logger';
import { normalizePhone } from '@/lib/utils/phone';
import { ubDateStr } from '@/lib/utils/date';
import { fetchAllRows } from '@/lib/utils/pagination';
import { recomputeCustomerScore } from '@/lib/services/CustomerScoringService';
import type { SalesProjectScope } from '@/lib/sales/project-scope';
import {
    TransferContractSchema, summarizeContractTransfers, transferDateError, transferInputError,
    type ContractTransferSummary, type TransferContractData,
} from '@/lib/contracts/transfer';
import type { ContractTransfer } from '@/types/property';

export const CONTRACT_TRANSFER_FIELDS = 'id, contract_id, kind, effective_date, from_customer_id, from_customer_name, from_first_name, from_last_name, from_registration, from_phone, from_mobile, to_customer_id, to_customer_name, to_first_name, to_last_name, to_registration, to_phone, to_mobile, total_price_at_transfer, paid_amount_at_transfer, balance_at_transfer, reason, created_by_name, created_at';

/** Серверийн баталсан гүйцэтгэгч (body-оос хэзээ ч авахгүй). */
export interface ContractTransferActor {
    userId: string;
    /** Түүх, лидийн timeline-д харагдах нэр (менежерийн канон нэр эсвэл профайлын нэр). */
    name: string | null;
    /** `resolveSalesProjectScope` — хязгаарлагдсан менежер зөвхөн өөрийн гэрээг шилжүүлнэ. */
    scope: SalesProjectScope;
}

type Failure = { error: string; status: number };
export interface TransferResult { transfer: ContractTransfer; replayed: boolean; customerCreated: boolean }

const OPTIONAL_HOLDER_KEYS = ['customer_first_name', 'customer_last_name', 'customer_registration', 'customer_phone', 'customer_mobile', 'reason'] as const;

/** Migration ороогүй орчин (хүснэгт/функц байхгүй) — өгөгдөл гэж буруу тайлбарлахгүй. */
export function isMissingTransfersTable(error: { code?: string; message?: string } | null | undefined): boolean {
    if (!error) return false;
    return error.code === '42P01' || error.code === 'PGRST205'
        || (/contract_transfers/i.test(error.message || '') && /does not exist|could not find/i.test(error.message || ''));
}

/** RPC-д дамжих payload: зөвхөн өгсөн талбар (нэр засварт өгөөгүй талбар хэвээр үлдэнэ). */
export function buildTransferPayload(data: TransferContractData, today = ubDateStr()): Record<string, string | null> {
    const payload: Record<string, string | null> = {
        kind: data.kind,
        customer_name: data.customer_name,
        effective_date: data.effective_date ?? today,
    };
    for (const key of OPTIONAL_HOLDER_KEYS) {
        if (data[key] !== undefined) payload[key] = data[key] || null;
    }
    if (data.expected_customer_name !== undefined) payload.expected_customer_name = data.expected_customer_name;
    // Харилцагчийн dedup-ийн утасны түлхүүрийг зөвхөн сервер тооцно.
    if (data.kind === 'transfer') {
        const normalized = normalizePhone(data.customer_phone || data.customer_mobile);
        if (normalized) payload.phone_normalized = normalized;
    }
    return payload;
}

function stripInternal(row: Record<string, unknown>): ContractTransfer {
    const { client_request_id: _request, client_request_payload: _payload, replayed: _replayed, customer_created: _created, shop_id: _shop, created_by: _by, ...transfer } = row;
    return transfer as unknown as ContractTransfer;
}

export async function transferContract(
    db: SupabaseClient,
    shopId: string,
    contractId: string,
    input: unknown,
    actor: ContractTransferActor,
): Promise<TransferResult | Failure> {
    const parsed = TransferContractSchema.safeParse(input);
    if (!parsed.success) return { error: transferInputError(parsed.error), status: 400 };
    // Хязгаарлагдсан менежер: зөвхөн өөрийн нэр дээрх гэрээ (RPC түгжээний дотор дахин шалгана).
    const scopeManager = actor.scope.projectIds === null ? null : actor.scope.managerName;
    if (actor.scope.projectIds !== null && !scopeManager) {
        return { error: 'Зөвхөн өөрийн борлуулсан гэрээг шилжүүлэх боломжтой', status: 403 };
    }
    const today = ubDateStr();
    const payload = buildTransferPayload(parsed.data, today);
    const dateError = transferDateError(payload.effective_date as string, null, today);
    if (dateError) return { error: dateError, status: 400 };

    try {
        const { data, error } = await db.rpc('transfer_contract', {
            p_shop_id: shopId,
            p_contract_id: contractId,
            p_payload: payload,
            p_request_id: parsed.data.client_request_id,
            p_actor: actor.userId,
            p_actor_name: actor.name,
            p_scope_manager: scopeManager,
        });
        if (error) {
            if (error.code === 'PGRST202' || error.code === '42883') {
                return { error: 'Гэрээ шилжүүлэх боломж хараахан идэвхжээгүй байна. Системийн админд мэдэгдэнэ үү.', status: 503 };
            }
            if (error.code === 'P0002') return { error: 'Гэрээ олдсонгүй', status: 404 };
            if (error.code === '42501') return { error: 'Зөвхөн өөрийн борлуулсан гэрээг шилжүүлэх боломжтой', status: 403 };
            if (error.code === '23505') return { error: 'Энэ хүсэлтээр өөр шилжүүлэг бүртгэгдсэн байна. Цонхоо хаагаад дахин оролдоно уу.', status: 409 };
            if (error.code === '40001') return { error: error.message || 'Гэрээний эзэмшигч өөрчлөгдсөн байна. Хуудсаа шинэчлээд дахин оролдоно уу', status: 409 };
            if (error.code === '22023') return { error: error.message, status: 400 };
            if (error.code?.startsWith('22')) return { error: 'Шилжүүлгийн огноо, талбаруудаа шалгана уу', status: 400 };
            throw error;
        }
        const row = data as Record<string, unknown> | null;
        if (!row?.id) throw new Error('transfer_contract returned no persisted transfer');
        const result: TransferResult = { transfer: stripInternal(row), replayed: row.replayed === true, customerCreated: row.customer_created === true };
        if (result.customerCreated && result.transfer.to_customer_id) {
            try { await recomputeCustomerScore(result.transfer.to_customer_id); }
            catch (scoreError) { logger.warn('[ContractService] new holder scoring failed', { error: scoreError }); }
        }
        return result;
    } catch (error) {
        logger.error('[ContractService] transfer failed', { error });
        return { error: 'Гэрээ шилжүүлснийг баталгаажуулж чадсангүй. Хуудсаа шинэчлээд ижил хүсэлтээр дахин оролдоно уу.', status: 500 };
    }
}

/** Нэг гэрээний эзэмшигчийн түүх (шинэ нь эхэнд). Migration ороогүй бол available=false. */
export async function listContractTransfers(db: SupabaseClient, shopId: string, contractId: string, limit = 50): Promise<{ transfers: ContractTransfer[]; available: boolean } | Failure> {
    const { data, error } = await db.from('contract_transfers').select(CONTRACT_TRANSFER_FIELDS)
        .eq('shop_id', shopId).eq('contract_id', contractId)
        .order('created_at', { ascending: false }).order('id').limit(limit);
    if (error) {
        if (isMissingTransfersTable(error)) return { transfers: [], available: false };
        logger.error('[ContractService] transfer history read failed', { error });
        return { error: 'Эзэмшигчийн түүх уншиж чадсангүй', status: 500 };
    }
    return { transfers: (data || []) as unknown as ContractTransfer[], available: true };
}

/** Хайлтын үгийг PostgREST `.or()`-д аюулгүй болгоно (таслал, хаалт, %/_ хасна). */
function sanitizeTerm(term: string): string {
    return term.replace(/[%_,()\\*]/g, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * Өмнөх эзэмшигчийн нэр, утас, регистрээр гэрээний ID-г олно (шилжүүлсэн гэрээ хуучин
 * худалдан авагчаараа ч хайлтад гарна). URL-ийн уртаас сэргийлж сүүлийн 100.
 */
export async function contractIdsByPreviousHolder(db: SupabaseClient, shopId: string, term: string): Promise<string[]> {
    const search = sanitizeTerm(term);
    if (!search) return [];
    const { data, error } = await db.from('contract_transfers').select('contract_id')
        .eq('shop_id', shopId)
        .or(['from_customer_name', 'from_first_name', 'from_last_name', 'from_phone', 'from_mobile', 'from_registration']
            .map(column => `${column}.ilike.%${search}%`).join(','))
        .order('created_at', { ascending: false }).limit(100);
    if (error) {
        if (isMissingTransfersTable(error)) return [];
        throw new Error(`Өмнөх эзэмшигчээр хайж чадсангүй: ${error.message}`);
    }
    return [...new Set((data || []).map(row => String(row.contract_id)))];
}

/** Экспорт: shop-ийн бүх гэрээний шилжүүлгийн хураангуй (анхны худалдан авагч, сүүлийн огноо). */
export async function loadContractTransferSummaries(db: SupabaseClient, shopId: string): Promise<Map<string, ContractTransferSummary>> {
    let rows: Array<Pick<ContractTransfer, 'contract_id' | 'kind' | 'effective_date' | 'from_customer_name' | 'created_at'>>;
    try {
        rows = await fetchAllRows((from, to) => db.from('contract_transfers')
            .select('contract_id, kind, effective_date, from_customer_name, created_at')
            .eq('shop_id', shopId).order('created_at').order('id').range(from, to));
    } catch (error) {
        if (isMissingTransfersTable({ message: error instanceof Error ? error.message : String(error) })) return new Map();
        throw error;
    }
    const byContract = new Map<string, typeof rows>();
    for (const row of rows) {
        const list = byContract.get(row.contract_id);
        if (list) list.push(row); else byContract.set(row.contract_id, [row]);
    }
    return new Map([...byContract].map(([id, list]) => [id, summarizeContractTransfers(list)]));
}

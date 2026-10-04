/**
 * AI tool — гэрээ шилжүүлэх (өөр хүнд) / эзэмшигчийн нэр засах.
 * Бичилт UI-тай ижил `ContractService.transferContract` → `transfer_contract` RPC-ээр.
 * Preview-д тогтсон гэрээ, огноо, хүсэлтийн UUID, одоогийн эзэмшигч баталгаажуулалт
 * хүртэл хэвээр дамжина: давтан баталгаажуулалт давхар шилжүүлэг үүсгэхгүй, хооронд нь
 * эзэмшигч солигдсон бол RPC татгалзана. Хураамжийг add_contract_payment-ээр бүртгэнэ.
 */
import { randomUUID } from 'node:crypto';
import { supabaseAdmin } from '@/lib/supabase';
import { ubDateStr } from '@/lib/utils/date';
import { formatMNT } from '@/lib/utils/currency';
import { UNRESTRICTED_SALES_SCOPE, type SalesProjectScope } from '@/lib/sales/project-scope';
import { CONTRACT_TRANSFER_KIND_META } from '@/lib/contracts/labels';
import {
    TransferContractSchema, isTransferableContract, transferDateError, transferInputError,
    type ContractTransferKind, type TransferContractInput,
} from '@/lib/contracts/transfer';
import { transferContract } from '@/lib/services/ContractService';

type Args = Record<string, any>;

interface TransferContractRow {
    id: string;
    contract_number: string | null;
    unit_label: string | null;
    contract_status: string | null;
    contract_date: string | null;
    sales_manager: string | null;
    customer_name: string | null;
    customer_registration: string | null;
    total_price: number | null;
    paid_amount: number | null;
    balance: number | null;
}

const CONTRACT_FIELDS = 'id, contract_number, unit_label, contract_status, contract_date, sales_manager, customer_name, customer_registration, total_price, paid_amount, balance';
const OPTIONAL_KEYS = ['customer_last_name', 'customer_first_name', 'customer_registration', 'customer_phone', 'reason'] as const;
const INPUT_KEYS = ['client_request_id', 'kind', 'customer_name', ...OPTIONAL_KEYS, 'effective_date', 'expected_customer_name'] as const;

const likePattern = (value: unknown) => `%${String(value).trim().replace(/[\\%_]/g, '\\$&')}%`;

function confirmNeeded(tool: string, args: Args, label: string, preview: Record<string, unknown>) {
    return { requiresConfirmation: true, action: { tool, args }, label, preview };
}

async function findTransferContract(shopId: string, args: Args): Promise<{ contract: TransferContractRow } | { error: string; options?: unknown[] }> {
    let query = supabaseAdmin().from('property_contracts').select(CONTRACT_FIELDS).eq('shop_id', shopId).is('deleted_at', null);
    if (args.contract_id) query = query.eq('id', String(args.contract_id));
    else if (args.contract_number) query = query.ilike('contract_number', likePattern(args.contract_number));
    else if (args.current_holder_name) query = query.ilike('customer_name', likePattern(args.current_holder_name));
    else return { error: 'contract_id, contract_number эсвэл одоогийн эзэмшигчийн нэр (current_holder_name) шаардлагатай' };
    const { data, error } = await query.order('contract_date', { ascending: false, nullsFirst: false }).limit(5);
    if (error) return { error: 'Гэрээ хайхад алдаа гарлаа' };
    const rows = (data || []) as unknown as TransferContractRow[];
    if (!rows.length) return { error: 'Гэрээ олдсонгүй' };
    if (rows.length > 1 && !args.contract_id) {
        return { error: 'Олон гэрээ таарлаа — аль гэрээг шилжүүлэхийг тодруул (ask_user)', options: rows.map(c => ({ id: c.id, contract_number: c.contract_number, unit_label: c.unit_label, customer_name: c.customer_name })) };
    }
    return { contract: rows[0] };
}

/** Preview-ээс ирсэн args-аас зөвхөн schema-гийн талбарыг авна (бусад түлхүүр RPC-д орохгүй). */
function pickInput(args: Args): TransferContractInput {
    return Object.fromEntries(INPUT_KEYS.filter(key => args[key] !== undefined).map(key => [key, args[key]])) as unknown as TransferContractInput;
}

export async function transferContractTool(
    shopId: string,
    args: Args,
    confirm: boolean,
    actor: { userId: string; userName: string; scope?: SalesProjectScope },
) {
    const scope = actor.scope ?? UNRESTRICTED_SALES_SCOPE;
    const kind: ContractTransferKind | null = args.kind === 'transfer' || args.kind === 'rename' ? args.kind : null;
    if (!kind) return { error: 'Төрлийг тодруулна уу: transfer (өөр хүнд шилжүүлэх) эсвэл rename (ижил хүний нэр засах).', missingFields: ['kind'] };

    if (confirm) {
        if (!args.contract_id || !args.client_request_id) {
            return { error: 'Шилжүүлгийн баталгаажуулах мэдээлэл дутуу байна. Урьдчилсан мэдээллийг дахин гаргана уу.' };
        }
        const result = await transferContract(supabaseAdmin(), shopId, String(args.contract_id), pickInput(args), {
            userId: actor.userId, name: actor.userName || null, scope,
        });
        if ('error' in result) return { error: result.error };
        const { transfer } = result;
        const label = args.contract_number ? `Гэрээ ${args.contract_number}` : 'Гэрээ';
        return {
            success: true,
            transferId: transfer.id,
            message: transfer.kind === 'rename'
                ? `${label}-ийн эзэмшигчийн нэр засагдлаа: ${transfer.from_customer_name || '—'} → ${transfer.to_customer_name}.`
                : `${label} ${transfer.from_customer_name || '—'} → ${transfer.to_customer_name} шилжлээ. Төлсөн дүн, төлбөрийн график, менежер хэвээр.`,
        };
    }

    const found = await findTransferContract(shopId, args);
    if ('error' in found) return found;
    const c = found.contract;
    if (!isTransferableContract(c.contract_status)) {
        return { error: 'Зөвхөн идэвхтэй эсвэл хаагдсан гэрээг шилжүүлнэ (цуцалсан, тоот шилжсэн гэрээ боломжгүй).' };
    }
    if (scope.projectIds !== null && (!scope.managerName || c.sales_manager !== scope.managerName)) {
        return { error: 'Зөвхөн өөрийн борлуулсан гэрээг шилжүүлэх боломжтой.' };
    }

    const today = ubDateStr();
    const input: Args = {
        client_request_id: args.client_request_id ?? randomUUID(),
        kind,
        customer_name: String(args.customer_name ?? ''),
        effective_date: args.effective_date ? String(args.effective_date).slice(0, 10) : today,
        expected_customer_name: c.customer_name ?? null,
    };
    for (const key of OPTIONAL_KEYS) {
        if (args[key] !== undefined && args[key] !== null && String(args[key]).trim() !== '') input[key] = String(args[key]);
    }
    const parsed = TransferContractSchema.safeParse(input);
    if (!parsed.success) {
        return { error: `${transferInputError(parsed.error)} Хэрэглэгчээс тодруулна уу; мэдээллийг бүү зохио.`, missingFields: [...new Set(parsed.error.issues.map(issue => String(issue.path[0])))] };
    }
    const dateError = transferDateError(parsed.data.effective_date ?? today, c.contract_date, today);
    if (dateError) return { error: dateError };
    if (parsed.data.customer_registration) input.customer_registration = parsed.data.customer_registration;

    const meta = CONTRACT_TRANSFER_KIND_META[kind];
    const contractLabel = c.contract_number || c.unit_label || c.customer_name || 'гэрээ';
    return confirmNeeded('transfer_contract', { contract_id: c.id, contract_number: c.contract_number, ...input }, `${meta.action}: ${contractLabel}`, {
        Гэрээ: contractLabel,
        Төрөл: meta.label,
        'Одоогийн эзэмшигч': c.customer_name || '—',
        [kind === 'transfer' ? 'Шинэ эзэмшигч' : 'Зассан нэр']: parsed.data.customer_name,
        ...(kind === 'transfer' ? { Регистр: input.customer_registration, Утас: input.customer_phone || '-' } : {}),
        'Шилжүүлсэн огноо': input.effective_date,
        'Төлсөн дүн (хэвээр)': formatMNT(Number(c.paid_amount) || 0),
        Үлдэгдэл: formatMNT(Number(c.balance) || 0),
        Шалтгаан: input.reason || '-',
        Анхаар: 'Менежер, гэрээний огноо, дугаар, төлбөр өөрчлөгдөхгүй',
    });
}

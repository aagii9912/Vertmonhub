'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { dashboardFetch, dashboardJson, dashboardMutate } from '@/lib/api/dashboardFetch';
import type { ContractTransfer, PropertyContract } from '@/types/property';
import type { TransferContractInput } from '@/lib/contracts/transfer';

export type ContractRow = PropertyContract;

/**
 * Жагсаалтын статистик (`lib/contracts/summary.ts`, цуцалсныг мөнгөн дүнд оруулахгүй).
 * Шинэ талбарууд optional — хуучин хариу (e2e mock) ч зөв харагдана.
 */
export interface ContractStats {
    total: number;
    closed: number;
    active: number;
    cancelled?: number;
    transferred?: number;
    total_sales: number;
    /** Гэрээний нөхцлөөр төлөх урьдчилгаа (орсон мөнгө биш). */
    prepayment_due?: number;
    /** Төлбөр хоцролт ₮ (сүүлийн HUB файлын огноотой мөр); мэдэгдэхгүй бол null. */
    overdue_amount?: number | null;
    overdue_as_of?: string | null;
    overdue_count: number;
    /** Хоцролт нь өмнөх файлынх (нийлбэрт ороогүй). */
    overdue_stale?: number;
    /** Системийн (cron) хоногоор хоцорсон гэрээ. */
    overdue_days_count?: number;
    total_paid: number;
    total_balance: number;
    /** Төлсөн дүн тодорхойгүй гэрээний тоо (нийлбэрт ороогүй). */
    unknown_paid?: number;
    area?: number;
}

export interface ContractListImportInfo {
    report_date: string;
    file_name: string | null;
    row_count: number;
    not_in_file?: number;
}

export interface ContractFacets {
    blocks: string[];
    paymentConditions: string[];
    productTypes: string[];
}

export interface ContractsListParams {
    search?: string;
    status?: string;
    manager?: string;
    productType?: string;
    block?: string;
    paymentCondition?: string;
    overdue?: boolean;
    /** Огноогүй амьд гэрээ (сарын гүйцэтгэлд ороогүй). */
    undated?: boolean;
    /** Сүүлийн HUB файлд байгаагүй гэрээ. */
    notInLatest?: boolean;
    /** «Захиалга өгсөн огноо» (YYYY-MM-DD). */
    from?: string;
    to?: string;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
    page: number;
    pageSize: number;
}

export interface ContractsListResult {
    contracts: ContractRow[];
    /** Төслийн бүх гэрээний статистик (шүүлтгүй). */
    stats: ContractStats;
    /** Шүүсэн гэрээний нийлбэр (хүснэгтийн хөл). */
    footer?: ContractStats;
    latestImport?: ContractListImportInfo | null;
    facets?: ContractFacets;
    pagination: { total: number; page: number; pageSize: number; totalPages: number; hasMore: boolean };
}

const selected = (value?: string) => !!value && value !== 'all';

export function contractsListSearch(p: ContractsListParams): string {
    const sp = new URLSearchParams();
    if (p.search) sp.set('search', p.search);
    if (selected(p.status)) sp.set('status', p.status!);
    if (selected(p.manager)) sp.set('manager', p.manager!);
    if (selected(p.productType)) sp.set('productType', p.productType!);
    if (selected(p.block)) sp.set('block', p.block!);
    if (selected(p.paymentCondition)) sp.set('paymentCondition', p.paymentCondition!);
    if (p.overdue) sp.set('overdue', '1');
    if (p.undated) sp.set('undated', '1');
    if (p.notInLatest) sp.set('notInLatest', '1');
    if (p.from) sp.set('from', p.from);
    if (p.to) sp.set('to', p.to);
    if (p.sortBy) sp.set('sortBy', p.sortBy);
    if (p.sortOrder) sp.set('sortOrder', p.sortOrder);
    sp.set('page', String(p.page));
    sp.set('pageSize', String(p.pageSize));
    return sp.toString();
}

export function useContractsList(p: ContractsListParams) {
    const { shop } = useAuth();
    const shopId = shop?.id;
    const search = contractsListSearch(p);
    return useQuery<ContractsListResult>({
        queryKey: ['contracts', 'list', shopId, p],
        queryFn: () => dashboardJson<ContractsListResult>(`/api/dashboard/contracts?${search}`),
        enabled: !!shopId,
        staleTime: 30_000,
        placeholderData: (prev) => prev,
    });
}

export function useContract(id: string | null) {
    const { shop } = useAuth();
    return useQuery<{ contract: ContractRow }>({
        queryKey: ['contracts', 'detail', shop?.id, id],
        queryFn: () => dashboardJson<{ contract: ContractRow }>(`/api/dashboard/contracts/${id}`),
        enabled: !!shop?.id && !!id,
        staleTime: 15_000,
        // ContractDetail алдааг (404 «олдсонгүй» гэх мэт) «Дахин оролдох»-той өөрөө харуулна.
        meta: { inlineError: true },
    });
}

/** Гэрээний огноо, менежер өөрчлөгдвөл сар, долоо хоногийн тайлан, төлөвлөгөөний биелэлт ч шинэчлэгдэнэ. */
const CONTRACT_DATE_READERS = ['contracts', 'director', 'operations-report', 'weekly-sales', 'kpi-report', 'my-stats', 'plan-performance', 'admin-sales-targets'];

export interface ContractManagerOption { name: string; roster: boolean; contracts: number }

/** Гэрээний менежер сонгох нэрс (roster + гэрээнд бичигдсэн ERP нэр); засах үед л уншина. */
export function useContractManagerOptions(enabled: boolean) {
    const { shop } = useAuth();
    return useQuery<ContractManagerOption[]>({
        queryKey: ['contracts', 'managers', shop?.id],
        queryFn: async () => (await dashboardJson<{ managers: ContractManagerOption[] }>('/api/dashboard/contracts/managers')).managers,
        enabled: !!shop?.id && enabled,
        staleTime: 5 * 60_000,
    });
}

/** Гэрээний менежерийг солих (PATCH `sales_manager`; хязгааргүй хэрэглэгч, сервер аудит бичнэ). */
export function useSetContractManager(contractId: string) {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (name: string) => dashboardMutate<{ contract: ContractRow }>(`/api/dashboard/contracts/${contractId}`, 'PATCH', { sales_manager: name }),
        onSettled: () => {
            for (const key of CONTRACT_DATE_READERS) void qc.invalidateQueries({ queryKey: [key] });
        },
    });
}

/** Гэрээний төлөв уншигчид: огноо/менежерийн уншигчид + байрны шатар (`units`: цуцалсан гэрээний худалдан авагчийг харуулдаггүй). */
const CONTRACT_STATUS_READERS = [...CONTRACT_DATE_READERS, 'units'];

/** «Цуцлах» / «Сэргээх» (PATCH `contract_status`). Хуудас шууд шинэ төлөвийг харуулж, тайлангууд дахин уншина. */
export function useSetContractStatus(contractId: string) {
    const qc = useQueryClient();
    const { shop } = useAuth();
    return useMutation({
        mutationFn: (status: 'cancelled' | 'active') =>
            dashboardMutate<{ contract: ContractRow }>(`/api/dashboard/contracts/${contractId}`, 'PATCH', { contract_status: status }),
        onSuccess: (data) => {
            if (data?.contract) qc.setQueryData(['contracts', 'detail', shop?.id, contractId], { contract: data.contract });
        },
        onSettled: () => {
            for (const key of CONTRACT_STATUS_READERS) void qc.invalidateQueries({ queryKey: [key] });
        },
    });
}

/** «Огноо оруулах»: захиалга өгсөн огноо хоосон гэрээнд нэг удаа (PATCH `order_date`; гэрээний огноо хоосон бол мөн бөглөнө). */
export function useSetContractOrderDate(contractId: string) {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (orderDate: string) => dashboardMutate<{ contract: ContractRow }>(`/api/dashboard/contracts/${contractId}`, 'PATCH', { order_date: orderDate }),
        onSettled: () => {
            for (const key of CONTRACT_DATE_READERS) void qc.invalidateQueries({ queryKey: [key] });
        },
    });
}

export interface PaymentRow {
    id: string;
    contract_id: string;
    installment_number: number;
    label: string | null;
    due_date: string;
    amount: number;
    paid_amount: number | null;
    paid_date: string | null;
    payment_method: string | null;
    receipt_kind?: 'advance' | 'installment' | 'other' | null;
    status: 'pending' | 'paid' | 'overdue' | 'partial' | 'cancelled';
    notes: string | null;
}

export function usePayments(contractId: string | null) {
    const { shop } = useAuth();
    return useQuery<{ payments: PaymentRow[] }>({
        queryKey: ['contracts', 'payments', shop?.id, contractId],
        queryFn: () => dashboardJson<{ payments: PaymentRow[] }>(`/api/dashboard/contracts/${contractId}/payments`),
        enabled: !!shop?.id && !!contractId,
        staleTime: 15_000,
        // Ачаалж чадаагүй хуваарийг «оруулаагүй» гэж харуулахгүй — панель өөрөө алдаа + «Дахин оролдох».
        meta: { inlineError: true },
    });
}

export interface PaymentInput {
    client_request_id?: string;
    installment_number: number;
    label?: string | null;
    due_date: string;
    amount: number;
    paid_amount: number;
    paid_date?: string | null;
    payment_method?: string | null;
    receipt_kind?: 'advance' | 'installment' | 'other' | null;
    notes?: string | null;
}

export function useAddPayment(contractId: string) {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (input: PaymentInput) => dashboardMutate(`/api/dashboard/contracts/${contractId}/payments`, 'POST', input),
        onSuccess: () => {
            void qc.invalidateQueries({ queryKey: ['contracts'] });
            void qc.invalidateQueries({ queryKey: ['director'] });
        },
    });
}

export function useUpdatePayment(contractId: string) {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (input: { payment_id: string } & Partial<Pick<PaymentInput, 'paid_amount' | 'paid_date' | 'payment_method' | 'receipt_kind' | 'notes' | 'amount' | 'due_date'>>) =>
            dashboardMutate(`/api/dashboard/contracts/${contractId}/payments`, 'PATCH', input),
        onSuccess: () => {
            void qc.invalidateQueries({ queryKey: ['contracts'] });
            void qc.invalidateQueries({ queryKey: ['director'] });
        },
    });
}

/** Эзэмшигчийн түүх (шилжүүлэг, нэр засвар). available=false — migration хараахан ороогүй. */
export function useContractTransfers(contractId: string | null) {
    const { shop } = useAuth();
    return useQuery<{ transfers: ContractTransfer[]; available: boolean }>({
        queryKey: ['contracts', 'transfers', shop?.id, contractId],
        queryFn: () => dashboardJson<{ transfers: ContractTransfer[]; available: boolean }>(`/api/dashboard/contracts/${contractId}/transfer`),
        enabled: !!shop?.id && !!contractId,
        staleTime: 15_000,
    });
}

export interface ContractTransferResponse { transfer: ContractTransfer; replayed: boolean; message: string }

/**
 * Гэрээ шилжүүлэх / нэр засах. Гэрээ, захирлын самбар, лидийн түүхийг шинэчилнэ.
 * Алдааны HTTP төлөвийг `status`-аар дамжуулна (409 = хуучирсан эзэмшигч эсвэл ашиглагдсан хүсэлт).
 * Алдаа гарвал гэрээ, эзэмшигчийн түүхийг дахин уншина — цонх шинэ эзэмшигчийг харуулж, хуучин
 * `expected_customer_name`-ээр 409-д гацахгүй.
 */
export function useTransferContract(contractId: string) {
    const qc = useQueryClient();
    const { shop } = useAuth();
    return useMutation({
        mutationFn: async (input: TransferContractInput) => {
            const res = await dashboardFetch(`/api/dashboard/contracts/${contractId}/transfer`, { method: 'POST', body: JSON.stringify(input) });
            const body = await res.json().catch(() => null) as (Partial<ContractTransferResponse> & { error?: string }) | null;
            if (!res.ok) throw Object.assign(new Error(body?.error || `Хүсэлт амжилтгүй (${res.status})`), { status: res.status });
            return body as ContractTransferResponse;
        },
        onSuccess: () => {
            void qc.invalidateQueries({ queryKey: ['contracts'] });
            void qc.invalidateQueries({ queryKey: ['director'] });
            void qc.invalidateQueries({ queryKey: ['leads'] });
        },
        onError: () => {
            void qc.invalidateQueries({ queryKey: ['contracts', 'detail', shop?.id, contractId] });
            void qc.invalidateQueries({ queryKey: ['contracts', 'transfers', shop?.id, contractId] });
        },
    });
}

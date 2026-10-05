'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { dashboardFetch, dashboardJson, dashboardMutate } from '@/lib/api/dashboardFetch';
import type { ContractTransfer, PropertyContract } from '@/types/property';
import type { TransferContractInput } from '@/lib/contracts/transfer';

export type ContractRow = PropertyContract;

export interface ContractStats {
    total: number;
    closed: number;
    active: number;
    total_sales: number;
    total_paid: number;
    total_balance: number;
    overdue_count: number;
}

export interface ContractsListParams {
    search?: string;
    status?: string;
    manager?: string;
    overdue?: boolean;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
    page: number;
    pageSize: number;
}

export interface ContractsListResult {
    contracts: ContractRow[];
    stats: ContractStats;
    pagination: { total: number; page: number; pageSize: number; totalPages: number; hasMore: boolean };
}

export function useContractsList(p: ContractsListParams) {
    const { shop } = useAuth();
    const shopId = shop?.id;
    const sp = new URLSearchParams();
    if (p.search) sp.set('search', p.search);
    if (p.status && p.status !== 'all') sp.set('status', p.status);
    if (p.manager && p.manager !== 'all') sp.set('manager', p.manager);
    if (p.overdue) sp.set('overdue', '1');
    if (p.sortBy) sp.set('sortBy', p.sortBy);
    if (p.sortOrder) sp.set('sortOrder', p.sortOrder);
    sp.set('page', String(p.page));
    sp.set('pageSize', String(p.pageSize));
    return useQuery<ContractsListResult>({
        queryKey: ['contracts', 'list', shopId, p],
        queryFn: () => dashboardJson<ContractsListResult>(`/api/dashboard/contracts?${sp.toString()}`),
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

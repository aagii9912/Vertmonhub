'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { dashboardJson, dashboardMutate } from '@/lib/api/dashboardFetch';
import type { PropertyContract } from '@/types/property';

export type ContractRow = PropertyContract & { lead_id?: string | null; project_id?: string | null };

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
    });
}

export interface PaymentInput {
    installment_number: number;
    label?: string | null;
    due_date: string;
    amount: number;
    paid_amount: number;
    paid_date?: string | null;
    payment_method?: string | null;
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
        mutationFn: (input: { payment_id: string } & Partial<Pick<PaymentInput, 'paid_amount' | 'paid_date' | 'payment_method' | 'notes' | 'amount' | 'due_date'>>) =>
            dashboardMutate(`/api/dashboard/contracts/${contractId}/payments`, 'PATCH', input),
        onSuccess: () => {
            void qc.invalidateQueries({ queryKey: ['contracts'] });
            void qc.invalidateQueries({ queryKey: ['director'] });
        },
    });
}

export const CONTRACT_STATUS_META: Record<string, { label: string; tone: 'info' | 'success' | 'danger' | 'neutral' }> = {
    active: { label: 'Идэвхтэй', tone: 'info' },
    closed: { label: 'Хаагдсан', tone: 'success' },
    cancelled: { label: 'Цуцалсан', tone: 'danger' },
};
export const PAYMENT_STATUS_META: Record<string, { label: string; tone: 'info' | 'success' | 'danger' | 'neutral' | 'pending' }> = {
    pending: { label: 'Хүлээгдэж буй', tone: 'neutral' },
    paid: { label: 'Төлсөн', tone: 'success' },
    partial: { label: 'Хагас төлсөн', tone: 'pending' },
    overdue: { label: 'Хугацаа хэтэрсэн', tone: 'danger' },
    cancelled: { label: 'Цуцалсан', tone: 'neutral' },
};
export const PAYMENT_METHOD_LABEL: Record<string, string> = {
    cash: 'Бэлэн',
    bank_transfer: 'Банк шилжүүлэг',
    barter: 'Бартер',
    mortgage: 'Ипотек',
};

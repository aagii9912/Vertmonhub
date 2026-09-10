'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { dashboardJson, dashboardMutate } from '@/lib/api/dashboardFetch';
import type { Lead } from '@/types/property';
import type { LeadView } from '@/lib/leads/labels';
import type { LeadActivity } from '@/lib/leads/activities';

export type LeadRow = Lead & { lost_reason?: string | null };

export interface LeadsListParams {
    view: LeadView;
    status?: string;
    source?: string;
    manager?: string;
    period?: string;
    q?: string;
    sort?: string;
    dir?: 'asc' | 'desc';
    page: number;
    pageSize: number;
}

export interface LeadsListResult {
    leads: LeadRow[];
    pagination: { total: number; page: number; pageSize: number; totalPages: number; hasMore: boolean };
}

function buildQuery(p: LeadsListParams): string {
    const sp = new URLSearchParams();
    if (p.view && p.view !== 'all') sp.set('view', p.view);
    if (p.status && p.status !== 'all') sp.set('status', p.status);
    if (p.source && p.source !== 'all') sp.set('source', p.source);
    if (p.manager && p.manager !== 'all') sp.set('manager', p.manager);
    if (p.period && p.period !== 'all') sp.set('period', p.period);
    if (p.q) sp.set('q', p.q);
    if (p.sort) sp.set('sort', p.sort);
    if (p.dir) sp.set('dir', p.dir);
    sp.set('page', String(p.page));
    sp.set('pageSize', String(p.pageSize));
    return sp.toString();
}

/** Лидийн жагсаалт — хуудас солиход өмнөх өгөгдөл хэвээр (spinner-гүй). */
export function useLeadsList(params: LeadsListParams) {
    const { shop } = useAuth();
    const shopId = shop?.id;
    return useQuery<LeadsListResult>({
        queryKey: ['leads', 'list', shopId, params],
        queryFn: () => dashboardJson<LeadsListResult>(`/api/dashboard/leads?${buildQuery(params)}`),
        enabled: !!shopId,
        staleTime: 20_000,
        placeholderData: (prev) => prev,
    });
}

export interface LeadSummary {
    all: number;
    mine: number;
    new: number;
    meetings: number;
    active: number;
    mineName: string | null;
}

export function useLeadSummary() {
    const { shop } = useAuth();
    const shopId = shop?.id;
    return useQuery<LeadSummary>({
        queryKey: ['leads', 'summary', shopId],
        queryFn: () => dashboardJson<LeadSummary>('/api/dashboard/leads/summary'),
        enabled: !!shopId,
        staleTime: 30_000,
    });
}

export interface LeadDetail {
    lead: LeadRow;
    viewings: {
        id: string;
        scheduled_at: string;
        status: string | null;
        meeting_type: string | null;
        property_id: string | null;
        property_name: string | null;
        agent_notes: string | null;
        customer_feedback: string | null;
        interest_level: number | null;
        sales_manager_name: string | null;
    }[];
    contracts: {
        id: string;
        contract_number: string | null;
        contract_status: string | null;
        contract_date: string | null;
        total_price: number | null;
        paid_amount: number | null;
        balance: number | null;
        unit_number: string | null;
        block_name: string | null;
    }[];
    activities: LeadActivity[];
    property: { id: string; name: string; price: number | null; rooms: number | null; size_sqm: number | null; status: string | null; images: string[] | null } | null;
}

export function useLeadDetail(id: string | null) {
    const { shop } = useAuth();
    const shopId = shop?.id;
    return useQuery<LeadDetail>({
        queryKey: ['leads', 'detail', shopId, id],
        queryFn: () => dashboardJson<LeadDetail>(`/api/dashboard/leads/${id}`),
        enabled: !!shopId && !!id,
        staleTime: 10_000,
    });
}

export interface ManagerOption {
    name: string;
    is_active: boolean;
}

/** Менежерийн жагсаалт (reports эрхгүй бол хоосон — сонгогч нуугдана). */
export function useManagers() {
    const { shop } = useAuth();
    const shopId = shop?.id;
    return useQuery<ManagerOption[]>({
        queryKey: ['managers', shopId],
        queryFn: async () => {
            try {
                const r = await dashboardJson<{ managers: ManagerOption[] }>('/api/dashboard/managers');
                return (r.managers || []).filter((m) => m.is_active !== false);
            } catch {
                return [];
            }
        },
        enabled: !!shopId,
        staleTime: 5 * 60_000,
    });
}

export type LeadPatch = Partial<{
    status: string;
    lost_reason: string | null;
    notes: string;
    sales_manager_name: string | null;
    next_followup_at: string | null;
    last_contact_at: string;
    preferred_rooms: number | null;
    preferred_type: string | null;
    budget_max: number | null;
}>;

/**
 * Лид засах — жагсаалтын cache-д ШУУД (optimistic) тусгаж, дараа нь серверээс
 * баталгаажуулна. Алдаа гарвал буцаана.
 */
export function useUpdateLead() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: ({ id, patch }: { id: string; patch: LeadPatch }) => dashboardMutate(`/api/dashboard/leads/${id}`, 'PATCH', patch),
        onMutate: async ({ id, patch }) => {
            await qc.cancelQueries({ queryKey: ['leads', 'list'] });
            const snapshots = qc.getQueriesData<LeadsListResult>({ queryKey: ['leads', 'list'] });
            for (const [key, data] of snapshots) {
                if (!data) continue;
                qc.setQueryData<LeadsListResult>(key, {
                    ...data,
                    leads: data.leads.map((l) => (l.id === id ? { ...l, ...patch } as LeadRow : l)),
                });
            }
            qc.setQueriesData<LeadDetail>({ queryKey: ['leads', 'detail'] }, (d) => (d && d.lead.id === id ? { ...d, lead: { ...d.lead, ...patch } as LeadRow } : d));
            return { snapshots };
        },
        onError: (_e, _v, ctx) => {
            for (const [key, data] of ctx?.snapshots ?? []) qc.setQueryData(key, data);
        },
        onSettled: () => {
            void qc.invalidateQueries({ queryKey: ['leads', 'list'] });
            void qc.invalidateQueries({ queryKey: ['leads', 'summary'] });
            void qc.invalidateQueries({ queryKey: ['leads', 'detail'] });
            void qc.invalidateQueries({ queryKey: ['nav-counts'] });
            void qc.invalidateQueries({ queryKey: ['my-stats'] });
        },
    });
}

export function useAddLeadActivity(leadId: string | null) {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (input: { type: 'note' | 'call'; content: string; next_followup_at?: string | null }) =>
            dashboardMutate<{ activity: LeadActivity | null }>(`/api/dashboard/leads/${leadId}/activities`, 'POST', input),
        onSuccess: () => {
            void qc.invalidateQueries({ queryKey: ['leads', 'detail'] });
            void qc.invalidateQueries({ queryKey: ['leads', 'list'] });
            void qc.invalidateQueries({ queryKey: ['my-stats'] });
        },
    });
}

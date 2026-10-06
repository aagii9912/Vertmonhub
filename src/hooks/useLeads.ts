'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { dashboardJson, dashboardMutate } from '@/lib/api/dashboardFetch';
import type { Lead } from '@/types/property';
import type { LeadCategoryOption, LeadView } from '@/lib/leads/labels';
import type { LeadActivity } from '@/lib/leads/activities';
import type { LeadTimeline } from '@/lib/leads/timeline';
import type { LeadWorkQueue } from '@/lib/leads/work-queue';
import type { LeadCustomerCard } from '@/lib/leads/customer-card-load';

export type LeadRow = Lead & { lost_reason?: string | null; project_id?: string | null };

export interface LeadsListParams {
    view: LeadView;
    queue?: LeadWorkQueue;
    status?: string;
    source?: string;
    manager?: string;
    project?: string;
    /** Лидийн ангилал: id эсвэл `none` (ангилалгүй). */
    category?: string;
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
    if (p.queue) sp.set('queue', p.queue);
    if (p.view && p.view !== 'all') sp.set('view', p.view);
    if (p.status && p.status !== 'all') sp.set('status', p.status);
    if (p.source && p.source !== 'all') sp.set('source', p.source);
    if (p.manager && p.manager !== 'all') sp.set('manager', p.manager);
    if (p.project && p.project !== 'all') sp.set('project', p.project);
    if (p.category && p.category !== 'all') sp.set('category', p.category);
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
    const { shop, user } = useAuth();
    const shopId = shop?.id;
    return useQuery<LeadsListResult>({
        queryKey: ['leads', 'list', shopId, user?.id, params, user?.role],
        queryFn: () => dashboardJson<LeadsListResult>(`/api/dashboard/leads?${buildQuery(params)}`),
        enabled: !!shopId,
        staleTime: 20_000,
        placeholderData: (prev, previousQuery) => previousQuery && previousQuery.queryKey[2] === shopId && previousQuery.queryKey[3] === user?.id && previousQuery.queryKey[5] === user?.role ? prev : undefined,
    });
}

export interface LeadSummary {
    all: number;
    mine: number;
    new: number;
    meetings: number;
    active: number;
    mineName: string | null;
    canClaim: boolean;
    queues: Record<LeadWorkQueue, number>;
}

export function useLeadSummary() {
    const { shop, user } = useAuth();
    const shopId = shop?.id;
    return useQuery<LeadSummary>({
        queryKey: ['leads', 'summary', shopId, user?.id, user?.role],
        queryFn: () => dashboardJson<LeadSummary>('/api/dashboard/leads/summary'),
        enabled: !!shopId,
        staleTime: 30_000,
    });
}

export interface LeadDetail {
    partial?: string[];
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
        sales_manager?: string | null;
    }[];
    activities: LeadActivity[];
    /** Менежерүүдийн Time-line (хуучин fixture/алдаатай үед байхгүй эсвэл null). */
    timeline?: LeadTimeline | null;
    property: { id: string; name: string; price: number | null; rooms: number | null; size_sqm: number | null; status: string | null; images: string[] | null } | null;
}

export function useLeadDetail(id: string | null) {
    const { shop, user } = useAuth();
    const shopId = shop?.id;
    return useQuery<LeadDetail>({
        queryKey: ['leads', 'detail', shopId, user?.id, id, user?.role],
        queryFn: () => dashboardJson<LeadDetail>(`/api/dashboard/leads/${id}`),
        enabled: !!shopId && !!id,
        staleTime: 10_000,
    });
}

/**
 * Харилцагчийн картын лидээс гадуурх хэсгүүд (харилцагч, мессеж, гэрээ, санал гомдол) — эрхтэй хэсэг л ирнэ.
 * Карт нь алдааг өөрөө харуулдаг тул давхар toast гаргахгүй.
 */
export function useLeadCustomerCard(id: string | null) {
    const { shop, user } = useAuth();
    const shopId = shop?.id;
    return useQuery<LeadCustomerCard>({
        queryKey: ['leads', 'customer-card', shopId, user?.id, id, user?.role],
        queryFn: () => dashboardJson<LeadCustomerCard>(`/api/dashboard/leads/${id}/customer`),
        enabled: !!shopId && !!id,
        staleTime: 30_000,
        meta: { inlineError: true },
    });
}

export interface ManagerOption {
    name: string;
    is_active: boolean;
    assignable?: boolean;
    project_ids?: string[];
}

export interface LeadProject {
    id: string;
    name: string;
    status: string | null;
}

export function useLeadProjects() {
    const { shop, user } = useAuth();
    return useQuery<LeadProject[]>({
        queryKey: ['lead-projects', shop?.id, user?.id, user?.role],
        queryFn: async () => (await dashboardJson<{ projects: LeadProject[] }>('/api/dashboard/leads/projects')).projects,
        enabled: !!shop?.id,
        staleTime: 60_000,
    });
}

/** null төсөлтэй хуучин лидэд менежер сонгохгүй. */
export function useManagers(projectId?: string | null) {
    const { shop, user } = useAuth();
    const shopId = shop?.id;
    return useQuery<ManagerOption[]>({
        queryKey: ['managers', shopId, user?.id, projectId, user?.role],
        queryFn: async () => {
            try {
                const url = projectId ? `/api/dashboard/managers?project=${encodeURIComponent(projectId)}` : '/api/dashboard/managers';
                const r = await dashboardJson<{ managers: ManagerOption[] }>(url);
                return (r.managers || []).filter((m) => m.is_active !== false);
            } catch {
                return [];
            }
        },
        enabled: !!shopId && projectId !== null,
        staleTime: 5 * 60_000,
    });
}

/** Төслийн лидийн ангиллууд (архивласан нь орно — хуучин лидийн нэрийг харуулна; сонгогч идэвхтэйг л санал болгоно). */
export interface LeadCategoryRow extends LeadCategoryOption {
    description: string | null;
    sort_order: number;
}

/** `inlineError` — хуудас өөрөө анхны ачааллын алдааг (Alert) харуулдаг бол давхар toast гаргахгүй. */
export function useLeadCategories(options: { inlineError?: boolean } = {}) {
    const { shop, user } = useAuth();
    return useQuery<LeadCategoryRow[]>({
        queryKey: ['lead-categories', shop?.id, user?.id, user?.role],
        queryFn: async () => (await dashboardJson<{ categories: LeadCategoryRow[] }>('/api/dashboard/lead-categories?include=archived')).categories,
        enabled: !!shop?.id,
        staleTime: 5 * 60_000,
        ...(options.inlineError ? { meta: { inlineError: true } } : {}),
    });
}

export type LeadPatch = Partial<{
    /** Нэр нэмэх/засах (хоосолж болохгүй). */
    customer_name: string;
    project_id: string;
    status: string;
    lost_reason: string | null;
    notes: string;
    sales_manager_name: string | null;
    next_followup_at: string | null;
    last_contact_at: string;
    preferred_rooms: number | null;
    preferred_type: string | null;
    budget_max: number | null;
    /** Лидийн ангилал (null = ангилалгүй). */
    category_id: string | null;
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
            void qc.invalidateQueries({ queryKey: ['leads'] });
            void qc.invalidateQueries({ queryKey: ['operations-report'] });
            void qc.invalidateQueries({ queryKey: ['nav-counts'] });
            void qc.invalidateQueries({ queryKey: ['my-stats'] });
        },
    });
}

/** Тэмдэглэл / дуудлага эсвэл «Үнийн санал» (₮ бүхэл дүн, байр/тоот заавал биш). */
export type LeadActivityInput =
    | { type: 'note' | 'call'; content: string; next_followup_at?: string | null }
    | { type: 'quote'; amount: number; unit_label?: string | null; content?: string; next_followup_at?: string | null };

export function useAddLeadActivity(leadId: string | null) {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (input: LeadActivityInput) =>
            dashboardMutate<{ activity: LeadActivity | null }>(`/api/dashboard/leads/${leadId}/activities`, 'POST', input),
        onSettled: () => {
            void qc.invalidateQueries({ queryKey: ['leads', 'detail'] });
            void qc.invalidateQueries({ queryKey: ['leads', 'list'] });
            void qc.invalidateQueries({ queryKey: ['leads', 'summary'] });
            void qc.invalidateQueries({ queryKey: ['operations-report'] });
            void qc.invalidateQueries({ queryKey: ['my-stats'] });
            // Дуудлага өдрийн идэвх, сарын KPI-д тоологдоно.
            void qc.invalidateQueries({ queryKey: ['manager-activity'] });
            void qc.invalidateQueries({ queryKey: ['sales-kpi'] });
        },
    });
}

export function useClaimLead() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: ({ id, nextFollowupAt }: { id: string; nextFollowupAt: string }) =>
            dashboardMutate<{ success: boolean; warning?: string }>(`/api/dashboard/leads/${id}/claim`, 'POST', { next_followup_at: nextFollowupAt }),
        onSettled: () => {
            void qc.invalidateQueries({ queryKey: ['leads'] });
            void qc.invalidateQueries({ queryKey: ['my-stats'] });
            void qc.invalidateQueries({ queryKey: ['operations-report'] });
        },
    });
}

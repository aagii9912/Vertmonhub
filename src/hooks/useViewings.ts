'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { dashboardJson, dashboardMutate } from '@/lib/api/dashboardFetch';
import type { MeetingType, ViewingStatus } from '@/lib/viewings/labels';

export interface ViewingRow {
    id: string;
    scheduled_at: string;
    status: ViewingStatus;
    lead_id: string | null;
    property_id: string | null;
    customer_feedback: string | null;
    agent_notes: string | null;
    meeting_type: MeetingType | null;
    interest_level: number | null;
    completed_at: string | null;
    sales_manager_name: string | null;
    lead: { id: string; customer_name: string | null; customer_phone: string | null; status: string } | null;
    property: { id: string; name: string; district: string | null } | null;
}

export type ViewingRange = 'today' | 'upcoming' | 'past' | 'all';

export interface ViewingsResult {
    viewings: ViewingRow[];
    counts: { today: number; upcoming: number; past: number };
}

export function useViewings(params: { range: ViewingRange; status?: string; manager?: string; lead?: string }) {
    const { shop } = useAuth();
    const shopId = shop?.id;
    const sp = new URLSearchParams({ range: params.range });
    if (params.status && params.status !== 'all') sp.set('status', params.status);
    if (params.manager && params.manager !== 'all') sp.set('manager', params.manager);
    if (params.lead) sp.set('lead', params.lead);
    return useQuery<ViewingsResult>({
        queryKey: ['viewings', shopId, params],
        queryFn: () => dashboardJson<ViewingsResult>(`/api/dashboard/viewings?${sp.toString()}`),
        enabled: !!shopId,
        staleTime: 20_000,
        placeholderData: (prev) => prev,
    });
}

export interface CreateViewingInput {
    lead_id?: string | null;
    customer_name?: string | null;
    customer_phone?: string | null;
    property_id?: string | null;
    scheduled_at?: string | null;
    meeting_type: MeetingType;
    notes?: string | null;
    walk_in: boolean;
    interest_level?: number | null;
    feedback?: string | null;
}

function invalidateAll(qc: ReturnType<typeof useQueryClient>) {
    void qc.invalidateQueries({ queryKey: ['viewings'] });
    void qc.invalidateQueries({ queryKey: ['leads'] });
    void qc.invalidateQueries({ queryKey: ['my-stats'] });
    void qc.invalidateQueries({ queryKey: ['nav-counts'] });
    void qc.invalidateQueries({ queryKey: ['director'] });
}

export function useCreateViewing() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (input: CreateViewingInput) => dashboardMutate<{ viewing: { id: string }; lead_id: string | null }>('/api/dashboard/viewings', 'POST', input),
        onSuccess: () => invalidateAll(qc),
    });
}

export type ViewingPatch = Partial<{
    status: ViewingStatus;
    scheduled_at: string;
    agent_notes: string | null;
    customer_feedback: string | null;
    interest_level: number | null;
    next_followup_at: string | null;
}>;

export function useUpdateViewing() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: ({ id, patch }: { id: string; patch: ViewingPatch }) => dashboardMutate(`/api/dashboard/viewings/${id}`, 'PATCH', patch),
        onMutate: async ({ id, patch }) => {
            await qc.cancelQueries({ queryKey: ['viewings'] });
            const snapshots = qc.getQueriesData<ViewingsResult>({ queryKey: ['viewings'] });
            for (const [key, data] of snapshots) {
                if (!data) continue;
                qc.setQueryData<ViewingsResult>(key, { ...data, viewings: data.viewings.map((v) => (v.id === id ? { ...v, ...patch } as ViewingRow : v)) });
            }
            return { snapshots };
        },
        onError: (_e, _v, ctx) => { for (const [key, data] of ctx?.snapshots ?? []) qc.setQueryData(key, data); },
        onSettled: () => invalidateAll(qc),
    });
}

export interface PropertyOption {
    id: string;
    name: string;
    district: string | null;
    price: number | null;
    rooms: number | null;
    size_sqm: number | null;
    status: string | null;
}

export function usePropertySearch(q: string, enabled = true) {
    const { shop } = useAuth();
    return useQuery<PropertyOption[]>({
        queryKey: ['properties', 'search', shop?.id, q],
        queryFn: async () => (await dashboardJson<{ properties: PropertyOption[] }>(`/api/dashboard/properties/search?q=${encodeURIComponent(q)}`)).properties,
        enabled: !!shop?.id && enabled,
        staleTime: 60_000,
        placeholderData: (prev) => prev,
    });
}

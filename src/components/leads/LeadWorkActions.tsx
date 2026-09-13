'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { useClaimLead, useLeadSummary, useUpdateLead, type LeadRow } from '@/hooks/useLeads';
import { getLeadWorkQueues, LEAD_WORK_QUEUES } from '@/lib/leads/work-queue';
import { ACTIVE_STATUSES } from '@/lib/leads/labels';

export function LeadWorkActions({ lead, canWrite }: { lead: LeadRow; canWrite: boolean }) {
    const [at, setAt] = useState('');
    const claim = useClaimLead();
    const update = useUpdateLead();
    const { data: summary } = useLeadSummary();
    if (!ACTIVE_STATUSES.includes(lead.status)) return null;
    const queues = getLeadWorkQueues(lead);
    const unassigned = !lead.sales_manager_name;
    const canClaim = unassigned && summary?.canClaim;
    const save = async (take: boolean) => {
        const date = new Date(at);
        if (!Number.isFinite(date.getTime()) || date.getTime() <= Date.now()) {
            toast.error('Холбогдох цагаа одоогоос хойш товлоно уу'); return;
        }
        try {
            if (take) {
                const result = await claim.mutateAsync({ id: lead.id, nextFollowupAt: date.toISOString() });
                if (result.warning) toast.warning(result.warning);
                else toast.success('Лидийг хариуцаж авч, холбогдох цаг товлолоо');
            } else {
                await update.mutateAsync({ id: lead.id, patch: { next_followup_at: date.toISOString() } });
                toast.success('Холбогдох цаг хадгалагдлаа');
            }
            setAt('');
        } catch (error) { toast.error(error instanceof Error ? error.message : 'Хадгалах алдаа'); }
    };
    const busy = claim.isPending || update.isPending;
    return (
        <section aria-label="Лидийн дараагийн ажил" className="space-y-2 border-b border-border bg-surface-2 px-4 py-3">
            {queues.length > 0 && <p className="text-[12px] text-fg-2">{LEAD_WORK_QUEUES.filter(q => queues.includes(q.key)).map(q => q.label).join(' · ')}</p>}
            {unassigned && <p className="text-[12px] text-muted-foreground">Энэ лид хариуцагчгүй байна. Менежер оноох эсвэл өөрөө хариуцаж авна.</p>}
            {canWrite && <div className="flex flex-wrap items-end gap-2">
                <label className="min-w-0 flex-1 text-[12px] text-fg-2">Холбогдох цаг (таны төхөөрөмжийн цагаар)
                    <input type="datetime-local" value={at} onChange={e => setAt(e.target.value)} className="mt-1 block h-9 w-full rounded-md border border-border bg-surface px-2 text-foreground focus-ring" />
                </label>
                <button type="button" onClick={() => void save(!!canClaim)} disabled={!at || busy} className="h-9 rounded-md bg-brand px-3 text-[12px] font-medium text-brand-fg disabled:opacity-50 focus-ring">
                    {busy ? 'Хадгалж байна…' : canClaim ? 'Хариуцаж аваад товлох' : 'Цаг товлох'}
                </button>
            </div>}
        </section>
    );
}

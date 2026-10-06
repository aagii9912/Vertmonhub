'use client';

import { useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { useLeadDetail } from '@/hooks/useLeads';
import { useModuleAccess } from '@/hooks/useModuleAccess';
import { leadDisplayName } from '@/lib/leads/labels';
import { usePageTitle } from '@/lib/navigation/pageTitle';
import { Button } from '@/components/ui/Button';
import { LeadCard } from './LeadCard';

/** `/dashboard/leads/[id]` — Харилцагчийн картын бүтэн хуудас (холбоос хуваалцах, том дэлгэцэнд ажиллах). */
export function LeadFullPage({ leadId }: { leadId: string }) {
    const router = useRouter();
    const { canWrite } = useModuleAccess();
    const { data } = useLeadDetail(leadId);
    usePageTitle(data?.lead ? leadDisplayName(data.lead) : 'Харилцагчийн карт');
    return (
        <div className="mx-auto flex w-full max-w-[1400px] flex-col gap-4">
            <div>
                <Button href="/dashboard/leads" variant="ghost" size="sm" className="-ml-3"><ArrowLeft />Лидийн жагсаалт</Button>
            </div>
            <LeadCard key={leadId} leadId={leadId} canWrite={canWrite('leads')} variant="page" onOpenLead={(id) => router.push(`/dashboard/leads/${id}`)} />
        </div>
    );
}

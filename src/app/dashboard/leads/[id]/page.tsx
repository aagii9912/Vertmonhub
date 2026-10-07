import { LeadFullPage } from '@/components/leads/LeadFullPage';

export default async function LeadDetailPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    return <LeadFullPage leadId={id} />;
}

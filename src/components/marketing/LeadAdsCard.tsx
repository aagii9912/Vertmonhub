'use client';
import { useState } from 'react';
import { toast } from 'sonner';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { StatusPill } from '@/components/ui/StatusPill';
import { useDashboardQuery } from '@/hooks/useDashboardQuery';
import { dashboardMutate } from '@/lib/api/dashboardFetch';

export interface LeadAdsStatus {
    connected: boolean;
    pageName?: string | null;
    subscribed?: boolean | null;
    eventsAvailable?: boolean;
    counts?: { saved: number; skipped: number; failed: number };
    lastSavedAt?: string | null;
    problems?: Array<{ leadgen_id: string; status: 'skipped' | 'failed'; reason: string | null; origin: string; updated_at: string }>;
}

interface BackfillResult {
    forms: number; received: number; ingested: number; duplicate: number; skipped: number; failed: number;
    complete: boolean; error?: string;
}

/** Алгассан/алдаатай шалтгааны тайлбар (meta_leadgen_events.reason, backfill error). */
export const LEAD_ADS_REASONS: Record<string, string> = {
    invalid_payload: 'Meta-гийн мэдэгдэл дутуу ирсэн',
    page_not_connected: 'Page ямар ч төсөлд холбогдоогүй',
    token_missing: 'Page-ийн токен хадгалагдаагүй',
    app_secret_missing: 'FACEBOOK_APP_SECRET тохируулаагүй',
    token_invalid: 'Facebook холболтын хугацаа дууссан — дахин холбоно уу',
    permission_missing: 'leads_retrieval / pages_manage_ads эрх дутуу — дахин холбоно уу',
    not_found: 'Meta дээр олдсонгүй (90 хоногоос хуучин эсвэл устсан)',
    graph_error: 'Meta-гийн хариу алдаатай',
    lead_rejected: 'Лидийг хадгалах үед өгөгдлийн алдаа гарсан',
    graph_unavailable: 'Meta түр хариу өгсөнгүй — Meta дахин илгээнэ',
    db_error: 'Өгөгдлийн сан түр алдаатай — Meta дахин илгээнэ',
    time_budget: 'Хугацаа хүрэлцээгүй — дахин ажиллуулна уу',
    too_many_pages: 'Хэт олон хуудас — дахин ажиллуулна уу',
};
const reasonText = (reason?: string | null) => (reason && LEAD_ADS_REASONS[reason]) || reason || 'Тодорхойгүй';
const formatDate = (iso: string) => new Date(iso).toLocaleString('mn-MN', { timeZone: 'Asia/Ulaanbaatar' });

/**
 * Facebook Lead Ads: лид `/api/webhook`-ээр автоматаар орно. Энд webhook subscribe-ийн төлөв,
 * сүүлийн 90 хоногийн үр дүн, алгассан event-үүд, 90 хоногийн нөхөлт (backfill) харагдана.
 */
export function LeadAdsCard({ canWrite }: { canWrite: boolean }) {
    const state = useDashboardQuery<LeadAdsStatus>(['lead-ads-status'], '/api/marketing/facebook/lead-ads');
    const [busy, setBusy] = useState<null | 'backfill' | 'subscribe'>(null);
    const status = state.data;

    async function run(action: 'backfill' | 'subscribe') {
        setBusy(action);
        try {
            if (action === 'subscribe') {
                const result = await dashboardMutate<{ success: boolean; leadgen: boolean; leadgenError?: string }>('/api/marketing/facebook/lead-ads', 'POST', { action });
                if (result.leadgen) toast.success('Lead Ads webhook идэвхжлээ.');
                else toast.error(`DM холбогдсон ч Lead Ads идэвхжсэнгүй: ${result.leadgenError || 'leads_retrieval эрх шаардлагатай'}`);
            } else {
                const result = await dashboardMutate<BackfillResult>('/api/marketing/facebook/lead-ads', 'POST', { action });
                const text = `${result.forms} форм, ${result.received} лид шалгав: ${result.ingested} шинэ, ${result.duplicate} аль хэдийн байсан, ${result.skipped + result.failed} алгассан.`;
                if (result.complete) toast.success(text);
                else toast.warning(`${text} Дутуу: ${reasonText(result.error)}`);
            }
        } catch (error) {
            toast.error(error instanceof Error ? error.message : 'Хүсэлт амжилтгүй');
        } finally {
            setBusy(null);
            void state.refetch();
        }
    }

    if (state.isError && !status) {
        return <Alert variant="danger">{state.error.message} <Button size="sm" variant="ghost" onClick={() => void state.refetch()}>Дахин шалгах</Button></Alert>;
    }
    if (!status?.connected) return null;
    const counts = status.counts ?? { saved: 0, skipped: 0, failed: 0 };

    return <section aria-label="Facebook Lead Ads" className="space-y-3 rounded-lg border border-border bg-surface p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
                <div className="flex items-center gap-2">
                    <h2 className="text-sm font-semibold">Facebook Lead Ads</h2>
                    {status.subscribed === true && <StatusPill variant="success" dot>Webhook идэвхтэй</StatusPill>}
                    {status.subscribed === false && <StatusPill variant="pending" dot>Webhook идэвхгүй</StatusPill>}
                </div>
                <p className="mt-1 text-xs text-muted-foreground">Lead форм бөглөгдмөгц лид автоматаар орж, кампанийн холбоосоор (байхгүй бол энэ төсөлд) оноогдоно. Meta лидийг 90 хоног хадгалдаг.</p>
            </div>
            {canWrite && <div className="flex flex-wrap gap-2">
                {status.subscribed !== true && <Button size="sm" variant="secondary" disabled={!!busy} isLoading={busy === 'subscribe'} onClick={() => void run('subscribe')}>Lead Ads идэвхжүүлэх</Button>}
                <Button size="sm" variant="secondary" disabled={!!busy} isLoading={busy === 'backfill'} onClick={() => void run('backfill')}>Сүүлийн 90 хоногийн лид татах</Button>
            </div>}
        </div>
        {status.subscribed === false && <Alert variant="warning">Page Lead Ads-ийн webhook-д бүртгэгдээгүй байна. leads_retrieval эрхтэйгээр Facebook-ээ дахин холбоод «Lead Ads идэвхжүүлэх»-ийг дарна уу.</Alert>}
        {status.eventsAvailable === false
            ? <p className="text-xs text-muted-foreground">Lead Ads-ийн бүртгэлийн хүснэгт хараахан үүсээгүй байна.</p>
            : <p className="text-xs text-muted-foreground">Сүүлийн 90 хоног: {counts.saved} хадгалсан · {counts.skipped} алгассан · {counts.failed} түр алдаатай
                {status.lastSavedAt ? ` · Сүүлийн лид: ${formatDate(status.lastSavedAt)}` : ''}</p>}
        {!!status.problems?.length && <ul aria-label="Алгассан Lead Ads" className="space-y-1 text-xs">
            {status.problems.map(problem => <li key={problem.leadgen_id} className="flex flex-wrap gap-x-2 text-muted-foreground">
                <span className={problem.status === 'failed' ? 'text-status-pending' : 'text-status-danger'}>{reasonText(problem.reason)}</span>
                <span>· {formatDate(problem.updated_at)}</span>
                <span>· lead {problem.leadgen_id}</span>
            </li>)}
        </ul>}
    </section>;
}

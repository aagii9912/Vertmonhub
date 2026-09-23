'use client';
import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Button } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Alert';
import { dashboardJson } from '@/lib/api/dashboardFetch';
import type { MetaSyncStatus } from '@/lib/marketing/meta-spend';
import { marketingInputClass } from './PerformanceEditor';

export function MetaSpendSync({ shopId, canWrite, from, to }: { shopId?: string; canWrite: boolean; from: string; to: string }) {
    const cache = useQueryClient();
    const [busy, setBusy] = useState(false), [rate, setRate] = useState('');
    const [oauthError, setOauthError] = useState(false);
    const state = useQuery({ queryKey: ['meta-spend-sync', shopId], enabled: !!shopId, retry: false,
        queryFn: () => dashboardJson<{ accountId: string | null; status: MetaSyncStatus | null; connected: boolean; expiresAt: string | null }>('/api/marketing/facebook/ads/spend-sync', { shopId }) });
    const status = state.data?.status;
    useEffect(() => {
        const url = new URL(window.location.href);
        const result = url.searchParams.get('meta_ads');
        if (!result) return;
        if (result === 'connected') toast.success('Meta Ads холбогдлоо.');
        else setOauthError(true);
        url.searchParams.delete('meta_ads');
        window.history.replaceState(null, '', url);
    }, []);
    async function sync(withRate: boolean) {
        setBusy(true);
        try {
            const result = await dashboardJson<{ rows: number; needsRate: boolean }>('/api/marketing/facebook/ads/spend-sync', {
                shopId, method: 'POST', body: JSON.stringify({ from, to, ...(withRate ? { mntPerUnit: Number(rate), currency: status?.currency } : {}) }),
            });
            toast.success(`${result.rows} өдрийн зардлын мөр шинэчлэгдлээ.${result.needsRate ? ' Төгрөгийн ханшаа оруулна уу.' : ''}`);
            setRate('');
        } catch (error) { toast.error(error instanceof Error ? error.message : 'Meta синк амжилтгүй'); }
        finally {
            setBusy(false);
            await Promise.all(['meta-spend-sync', 'marketing-performance', 'marketing-budget'].map(key => cache.invalidateQueries({ queryKey: [key] })));
        }
    }
    return <section aria-label="Meta автомат зардал" className="space-y-3 rounded-lg border border-border bg-surface p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
            <div><h2 className="text-sm font-semibold">Meta автомат зардал</h2>
                <p className="mt-1 text-xs text-muted-foreground">6 цаг тутам сүүлийн 35 өдрийг шинэчилнэ. Сонгосон хугацааг 93 хүртэл өдрөөр нөхөж татаж болно.</p></div>
            <div className="flex flex-wrap gap-2">
                {canWrite && <Button size="sm" variant="secondary" href={`/api/marketing/facebook/ads/connect?shop_id=${encodeURIComponent(shopId || '')}`}>{state.data?.connected ? 'Meta Ads дахин холбох' : 'Meta Ads холбох'}</Button>}
                {canWrite && <Button size="sm" variant="secondary" disabled={!state.data?.accountId || !state.data?.connected || busy} isLoading={busy} onClick={() => void sync(false)}>Meta зардал татах</Button>}
            </div>
        </div>
        {oauthError && <Alert variant="danger">Meta Ads холболт амжилтгүй боллоо. App-ийн ads_read эрх, Meta зөвшөөрөл болон нэвтрэх тохиргоог шалгана уу.</Alert>}
        {state.isError && <Alert variant="danger">{state.error.message}<Button size="sm" variant="ghost" onClick={() => void state.refetch()}>Дахин шалгах</Button></Alert>}
        {state.data && !state.data.connected && <p className="text-sm text-muted-foreground">Зардал татахын тулд Meta Ads app-аа холбоно уу.</p>}
        {state.data?.connected && !state.data.accountId && <p className="text-sm text-muted-foreground">Meta зарын данс сонгоогүй байна. <a className="underline" href="/dashboard/marketing-roi">Зарын данс сонгох</a></p>}
        {state.data?.connected && state.data.expiresAt && <p className="text-xs text-muted-foreground">Meta Ads эрхийн хугацаа: {new Date(state.data.expiresAt).toLocaleDateString('mn-MN', { timeZone: 'Asia/Ulaanbaatar' })}</p>}
        {state.data?.accountId && <p className="text-xs text-muted-foreground">Данс: {state.data.accountId} · {status?.currency || 'Валютыг анхны синкээр уншина'} · {status?.timezone || 'Цагийн бүс тодорхойгүй'}<br />
            Сүүлийн амжилттай синк: {status?.last_success_at ? new Date(status.last_success_at).toLocaleString('mn-MN', { timeZone: 'Asia/Ulaanbaatar' }) : 'Хийгдээгүй'} {status?.last_from && `(${status.last_from} – ${status.last_to})`}</p>}
        {status?.last_error && <Alert variant="danger">{status.last_error} Өмнө хадгалсан зардал хэвээр байна.</Alert>}
        {status?.currency && status.currency !== 'MNT' && <div className="space-y-2 text-xs text-muted-foreground">
            <p>Тооцооны ханш: 1 {status.currency} = {status.mnt_per_unit ?? '—'}₮. Ханшгүй мөрүүд төгрөгийн нийтэд орохгүй.</p>
            {canWrite && <div className="flex flex-wrap items-end gap-2"><label className="grid gap-1">1 {status.currency}-ийн төгрөгийн ханш<input aria-label="Meta төгрөгийн ханш" className={marketingInputClass} type="number" min="0.000001" max="1000000" step="0.000001" placeholder="Байгууллагын тооцооны ханш" value={rate} onChange={e => setRate(e.target.value)} /></label>
                <Button variant="secondary" size="sm" disabled={busy || !(Number(rate) > 0) || Number(rate) > 1000000} onClick={() => void sync(true)}>Ханшаар дахин тооцож татах</Button></div>}
            <p>Ханш оруулж татахад сонгосон хугацааг дахин тооцно; энэ ханшийг цаашдын шинэ мөрүүдэд хэрэглэнэ. Өмнөх өдрийн хадгалсан ханшийг автомат синк өөрчлөхгүй.</p>
        </div>}
        <p className="text-xs leading-relaxed text-muted-foreground">Автомат татсан өдрийн гар Meta Ads зардал нийтээс хасагдана. Бусад зарын дансны гар зардал байвал эхлээд тулгана уу. Контент, үйлчилгээний төлбөрийг тохирох тусдаа сувгаар бүртгэнэ. Төсөлд хуваарилахдаа акцын Meta campaign ID-г холбоно.</p>
    </section>;
}

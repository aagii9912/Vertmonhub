'use client';

import { useState, type FormEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Upload } from 'lucide-react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/Dialog';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Alert } from '@/components/ui/Alert';
import { dashboardFetch, dashboardJson } from '@/lib/api/dashboardFetch';
import type { MetaImportHistory, MetaImportPreview } from '@/lib/marketing/meta-spend-import';
import type { MarketingActivity } from '@/lib/marketing/performance';
import { marketingInputClass } from './PerformanceEditor';

const endpoint = '/api/marketing/facebook/ads/spend-import';
const number = (value: string | number) => Number(value).toLocaleString('mn-MN', { maximumFractionDigits: 6 });
type Props = { shopId: string; projects: { id: string; name: string }[]; activities: MarketingActivity[]; onSaved: (range: { from: string; to: string }) => void };

export function MetaSpendImport(props: Props) {
    const [open, setOpen] = useState(false);
    return <>
        <Button size="sm" variant="secondary" onClick={() => setOpen(true)}><Upload />Meta файл импортлох</Button>
        {open && <ImportDialog {...props} onClose={() => setOpen(false)} />}
    </>;
}

function ImportDialog({ shopId, projects, activities, onSaved, onClose }: Props & { onClose: () => void }) {
    const cache = useQueryClient();
    const [file, setFile] = useState<File | null>(null);
    const [draft, setDraft] = useState({ accountId: '', currency: '', timezone: '', rate: '', decimal: 'dot' });
    const [requestId, setRequestId] = useState(() => crypto.randomUUID());
    const [preview, setPreview] = useState<MetaImportPreview | null>(null);
    const [busy, setBusy] = useState(false), [error, setError] = useState('');
    const history = useQuery({ queryKey: ['meta-spend-imports', shopId], retry: false,
        queryFn: () => dashboardJson<{ imports: MetaImportHistory[] }>(endpoint, { shopId }) });
    function reset() { setPreview(null); setError(''); setRequestId(crypto.randomUUID()); }
    function change(key: keyof typeof draft, value: string) {
        setDraft(d => ({ ...d, [key]: value, ...(key === 'currency' && value === 'MNT' ? { rate: '1' } : {}) })); reset();
    }
    async function submit(event: FormEvent) {
        event.preventDefault();
        if (!file) return;
        setBusy(true); setError('');
        const action = preview ? 'commit' : 'preview';
        try {
            const body = new FormData();
            body.set('file', file); body.set('action', action); body.set('requestId', requestId);
            body.set('options', JSON.stringify({ accountId: draft.accountId, currency: draft.currency, timezone: draft.timezone, mntPerUnit: Number(draft.rate), decimal: draft.decimal }));
            if (preview) body.set('fingerprint', preview.fingerprint);
            const response = await dashboardFetch(endpoint, { shopId, method: 'POST', body });
            const result = await response.json();
            if (!response.ok) {
                if (response.status === 409) setPreview(null);
                throw new Error(result.error || 'Импорт амжилтгүй боллоо.');
            }
            if (action === 'preview') setPreview(result);
            else {
                await Promise.allSettled(['marketing-performance', 'marketing-budget', 'meta-spend-imports'].map(queryKey => cache.invalidateQueries({ queryKey: [queryKey] })));
                onSaved({ from: result.from, to: result.to });
                toast.success(`Meta импорт хадгалагдлаа. Шинэ ${result.added}, шинэчилсэн ${result.updated}, хэвээр ${result.unchanged}.`);
                onClose();
            }
        } catch (e) { setError(e instanceof Error ? e.message : 'Импорт амжилтгүй боллоо.'); }
        finally { setBusy(false); }
    }
    function template() {
        const csv = '\uFEFFAccount ID,Campaign ID,Campaign name,Day,Amount spent (MNT)\r\n123456789,987654321,Жишээ campaign,2026-09-01,0\r\n';
        const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
        const a = document.createElement('a'); a.href = url; a.download = 'meta-daily-spend-template.csv'; a.click(); URL.revokeObjectURL(url);
    }
    return <Dialog open onOpenChange={open => { if (!open && !busy) onClose(); }}>
        <DialogContent className="min-w-0 max-h-[90dvh] grid-cols-[minmax(0,1fr)] overflow-y-auto sm:max-w-3xl" showCloseButton={!busy}>
            <DialogHeader><DialogTitle>Meta файл импортлох</DialogTitle><DialogDescription>
                Meta холболтгүйгээр зарын өдрийн зардлыг оруулна. Эхлээд шалгаж, дараа нь баталгаажуулна.
            </DialogDescription></DialogHeader>
            <details className="rounded-md border border-border p-3 text-sm text-muted-foreground">
                <summary className="cursor-pointer font-medium text-foreground">Meta-гаас ямар файл татах вэ?</summary>
                <ol className="mt-2 list-decimal space-y-1 pl-5">
                    <li>Ads Manager-ийн Campaigns түвшинд тайлангаа сонгоно.</li>
                    <li>Account ID, Campaign ID, Campaign name, Amount spent багануудыг оруулна.</li>
                    <li>Breakdown хэсгээс Time → Day сонгоно. Өөр задаргаа болон нийт мөрийг арилгана.</li>
                    <li>Тухайн дансны бүх campaign-ийг сонгож, 93 хүртэл өдрөөр CSV эсвэл XLSX экспортлоно.</li>
                </ol>
                <p className="mt-2">Энэ импорт зөвхөн зардал оруулна. Lead бүртгэл, reach, clicks орохгүй.</p>
                <Button type="button" variant="ghost" size="sm" className="mt-2" onClick={template}>CSV жишиг татах</Button>
            </details>
            <form onSubmit={submit} className="min-w-0 space-y-4">
                <fieldset hidden={!!preview} disabled={busy || !!preview} className={`${preview ? 'hidden' : 'grid'} min-w-0 gap-4 disabled:opacity-70`}>
                    <label className="grid min-w-0 gap-1.5 text-sm">Meta тайлангийн файл
                        <input className="min-w-0 max-w-full rounded-md border border-border p-2 text-sm" type="file" accept=".csv,.xlsx,.tsv" required onChange={e => { setFile(e.target.files?.[0] ?? null); reset(); }} />
                        <span className="text-xs text-muted-foreground">2 MB, 5,000 мөр хүртэл. Урт ID-г хадгалахын тулд CSV тохиромжтой.</span>
                    </label>
                    <div className="grid gap-3 sm:grid-cols-2">
                        <label className="grid gap-1.5 text-sm">Зарын дансны ID<Input placeholder="Файлд байхгүй бол act_123…" value={draft.accountId} onChange={e => change('accountId', e.target.value)} /></label>
                        <label className="grid gap-1.5 text-sm">Файлын валют<select className={marketingInputClass} value={draft.currency} onChange={e => change('currency', e.target.value)}>
                            <option value="">Файлаас таних</option>{['MNT', 'USD', 'EUR', 'CNY', 'KRW', 'JPY'].map(c => <option key={c}>{c}</option>)}
                        </select></label>
                        <label className="grid gap-1.5 text-sm">Зарын дансны цагийн бүс<Input required placeholder="Asia/Ulaanbaatar" list="meta-import-timezones" value={draft.timezone} onChange={e => change('timezone', e.target.value)} /></label>
                        <datalist id="meta-import-timezones">{['Asia/Ulaanbaatar', 'America/Los_Angeles', 'Asia/Shanghai', 'UTC'].map(zone => <option key={zone} value={zone} />)}</datalist>
                        <label className="grid gap-1.5 text-sm">1 валютын нэгжийн төгрөгийн ханш<Input required type="number" min="0.000001" max="1000000" step="0.000001" placeholder="MNT бол 1" value={draft.rate} onChange={e => change('rate', e.target.value)} /></label>
                        <label className="grid gap-1.5 text-sm">CSV-ийн бутархайн тэмдэг<select className={marketingInputClass} value={draft.decimal} onChange={e => change('decimal', e.target.value)}>
                            <option value="dot">Цэг — 1,234.56</option><option value="comma">Таслал — 1.234,56</option>
                        </select></label>
                    </div>
                    <p className="text-xs text-muted-foreground">Цагийн бүсийг зарын дансны тохиргооноос харна. Ханш нь байгууллагын тооцооны ханш; банкны төлбөрийг батлахгүй.</p>
                </fieldset>
                {preview && <section aria-label="Импортын урьдчилсан дүн" className="min-w-0 space-y-3">
                    <p className="break-words text-sm font-medium">{file?.name} · {preview.accountId}<br />{preview.from} – {preview.to} · {preview.timezone}</p>
                    <div className="grid gap-3 rounded-lg bg-surface-2 p-3 text-sm sm:grid-cols-2">
                        <p>Файлын нийт: <strong>{number(preview.nativeTotal)} {preview.currency}</strong></p>
                        <p>Импортоор хадгалах: <strong>{number(preview.savedMnt)}₮</strong></p>
                        <p>Шинэ: {preview.added} · Шинэчлэх: {preview.updated}</p><p>Хэвээр: {preview.unchanged} · API-аас авсан: {preview.skippedApi}</p>
                    </div>
                    <p className="text-xs text-muted-foreground">API-аар баталгаажсан өдрийг өөрчлөхгүй. Файлд байхгүй мөрүүд хэвээр үлдэнэ. Дахин импортлоход ижил campaign, өдөр давхар нэмэгдэхгүй.</p>
                    {preview.manualOverlap > 0 && <Alert variant="warning">Файлын өдрийн {preview.manualOverlap} гар Meta зардал давхцаж болзошгүй тул нийтээс хасагдана. Өөр зарын дансны зардал байвал тулгаж шалгана уу.</Alert>}
                    {preview.ignoredSummary > 0 && <p className="text-xs text-muted-foreground">Нийт дүнгийн {preview.ignoredSummary} мөрийг алгассан.</p>}
                    <div className="max-h-60 overflow-auto rounded-md border border-border">
                        <table className="w-full min-w-[560px] text-left text-xs"><caption className="p-2 text-left text-muted-foreground">Эхний {preview.sample.length} мөр · Нийт {preview.rows} мөр. Төслийг акцын Meta campaign ID холбоосоор тодорхойлно.</caption>
                            <thead className="bg-surface-2"><tr>{['Өдөр', 'Campaign / ID', 'Төсөл', `Зардал (${preview.currency})`].map(label => <th key={label} className="p-2 font-medium">{label}</th>)}</tr></thead>
                            <tbody>{preview.sample.map(row => {
                                const activity = activities.find(a => a.external_campaign_id === row.campaign_id);
                                return <tr key={`${row.campaign_id}:${row.spent_at}`} className="border-t border-border"><td className="p-2 whitespace-nowrap">{row.spent_at}</td>
                                    <td className="p-2">{row.campaign_name}<span className="block text-muted-foreground">{row.campaign_id}</span></td><td className="p-2">{projects.find(p => p.id === activity?.project_id)?.name || 'Холбоогүй'}</td><td className="p-2 tabular-nums">{number(row.native_amount)}</td></tr>;
                            })}</tbody>
                        </table>
                    </div>
                    <p className="text-xs text-muted-foreground">Холбоогүй campaign-ийн зардал байгууллагын нийтэд орно. Бүртгэл дэх акцад Meta campaign ID-г холбосны дараа төсөлд хуваарилагдана.</p>
                </section>}
                {error && <Alert variant="danger">{error}</Alert>}
                <div className="flex flex-wrap justify-end gap-2">
                    <Button type="button" variant="secondary" disabled={busy} onClick={preview ? () => { setPreview(null); setError(''); } : onClose}>{preview ? 'Тохиргоо засах' : 'Болих'}</Button>
                    <Button type="submit" isLoading={busy} disabled={!file || (!!preview && preview.added + preview.updated === 0)}>{preview ? 'Баталгаажуулж импортлох' : 'Файл шалгах'}</Button>
                </div>
                {preview && preview.added + preview.updated === 0 && <p role="status" className="text-sm text-muted-foreground">Бүх мөр өмнө хадгалагдсан эсвэл API-аар баталгаажсан байна. Дахин импортлох шаардлагагүй.</p>}
            </form>
            {!preview && <section aria-label="Сүүлийн импортууд" className="space-y-2 border-t border-border pt-3 text-xs text-muted-foreground">
                <h3 className="font-medium text-foreground">Сүүлийн импортууд</h3>
                {history.isPending && <p>Уншиж байна…</p>}
                {history.isError && <Alert variant="warning">{history.error.message}<Button size="sm" variant="ghost" onClick={() => void history.refetch()}>Дахин оролдох</Button></Alert>}
                {history.data?.imports.length === 0 && <p>Файлаар импорт хийгдээгүй.</p>}
                {history.data?.imports.map(item => <p key={item.id} className="break-words">{item.file_name} · {item.from_date} – {item.to_date} · {item.account_id}<br />
                    {new Date(item.created_at).toLocaleString('mn-MN', { timeZone: 'Asia/Ulaanbaatar' })} · Шинэ {item.summary.added}, шинэчилсэн {item.summary.updated}</p>)}
            </section>}
        </DialogContent>
    </Dialog>;
}

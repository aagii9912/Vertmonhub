'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { dashboardJson, dashboardFetch } from '@/lib/api/dashboardFetch';
import { PageHeader } from '@/components/dashboard/PageHeader';
import { SectionCard } from '@/components/ui/SectionCard';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Alert } from '@/components/ui/Alert';
import { Spinner } from '@/components/ui/Spinner';
import { ubDateStr } from '@/lib/utils/date';
import { erpWeek, type ErpImport, type ErpReport, type ErpChange } from '@/lib/erp/import';
import { isSalesDataset, suggestErpKeyColumns } from '@/lib/erp/records';

const fieldClass = 'h-10 w-full min-w-0 rounded-md border border-border bg-surface px-3 text-sm';
const kinds = { baseline: 'Анхны суурь', added: 'Шинэ', changed: 'Өөрчлөгдсөн', missing: 'Файлд байхгүй', unchanged: 'Хэвээр' };
type Inspection = { previousId: string | null; previousDate: string | null; sheets: { name: string; columns: string[]; count: number; sample: Record<string, unknown>[]; keyColumns: string[] }[] };
type Detail = ErpReport & { import: ErpImport; previousDate: string | null; totalChanges: number };

function Changes({ changes }: { changes: ErpChange[] }) {
    return <div className="max-w-full overflow-x-auto" role="region" aria-label="ERP мөрийн өөрчлөлт" tabIndex={0}><table className="w-full min-w-[680px] text-left text-sm">
        <thead className="text-xs text-muted-foreground"><tr>{['Sheet / ID', 'Төлөв', 'Талбар', 'Өмнөх утга', 'Шинэ утга'].map(h => <th key={h} className="p-2">{h}</th>)}</tr></thead>
        <tbody className="divide-y divide-border">{changes.map(c => <tr key={`${c.dataset}-${c.key}`} className="align-top">
            <td className="p-2"><p>{c.dataset}</p><p className="max-w-48 break-words text-xs text-muted-foreground">{JSON.parse(c.key).join(' / ')}</p></td><td className="p-2 whitespace-nowrap">{kinds[c.kind]}</td>
            <td colSpan={3} className="p-2"><div className="grid grid-cols-3 gap-x-4 gap-y-2">{(c.kind === 'changed' ? c.fields : Object.keys(c.after ?? c.before ?? {})).map(f => <div key={f} className="contents"><span className="break-words text-muted-foreground">{f}</span><span className="min-w-0 break-words whitespace-pre-wrap">{c.before?.[f] || '—'}</span><span className="min-w-0 break-words whitespace-pre-wrap">{c.after?.[f] || '—'}</span></div>)}</div></td>
        </tr>)}</tbody>
    </table>{!changes.length && <p className="py-6 text-sm text-muted-foreground">Сонгосон шүүлтэд өөрчлөлт алга. Анхны импортын мөрүүдийг «Зөвхөн өөрчлөлт»-ийг унтрааж харна.</p>}</div>;
}

function Summary({ report }: { report: ErpReport }) {
    return <><div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">{Object.entries({ total: 'Нийт мөр', baseline: 'Анхны суурь', added: 'Шинэ', changed: 'Өөрчлөгдсөн', missing: 'Файлд байхгүй', unchanged: 'Хэвээр' }).map(([k, label]) => <div key={k} className="rounded-md border border-border p-3"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-2 text-2xl font-semibold tabular-nums">{report.totals[k as keyof typeof report.totals].toLocaleString()}</p></div>)}</div>
        <div className="mt-3 space-y-2">{report.datasets.map(s => <p key={s.name} className="text-sm"><b>{s.name}</b>: {s.total} мөр · шинэ {s.added} · өөрчлөгдсөн {s.changed} · байхгүй {s.missing}{!!s.addedColumns.length && ` · шинэ багана: ${s.addedColumns.join(', ')}`}{!!s.missingColumns.length && ` · хасагдсан багана: ${s.missingColumns.join(', ')}`}</p>)}</div></>;
}

export default function ErpPage() {
    const { shop, user } = useAuth();
    const allowed = user?.role === 'super_admin' || user?.permissions?.modules.includes('erp-imports');
    if (!shop) return <Spinner label="Уншиж байна…" />;
    if (!allowed) return <Alert>ERP импорт, тайлангийн эрх шаардлагатай.</Alert>;
    return <ErpWorkspace key={`${user?.id}:${shop.id}`} userId={user?.id ?? ''} shopId={shop.id} canWrite={user?.role === 'super_admin' || !!user?.permissions?.canWrite} />;
}

function ErpWorkspace({ userId, shopId, canWrite }: { userId: string; shopId: string; canWrite: boolean }) {
    const cache = useQueryClient();
    const [selectedSource, setSource] = useState<string | null>(null);
    const [reportDate, setReportDate] = useState(ubDateStr);
    const [file, setFile] = useState<File | null>(null);
    const [inspection, setInspection] = useState<Inspection | null>(null);
    const [keys, setKeys] = useState<Record<string, string[]>>({});
    const [preview, setPreview] = useState<ErpReport | null>(null);
    const [requestId, setRequestId] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [selected, setSelected] = useState('');
    const [changesOnly, setChangesOnly] = useState(false);
    const [dataset, setDataset] = useState('');
    const [page, setPage] = useState(0);
    const [historyPage, setHistoryPage] = useState(0);
    const sources = useQuery({ queryKey: ['erp-sources', userId, shopId], queryFn: () => dashboardJson<{ sources: string[] }>('/api/dashboard/erp-imports?sources=1', { shopId }), retry: false });
    const source = selectedSource ?? sources.data?.sources[0] ?? 'ERP';
    const history = useQuery({ queryKey: ['erp-imports', shopId, userId, source, historyPage], enabled: sources.isSuccess && !!source.trim(), queryFn: () => dashboardJson<{ imports: ErpImport[]; total: number }>(`/api/dashboard/erp-imports?${new URLSearchParams({ source, page: String(historyPage) })}`, { shopId }), retry: false });
    const id = selected || history.data?.imports[0]?.id;
    const params = new URLSearchParams({ id: id ?? '', changesOnly: changesOnly ? '1' : '0', dataset, page: String(page) });
    const detail = useQuery({ queryKey: ['erp-report', shopId, userId, params.toString()], enabled: !!id, queryFn: () => dashboardJson<Detail>(`/api/dashboard/erp-imports?${params}`, { shopId }), retry: false });
    const week = erpWeek();
    const latest = historyPage === 0 ? history.data?.imports[0] : undefined;
    const due = ubDateStr() >= week.due && (!latest || latest.report_date < week.due);
    function reset() { setInspection(null); setPreview(null); setError(''); }
    async function upload(action: 'inspect' | 'preview' | 'commit') {
        if (!file) return;
        setBusy(true); setError('');
        try {
            const form = new FormData(); form.set('file', file); form.set('source', source); form.set('action', action);
            form.set('options', JSON.stringify({ source, reportDate, keys, requestId, expectedPrevious: inspection?.previousId ?? null }));
            if (action === 'inspect') {
                const value = await dashboardJson<Inspection>('/api/dashboard/erp-imports', { method: 'POST', body: form, shopId });
                setInspection(value); setKeys(Object.fromEntries(value.sheets.map(s => [s.name, s.keyColumns.length ? s.keyColumns : suggestErpKeyColumns(s.columns)]))); setRequestId(crypto.randomUUID()); setPreview(null);
            } else if (action === 'preview') {
                setPreview(await dashboardJson<ErpReport>('/api/dashboard/erp-imports', { method: 'POST', body: form, shopId }));
            } else {
                const result = await dashboardJson<{ id: string }>('/api/dashboard/erp-imports', { method: 'POST', body: form, shopId });
                setSelected(result.id); setPage(0); setHistoryPage(0); setDataset(''); reset();
                await cache.invalidateQueries({ queryKey: ['erp-imports', shopId] });
                await cache.invalidateQueries({ queryKey: ['erp-sources', userId, shopId] });
                toast.success('Импорт хадгалагдаж, тайлан гарлаа');
            }
        } catch (e) { setError(e instanceof Error ? e.message : 'Импорт амжилтгүй'); }
        finally { setBusy(false); }
    }
    async function download() {
        setBusy(true);
        try {
            const response = await dashboardFetch(`/api/dashboard/erp-imports?${params}&export=1`, { shopId });
            if (!response.ok) throw new Error('Тайлан татаж чадсангүй');
            const url = URL.createObjectURL(await response.blob());
            const a = document.createElement('a'); a.href = url; a.download = `ERP-${detail.data?.import.report_date}.xlsx`; a.click(); URL.revokeObjectURL(url);
        } catch (e) { toast.error(e instanceof Error ? e.message : 'Алдаа'); }
        finally { setBusy(false); }
    }
    return <div className="min-w-0 space-y-4">
        <PageHeader title="ERP · Долоо хоногийн тайлан" subtitle="Мягмар гараг бүр бүтэн ERP экспорт импортлож, өмнөх импорттой харьцуулна." />
        {!!sources.data?.sources.length && <label className="grid max-w-md gap-1 text-sm">Хадгалсан тайлангийн багц<select className={fieldClass} value={sources.data.sources.includes(source) ? source : ''} disabled={busy} onChange={e => { setSource(e.target.value); reset(); setSelected(''); setPage(0); setHistoryPage(0); setDataset(''); }}><option value="" disabled>Тайлангийн багц сонгох</option>{sources.data.sources.map(value => <option key={value} value={value}>{value}</option>)}</select></label>}
        <label className="grid max-w-md gap-1 text-sm">Эх үүсвэр / тайлангийн багц<Input value={source} maxLength={120} disabled={busy || sources.isPending} onChange={e => { setSource(e.target.value); reset(); setSelected(''); setPage(0); setHistoryPage(0); setDataset(''); }} /></label>
        {sources.isError && <Alert variant="danger">{sources.error.message} <Button size="sm" onClick={() => void sources.refetch()}>Дахин оролдох</Button></Alert>}
        {sources.isPending && <Spinner label="Хадгалсан тайланг уншиж байна…" />}
        {history.isError ? <Alert variant="danger">{history.error.message} <Button size="sm" onClick={() => void history.refetch()}>Дахин оролдох</Button></Alert> : history.isLoading ? <Spinner /> : history.isSuccess && historyPage === 0 && <Alert variant={due ? 'warning' : 'info'}>Энэ долоо хоног: {week.from} – {week.to}. Импортын өдөр: {week.due} (Мягмар). {due ? 'Энэ долоо хоногийн импорт хүлээгдэж байна.' : latest && latest.report_date >= week.due ? 'Энэ долоо хоногийн мэдээлэл орсон.' : 'Импортын өдөр хараахан болоогүй.'}</Alert>}
        {canWrite && sources.isSuccess && <SectionCard title="ERP файл импортлох" description="Бүх мэдээллийн sheet-ийг хамтад нь оруулна. CSV бол нэг sheet. 4 MB, 30 sheet, 20,000 мөр хүртэл.">
            <div className="grid items-end gap-3 sm:grid-cols-[minmax(0,1fr)_180px_auto]"><label className="grid min-w-0 gap-1 text-sm">Файл<input className="w-full min-w-0 text-sm" type="file" accept=".xlsx,.csv,.tsv" disabled={busy} onChange={e => { setFile(e.target.files?.[0] ?? null); reset(); }} /></label><label className="grid gap-1 text-sm">Мэдээллийн огноо<input className={fieldClass} type="date" max={ubDateStr()} value={reportDate} disabled={busy} onChange={e => { setReportDate(e.target.value); setPreview(null); setRequestId(crypto.randomUUID()); }} /></label><Button disabled={!file || !source.trim() || busy} onClick={() => void upload('inspect')}>Файл шалгах</Button></div>
            {inspection && <div className="mt-4 space-y-4">{inspection.sheets.map(s => <fieldset key={s.name} className="rounded-md border border-border p-3"><legend className="px-1 text-sm font-medium">{s.name} · {s.count.toLocaleString()} мөр</legend>{!s.keyColumns.length && suggestErpKeyColumns(s.columns).length > 0 && <p className="mb-2 text-xs text-brand">{isSalesDataset(s) ? 'Гэрээний экспорт' : 'Бүтээгдэхүүний экспорт'} танигдлаа — Лхагвагийн тайлан, KPI-д ашиглагдана. ID багануудыг санал болгов.</p>}<p className="mb-2 text-xs text-muted-foreground">Мөрийг таних өөрчлөгддөггүй ID багана сонгоно. Давтагдвал хэд хэдэн баганыг хамт сонгоно. Жишээ: Гэрээний дугаар, Төслийн ID + Байрны дугаар.</p><div className="flex flex-wrap gap-3">{s.columns.map(c => <label key={c} className="flex items-center gap-1.5 text-sm"><input type="checkbox" disabled={busy || !!s.keyColumns.length} checked={(keys[s.name] ?? []).includes(c)} onChange={e => { setKeys(v => ({ ...v, [s.name]: e.target.checked ? [...(v[s.name] ?? []), c] : v[s.name].filter(k => k !== c) })); setPreview(null); setRequestId(crypto.randomUUID()); }} />{c}</label>)}</div></fieldset>)}<Button disabled={busy || inspection.sheets.some(s => !keys[s.name]?.length)} onClick={() => void upload('preview')}>Өөрчлөлтийг урьдчилан харах</Button></div>}
            {preview && <div className="mt-4 space-y-4"><Summary report={preview} /><p className="text-sm text-muted-foreground">Харьцуулах импорт: {inspection?.previousDate ?? 'Анхны суурь'}. Файлд байхгүй мөрүүдийг түүхэнд хадгална. CRM болон санхүүгийн үндсэн бүртгэлийг энэ импорт өөрчлөхгүй.</p><Changes changes={preview.changes} /><p className="text-xs text-muted-foreground">Урьдчилсан харагдац: эхний 30 мөр. Хадгалсны дараа бүх мөрийг үзэж, Excel татна.</p><Button disabled={busy} onClick={() => void upload('commit')}>Импорт хадгалж, тайлан гаргах</Button></div>}
            {busy && <p role="status" className="mt-3 text-sm">Боловсруулж байна…</p>}{error && <p role="alert" className="mt-3 text-sm text-status-danger">{error}</p>}
        </SectionCard>}
        <SectionCard title="Импортын түүх ба өөрчлөлт" description="Анхны импорт суурь болно. Дараагийн тайлан бүр яг өмнөх хадгалсан импорттой харьцуулагдана.">
            <div className="flex flex-wrap items-end gap-3"><label className="grid w-full min-w-0 gap-1 text-sm sm:min-w-64 sm:flex-1">Импорт<select className={fieldClass} value={id ?? ''} onChange={e => { setSelected(e.target.value); setPage(0); setDataset(''); }}><option value="" disabled>Импорт сонгох</option>{history.data?.imports.map(i => <option key={i.id} value={i.id}>{i.report_date} · {i.file_name} · {new Date(i.created_at).toLocaleTimeString('mn-MN', { timeZone: 'Asia/Ulaanbaatar', hour: '2-digit', minute: '2-digit' })}</option>)}</select></label><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={changesOnly} onChange={e => { setChangesOnly(e.target.checked); setPage(0); }} />Зөвхөн өөрчлөлт</label><Button variant="secondary" disabled={!detail.data || busy} onClick={() => void download()}>Excel татах</Button></div>
            {(history.data?.total ?? 0) > 50 && <div className="mt-2 flex gap-2"><Button size="sm" variant="ghost" disabled={!historyPage} onClick={() => { setHistoryPage(p => p - 1); setSelected(''); setPage(0); }}>Өмнөх 50 импорт</Button><Button size="sm" variant="ghost" disabled={(historyPage + 1) * 50 >= (history.data?.total ?? 0)} onClick={() => { setHistoryPage(p => p + 1); setSelected(''); setPage(0); }}>Дараагийн 50 импорт</Button></div>}
            {detail.isLoading && id && <Spinner />}{detail.isError && <Alert variant="danger">{detail.error.message} <Button size="sm" onClick={() => void detail.refetch()}>Дахин оролдох</Button></Alert>}
            {history.isSuccess && !history.data.total && <p className="py-5 text-sm text-muted-foreground">Энэ тайлангийн багцад импорт ороогүй. Хадгалсан багцаа сонгох эсвэл эхний ERP файлаа оруулж суурь үүсгэнэ үү.</p>}
            {detail.data && <div className="mt-4 space-y-4"><p className="text-sm">{detail.data.import.report_date} · Долоо хоног {erpWeek(detail.data.import.report_date).from} – {erpWeek(detail.data.import.report_date).to} · Өмнөх импорт: {detail.data.previousDate ?? 'байхгүй'}</p><Summary report={detail.data} /><label className="grid max-w-xs gap-1 text-sm">Sheet<select className={fieldClass} value={dataset} onChange={e => { setDataset(e.target.value); setPage(0); }}><option value="">Бүх sheet</option>{detail.data.datasets.map(s => <option key={s.name}>{s.name}</option>)}</select></label><Changes changes={detail.data.changes} /><div className="flex flex-wrap items-center gap-3 text-sm"><Button size="sm" variant="secondary" disabled={!page} onClick={() => setPage(p => p - 1)}>Өмнөх</Button><span>{detail.data.totalChanges} мөр · {page + 1}/{Math.max(1, Math.ceil(detail.data.totalChanges / 50))}</span><Button size="sm" variant="secondary" disabled={(page + 1) * 50 >= detail.data.totalChanges} onClick={() => setPage(p => p + 1)}>Дараах</Button></div></div>}
        </SectionCard>
    </div>;
}

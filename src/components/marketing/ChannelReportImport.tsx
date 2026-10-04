'use client';

import { useState, type FormEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { FileUp, RefreshCw, Save } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';
import { Textarea } from '@/components/ui/Textarea';
import { dashboardFetch } from '@/lib/api/dashboardFetch';
import { lastCompletedReviewRange, shiftReviewDate } from '@/lib/dashboard/weekly-review';
import {
    CHANNEL_SOURCES, CHANNEL_SOURCE_HELP, CHANNEL_SOURCE_LABELS, ChannelPeriodSchema, SHAPE_LABELS,
    type ChannelMapping, type ChannelPreviewResponse, type ChannelSource, type MappingOrigin,
} from '@/lib/marketing/channel-reports';
import { ChannelMappingTable } from './ChannelMappingTable';
import { ChannelBreakdownTable, ChannelTotalsGrid, ChannelWarnings, MissedCallsByHour } from './ChannelReportParts';
import { marketingInputClass } from './PerformanceEditor';

export const CHANNEL_REPORTS_ENDPOINT = '/api/marketing/channel-reports';
const ORIGIN_LABELS: Record<MappingOrigin, string> = {
    remembered: 'Өмнөх холболтоор бөглөсөн',
    mixed: 'Хэсэгчлэн өмнөх холболтоор',
    suggested: 'Баганын нэрээр санал болгосон',
    client: 'Таны сонгосон холболт',
};
type Period = { from: string; to: string };

/**
 * Экспорт файл → баганын холболт → урьдчилсан нийт дүн → хадгалах.
 * Файлыг серверт уншиж нэгтгэнэ; холболт өөрчлөгдвөл дахин тооцоолсны дараа л хадгална.
 */
export function ChannelReportImport({ shopId }: { shopId: string }) {
    const cache = useQueryClient();
    const [source, setSource] = useState<ChannelSource>('meta_ads');
    const [period, setPeriod] = useState<Period>(() => lastCompletedReviewRange());
    const [file, setFile] = useState<File | null>(null);
    const [fileInput, setFileInput] = useState(0);
    const [sheet, setSheet] = useState<string>();
    const [preview, setPreview] = useState<ChannelPreviewResponse | null>(null);
    const [mapping, setMapping] = useState<ChannelMapping>({});
    const [stale, setStale] = useState(false);
    const [note, setNote] = useState('');
    const [busy, setBusy] = useState<'preview' | 'save' | null>(null);
    const [error, setError] = useState('');
    const periodCheck = ChannelPeriodSchema.safeParse(period);

    function reset() { setPreview(null); setMapping({}); setStale(false); setError(''); }
    function changePeriod(next: Period) { setPeriod(next); if (preview) setStale(true); }

    async function send<T>(mode: 'preview' | 'save', options: { sheet?: string; mapping?: ChannelMapping } = {}): Promise<T> {
        const body = new FormData();
        body.set('file', file!);
        body.set('source', source);
        body.set('period_from', period.from);
        body.set('period_to', period.to);
        body.set('mode', mode);
        if (options.sheet) body.set('sheet', options.sheet);
        if (options.mapping) body.set('mapping', JSON.stringify(options.mapping));
        if (mode === 'save' && note.trim()) body.set('note', note.trim());
        const response = await dashboardFetch(CHANNEL_REPORTS_ENDPOINT, { method: 'POST', body, shopId });
        const result = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(result.error || 'Файлыг боловсруулж чадсангүй. Дахин оролдоно уу.');
        return result as T;
    }

    async function check(options: { sheet?: string; withMapping?: boolean } = {}) {
        if (!file || !periodCheck.success) return;
        setBusy('preview'); setError('');
        try {
            const data = await send<ChannelPreviewResponse>('preview', { sheet: options.sheet ?? sheet, mapping: options.withMapping ? mapping : undefined });
            setPreview(data); setMapping(data.mapping); setSheet(data.sheet); setStale(false);
        } catch (e) { setError(e instanceof Error ? e.message : 'Файлыг боловсруулж чадсангүй.'); }
        finally { setBusy(null); }
    }

    async function save() {
        if (!file || !preview || stale) return;
        setBusy('save'); setError('');
        try {
            const data = await send<{ mappingSaved: boolean }>('save', { sheet, mapping });
            await cache.invalidateQueries({ queryKey: ['marketing-channel-reports'] });
            toast.success(`${CHANNEL_SOURCE_LABELS[source]}: ${period.from} – ${period.to} тайлан хадгалагдлаа.${data.mappingSaved ? ' Баганын холболтыг дараагийн импортод сануулав.' : ''}`);
            reset(); setFile(null); setSheet(undefined); setNote(''); setFileInput(n => n + 1);
        } catch (e) { setError(e instanceof Error ? e.message : 'Хадгалж чадсангүй.'); }
        finally { setBusy(null); }
    }

    function submit(event: FormEvent) { event.preventDefault(); void check(); }
    const result = preview?.result;
    const blocked = !preview || stale || !!result?.errors.length || !preview.storageReady || !!busy;

    return <div className="space-y-5">
        <form onSubmit={submit} className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <label className="grid gap-1.5 text-sm">Эх үүсвэр
                    <select className={marketingInputClass} value={source} disabled={!!busy}
                        onChange={event => { setSource(event.target.value as ChannelSource); setSheet(undefined); reset(); }}>
                        {CHANNEL_SOURCES.map(s => <option key={s} value={s}>{CHANNEL_SOURCE_LABELS[s]}</option>)}
                    </select>
                </label>
                <label className="grid gap-1.5 text-sm">Эхлэх өдөр
                    <input type="date" className={marketingInputClass} value={period.from} required disabled={!!busy} onChange={e => changePeriod({ ...period, from: e.target.value })} />
                </label>
                <label className="grid gap-1.5 text-sm">Дуусах өдөр
                    <input type="date" className={marketingInputClass} value={period.to} required disabled={!!busy} onChange={e => changePeriod({ ...period, to: e.target.value })} />
                </label>
                <label className="grid min-w-0 gap-1.5 text-sm">Экспорт файл
                    <input key={fileInput} type="file" accept=".xlsx,.csv,.tsv" disabled={!!busy}
                        className="min-w-0 max-w-full rounded-md border border-border p-1.5 text-sm"
                        onChange={e => { setFile(e.target.files?.[0] ?? null); setSheet(undefined); reset(); }} />
                </label>
            </div>
            <div className="flex flex-wrap items-center gap-2">
                <Button type="button" size="sm" variant="secondary" disabled={!!busy} onClick={() => changePeriod(lastCompletedReviewRange())}>Өнгөрсөн хурлын долоо хоног</Button>
                <Button type="button" size="sm" variant="secondary" disabled={!!busy || !periodCheck.success}
                    onClick={() => changePeriod({ from: shiftReviewDate(period.from, -7), to: shiftReviewDate(period.to, -7) })}>7 хоногоор өмнөх</Button>
                <span className="text-xs text-muted-foreground">Хурлын долоо хоног: Лхагва – Мягмар, Улаанбаатарын цагаар. .xlsx, .csv, .tsv · 4 MB хүртэл.</span>
            </div>
            {!periodCheck.success && <Alert variant="warning">Эхлэх өдөр дуусахаас өмнө, хугацаа 93 хүртэл өдөр байна.</Alert>}
            <details className="rounded-md border border-border p-3 text-sm text-muted-foreground">
                <summary className="cursor-pointer font-medium text-foreground">{CHANNEL_SOURCE_LABELS[source]}-аас ямар файл татах вэ?</summary>
                <p className="mt-2 leading-relaxed">{CHANNEL_SOURCE_HELP[source]}</p>
                <p className="mt-2 text-xs">Баганын нэр өөр байж болно — доорх хүснэгтэд холбоод хадгалахад дараагийн удаа автоматаар танина.</p>
            </details>
            <Button type="submit" isLoading={busy === 'preview' && !preview} disabled={!file || !periodCheck.success || !!busy}><FileUp />Файл шалгах</Button>
        </form>

        {error && <Alert variant="danger">{error}</Alert>}

        {preview && result && <section aria-label="Импортын урьдчилсан дүн" className="min-w-0 space-y-4 border-t border-border pt-4">
            <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="break-all font-medium">{preview.file.name}</span>
                <Badge variant="neutral">{SHAPE_LABELS[result.shape]}</Badge>
                <Badge variant={preview.mappingOrigin === 'remembered' ? 'success' : 'neutral'}>{ORIGIN_LABELS[preview.mappingOrigin]}</Badge>
                <span className="text-xs text-muted-foreground">Толгой {preview.headerRow}-р мөрөнд · {result.rowCount} мөр тооцсон{result.excludedRows ? ` · ${result.excludedRows} мөр хассан` : ''}{result.totalRow ? ' · файлын «нийт» мөр олдсон' : ''}</span>
            </div>
            {preview.sheets.length > 1 && <label className="grid max-w-xs gap-1.5 text-sm">Sheet
                <select className={marketingInputClass} value={preview.sheet} disabled={!!busy} onChange={e => void check({ sheet: e.target.value })}>
                    {preview.sheets.map(name => <option key={name} value={name}>{name}</option>)}
                </select>
            </label>}
            {!preview.storageReady && <Alert variant="warning">Тайлан хадгалах хүснэгт үүсээгүй байна. Урьдчилан харж болно, хадгалахын тулд миграци шаардлагатай.</Alert>}
            {preview.existing && <Alert variant="info">Энэ хугацааны {CHANNEL_SOURCE_LABELS[source]} тайлан ({preview.existing.file_name || 'файл'}) хадгалагдсан байна. Хадгалбал шинэ файлаар солигдоно.</Alert>}
            {preview.duplicate && <Alert variant="warning">Энэ файлыг өмнө нь {CHANNEL_SOURCE_LABELS[preview.duplicate.source]}-д {preview.duplicate.period_from} – {preview.duplicate.period_to} хугацаагаар хадгалсан байна. Хугацаа, файлаа шалгана уу.</Alert>}
            {result.detectedPeriod && (result.detectedPeriod.from !== period.from || result.detectedPeriod.to !== period.to) && <Alert variant="warning">
                Файлын огноо {result.detectedPeriod.from} – {result.detectedPeriod.to}, сонгосон хугацаа {period.from} – {period.to}.
                {' '}<Button type="button" size="sm" variant="secondary" disabled={!!busy || !ChannelPeriodSchema.safeParse(result.detectedPeriod).success} onClick={() => changePeriod(result.detectedPeriod!)}>Файлын хугацааг сонгох</Button>
            </Alert>}

            <div className="space-y-2">
                <h3 className="text-sm font-semibold">Баганын холболт</h3>
                <p className="text-xs text-muted-foreground">Файлын багана бүрийг үзүүлэлттэй холбоно. Холбоогүй үзүүлэлт «Тооцоогүй» гэж үлдэнэ — 0 гэж тооцохгүй.</p>
                <ChannelMappingTable source={source} headers={preview.headers} mapping={mapping} sample={preview.sample} disabled={!!busy}
                    onChange={next => { setMapping(next); setStale(true); }} />
                {stale && <div className="flex flex-wrap items-center gap-2"><p className="text-xs text-status-pending">Холболт эсвэл хугацаа өөрчлөгдсөн. Дүнг дахин тооцоолсны дараа хадгална.</p>
                    <Button type="button" size="sm" isLoading={busy === 'preview'} disabled={!!busy || !periodCheck.success} onClick={() => void check({ withMapping: true })}><RefreshCw />Дахин тооцоолох</Button></div>}
            </div>

            <div className={`space-y-4 ${stale ? 'opacity-60' : ''}`} aria-live="polite">
                {!!result.errors.length && <Alert variant="danger"><ul className="list-disc space-y-1 pl-4">{result.errors.map(message => <li key={message}>{message}</li>)}</ul></Alert>}
                <div className="space-y-2">
                    <h3 className="text-sm font-semibold">Нийт дүн · {period.from} – {period.to}</h3>
                    <ChannelTotalsGrid source={source} totals={result.totals} missing={result.missing} />
                </div>
                <ChannelWarnings warnings={result.warnings} />
                <MissedCallsByHour breakdown={result.breakdown} />
                <ChannelBreakdownTable source={source} rows={result.breakdown} totals={result.totals} limit={10} />
            </div>

            <label className="grid gap-1.5 text-sm">Тэмдэглэл (заавал биш)
                <Textarea value={note} maxLength={2000} rows={2} disabled={!!busy} onChange={e => setNote(e.target.value)} placeholder="Жишээ: Meta-гийн 2 дансны нэгийнх" />
            </label>
            <div className="flex flex-wrap justify-end gap-2">
                <Button type="button" variant="secondary" disabled={!!busy} onClick={reset}>Болих</Button>
                <Button type="button" isLoading={busy === 'save'} disabled={blocked} onClick={() => void save()}><Save />Хадгалах</Button>
            </div>
        </section>}
    </div>;
}

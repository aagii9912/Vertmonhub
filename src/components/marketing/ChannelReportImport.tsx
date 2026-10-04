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
    CHANNEL_API_WEEK_REPLACE_HINT, CHANNEL_SOURCES, CHANNEL_SOURCE_HELP, CHANNEL_SOURCE_LABELS, ChannelPeriodSchema, SHAPE_LABELS,
    type ChannelMapping, type ChannelPreviewResponse, type ChannelSource, type ChannelSplitSkip, type MappingOrigin,
} from '@/lib/marketing/channel-reports';
import { ChannelMappingTable } from './ChannelMappingTable';
import { metaResultKey } from '@/lib/marketing/meta-results';
import { ChannelBreakdownTable, ChannelSplitWeeks, ChannelTotalsGrid, ChannelWarnings, MetaResultsByType, MissedCallsByHour } from './ChannelReportParts';
import { marketingInputClass } from './PerformanceEditor';

export const CHANNEL_REPORTS_ENDPOINT = '/api/marketing/channel-reports';
const ORIGIN_LABELS: Record<MappingOrigin, string> = {
    remembered: 'Өмнөх холболтоор бөглөсөн',
    mixed: 'Хэсэгчлэн өмнөх холболтоор',
    suggested: 'Баганын нэрээр санал болгосон',
    client: 'Таны сонгосон холболт',
};
type Period = { from: string; to: string };
type SaveResponse = { mappingSaved: boolean; skipped?: Array<Period & { reason: ChannelSplitSkip | 'unselected' }> };
/** Анхдагчаар хадгалах долоо хоногууд: Meta API-ийнх эсвэл илүү бүрэн хадгалсан долоо хоногоос бусад. */
const defaultWeeks = (preview: ChannelPreviewResponse) => new Set(preview.split?.weeks.filter(week => !week.skip).map(week => week.from) ?? []);

/**
 * Экспорт файл → баганын холболт → урьдчилсан нийт дүн → хадгалах.
 * Файлыг серверт уншиж нэгтгэнэ; холболт өөрчлөгдвөл дахин тооцоолсны дараа л хадгална.
 * Өдрөөр задалсан Meta файл олон хурлын долоо хоног хамарвал анхдагчаар долоо хоног бүрт тусад нь хадгална:
 * Meta API-аас татсан болон илүү олон өдөр хамарч хадгалсан долоо хоногийг анхдагчаар алгасна (сонгож болно).
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
    const [splitOn, setSplitOn] = useState(true);
    const [chosen, setChosen] = useState<ReadonlySet<string>>(new Set());
    const periodCheck = ChannelPeriodSchema.safeParse(period);

    function reset() { setPreview(null); setMapping({}); setStale(false); setError(''); setSplitOn(true); setChosen(new Set()); }
    function toggleWeek(from: string, on: boolean) {
        setChosen(current => { const next = new Set(current); if (on) next.add(from); else next.delete(from); return next; });
    }
    function changePeriod(next: Period) { setPeriod(next); if (preview) setStale(true); }

    async function send<T>(mode: 'preview' | 'save', options: { sheet?: string; mapping?: ChannelMapping; weeks?: string[] } = {}): Promise<T> {
        const body = new FormData();
        body.set('file', file!);
        body.set('source', source);
        body.set('period_from', period.from);
        body.set('period_to', period.to);
        body.set('mode', mode);
        if (options.sheet) body.set('sheet', options.sheet);
        if (options.mapping) body.set('mapping', JSON.stringify(options.mapping));
        if (options.weeks) { body.set('split', '1'); body.set('weeks', options.weeks.join(',')); }
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
            setPreview(data); setMapping(data.mapping); setSheet(data.sheet); setStale(false); setChosen(defaultWeeks(data));
        } catch (e) { setError(e instanceof Error ? e.message : 'Файлыг боловсруулж чадсангүй.'); }
        finally { setBusy(null); }
    }

    async function save() {
        if (!file || !preview || stale) return;
        setBusy('save'); setError('');
        try {
            const weeks = preview.split && splitOn ? preview.split.weeks.filter(week => chosen.has(week.from)) : null;
            const data = await send<SaveResponse>('save', { sheet, mapping, weeks: weeks?.map(week => week.from) });
            await cache.invalidateQueries({ queryKey: ['marketing-channel-reports'] });
            const saved = weeks ? `${weeks.length} хурлын долоо хоногийн (${weeks[0].from} – ${weeks[weeks.length - 1].to}) тайлан` : `${period.from} – ${period.to} тайлан`;
            const skipped = data.skipped?.length ? ` ${data.skipped.length} долоо хоногийг алгасав.` : '';
            toast.success(`${CHANNEL_SOURCE_LABELS[source]}: ${saved} хадгалагдлаа.${skipped}${data.mappingSaved ? ' Баганын холболтыг дараагийн импортод сануулав.' : ''}`);
            reset(); setFile(null); setSheet(undefined); setNote(''); setFileInput(n => n + 1);
        } catch (e) { setError(e instanceof Error ? e.message : 'Хадгалж чадсангүй.'); }
        finally { setBusy(null); }
    }

    function submit(event: FormEvent) { event.preventDefault(); void check(); }
    const splitting = !!preview?.split && splitOn;
    // Хуваах үед файлын бүх хугацааны дүнг, үгүй бол сонгосон хугацааны дүнг харуулна.
    const result = splitting ? preview!.split!.result : preview?.result;
    const shown = splitting ? preview!.split!.period : period;
    const detected = preview?.result.detectedPeriod ?? null;
    const outside = !!detected && (detected.from < period.from || detected.to > period.to);
    // Хуваахгүй үед сонгосон хугацааны API-ийн тайланг дарахгүй; хуваах үед API-ийн долоо хоногийг сонгох боломжгүй.
    const apiLocked = !splitting && preview?.existing?.origin === 'api';
    const chosenCount = splitting ? preview!.split!.weeks.filter(week => chosen.has(week.from)).length : 0;
    const apiWeeks = preview?.split?.weeks.filter(week => week.skip === 'api').length ?? 0;
    const blocked = !preview || stale || !!result?.errors.length || !preview.storageReady || !!busy || apiLocked || (splitting && !chosenCount);
    const currency = typeof result?.totals.currency === 'string' ? result.totals.currency : null;

    return <div className="space-y-5">
        <form onSubmit={submit} className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <label className="grid gap-1.5 text-sm">Эх үүсвэр
                    <select aria-label="Эх үүсвэр" className={marketingInputClass} value={source} disabled={!!busy}
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
                <span className="text-xs text-muted-foreground">Толгой {preview.headerRow}-р мөрөнд · {result.rowCount} мөр тооцсон{result.zeroRows ? ` · ${result.zeroRows} хоосон мөр` : ''}{!splitting && result.excludedRows ? ` · ${result.excludedRows} мөр хассан` : ''}{result.totalRow ? ' · файлын «нийт» мөр олдсон' : ''}</span>
            </div>
            {preview.sheets.length > 1 && <label className="grid max-w-xs gap-1.5 text-sm">Sheet
                <select className={marketingInputClass} value={preview.sheet} disabled={!!busy} onChange={e => void check({ sheet: e.target.value })}>
                    {preview.sheets.map(name => <option key={name} value={name}>{name}</option>)}
                </select>
            </label>}
            {!preview.storageReady && <Alert variant="warning">Тайлан хадгалах хүснэгт үүсээгүй байна. Урьдчилан харж болно, хадгалахын тулд миграци шаардлагатай.</Alert>}
            {preview.split && <div className="space-y-2 rounded-lg border border-border p-3">
                <label className="flex min-h-9 items-center gap-2 text-sm font-medium">
                    <input type="checkbox" className="size-4 accent-brand" checked={splitOn} disabled={!!busy} onChange={event => setSplitOn(event.target.checked)} />
                    Хурлын долоо хоногоор хуваах
                </label>
                <p className="text-xs text-muted-foreground">Файл өдрөөр задалсан бөгөөд {preview.split.period.from} – {preview.split.period.to} хооронд {preview.split.weeks.length} хурлын долоо хоног (Лхагва–Мягмар) хамарна. {splitOn ? 'Долоо хоног бүрийг тусад нь тайлан болгож хадгална — кампанит ажлын задаргаа ч долоо хоногоор.' : `Хуваахгүй бол зөвхөн сонгосон ${period.from} – ${period.to} хугацааг хадгална.`}</p>
                {splitOn && <>
                    <ChannelSplitWeeks weeks={preview.split.weeks} currency={currency} showCalls={typeof preview.split.result.totals[metaResultKey('calls')] === 'number'}
                        selected={chosen} onToggle={toggleWeek} disabled={!!busy} />
                    <p className="text-xs text-muted-foreground">{chosenCount}/{preview.split.weeks.length} долоо хоногийг хадгална. Meta API-аас татсан долоо хоногийг файлаар солихгүй; өмнө нь илүү олон өдрөөр хадгалсан долоо хоногийг анхдагчаар алгасна (сонговол энэ файлаар солигдоно).</p>
                    {apiWeeks > 0 && <p className="text-xs text-status-pending">Meta API-ийн {apiWeeks} долоо хоног: {CHANNEL_API_WEEK_REPLACE_HINT}</p>}
                    {!chosenCount && <p className="text-xs text-status-pending">Хадгалах долоо хоногоо сонгоно уу.</p>}
                </>}
            </div>}
            {!splitting && preview.existing && (preview.existing.origin === 'api'
                ? <Alert variant="danger">Энэ хугацааны {CHANNEL_SOURCE_LABELS[source]} тайланг Meta API-аас автоматаар татсан тул файлаар дарж бичихгүй. {CHANNEL_API_WEEK_REPLACE_HINT} Эсвэл өөр хугацаа сонгоно уу.</Alert>
                : <Alert variant="info">Энэ хугацааны {CHANNEL_SOURCE_LABELS[source]} тайлан ({preview.existing.file_name || 'файл'}) хадгалагдсан байна. {preview.existing.sameFile ? 'Яг энэ файлаар хадгалсан тул дахин хадгалахад дүн өөрчлөгдөхгүй.' : 'Хадгалбал шинэ файлаар солигдоно.'}</Alert>)}
            {!splitting && preview.duplicate && <Alert variant="warning">Яг энэ файлыг {preview.duplicate.period_from} – {preview.duplicate.period_to} хугацааны {CHANNEL_SOURCE_LABELS[preview.duplicate.source]} тайланд хадгалсан байна. {preview.duplicate.source === source ? 'Өөр долоо хоногийн файл мөн эсэхийг шалгана уу.' : 'Эх үүсвэрээ шалгана уу.'}</Alert>}
            {!splitting && detected && (detected.from !== period.from || detected.to !== period.to) && <Alert variant={outside ? 'warning' : 'info'}>
                <div className="flex flex-wrap items-center gap-2">
                    <span>{outside
                        ? `Файлд сонгосон хугацаанаас (${period.from} – ${period.to}) гадуурх огноо байна: ${detected.from} – ${detected.to}. Гадуурх мөрүүд тооцоонд ороогүй.`
                        : `Файлын мөрүүд ${detected.from} – ${detected.to} хооронд байна (сонгосон ${period.from} – ${period.to}).`}</span>
                    <Button type="button" size="sm" variant="secondary" disabled={!!busy || !ChannelPeriodSchema.safeParse(detected).success} onClick={() => changePeriod(detected)}>Файлын хугацааг сонгох</Button>
                </div>
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
                    <h3 className="text-sm font-semibold">Нийт дүн · {shown.from} – {shown.to}{splitting ? ' (файлын бүх хугацаа)' : ''}</h3>
                    <ChannelTotalsGrid source={source} totals={result.totals} missing={result.missing} />
                    {source === 'meta_ads' && <MetaResultsByType totals={result.totals} />}
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

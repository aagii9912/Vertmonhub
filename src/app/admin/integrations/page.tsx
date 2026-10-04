'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, Plug, RefreshCw, SearchCheck } from 'lucide-react';
import { toast } from 'sonner';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { StatusPill } from '@/components/ui/StatusPill';
import { Switch } from '@/components/ui/Switch';
import { formatShortDate, formatTime } from '@/lib/utils/date';
import type { ElysiumLedgerEntry, ElysiumRunOutcome, ElysiumSyncResult, ElysiumSyncStatus } from '@/lib/services/ElysiumLeadSync';

const ENDPOINT = '/api/admin/integrations/elysium';

type RowOutcome = ElysiumRunOutcome | 'failed';
type Variant = 'success' | 'info' | 'danger' | 'pending';

/** Ledger-ийн «imported» нь шинээр татсан ба түлхүүрээр олдсон (түүхэн импорт) хоёуланг агуулна. */
const OUTCOME: Record<RowOutcome, { label: string; variant: Variant }> = {
    imported: { label: 'Татаж оруулсан', variant: 'success' },
    keyed: { label: 'Өмнө оруулсан', variant: 'info' },
    matched: { label: 'CRM-д байсан', variant: 'info' },
    invalid: { label: 'Алдаатай', variant: 'danger' },
    failed: { label: 'Дахин оролдоно', variant: 'pending' },
};
/** «Шалгах» юу ч хадгалаагүй тул ирээдүйн хэлбэрээр. */
const PREVIEW_OUTCOME: Record<RowOutcome, { label: string; variant: Variant }> = {
    ...OUTCOME,
    imported: { label: 'Шинээр орно', variant: 'success' },
};

async function readJson<T>(response: Response, fallback: string): Promise<T> {
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error((data as { error?: string }).error || fallback);
    return data as T;
}

const fetchStatus = async () => readJson<ElysiumSyncStatus>(await fetch(ENDPOINT, { cache: 'no-store' }), 'Холболтын төлөв ачаалагдсангүй');

/** Улаанбаатарын цагаар «2026-10-04 14:32». */
const when = (value: string | null | undefined) => (value ? `${formatShortDate(value)} ${formatTime(value)}` : '—');
const count = (value: unknown) => (typeof value === 'number' ? value.toLocaleString() : '—');

function counts(result: ElysiumSyncResult) {
    return `шинээр ${result.imported} · CRM-д байсан ${result.matched}${result.keyed ? ` · өмнө оруулсан ${result.keyed}` : ''} · алдаатай ${result.invalid}`;
}

function LedgerTable({ rows, caption, labels = OUTCOME }: {
    rows: Array<Pick<ElysiumLedgerEntry, 'source_id' | 'source_name' | 'source_created_at' | 'detail'> & { outcome: RowOutcome }>;
    caption: string;
    labels?: Record<RowOutcome, { label: string; variant: Variant }>;
}) {
    return (
        <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] text-sm">
                <caption className="sr-only">{caption}</caption>
                <thead>
                    <tr className="border-b border-border text-left text-xs text-muted-foreground">
                        <th scope="col" className="py-2 pr-3 font-medium">Огноо</th>
                        <th scope="col" className="py-2 pr-3 font-medium">Нэр</th>
                        <th scope="col" className="py-2 pr-3 font-medium">Үр дүн</th>
                        <th scope="col" className="py-2 font-medium">Тайлбар</th>
                    </tr>
                </thead>
                <tbody>
                    {rows.map((row) => (
                        <tr key={row.source_id} className="border-b border-border last:border-0">
                            <td className="num whitespace-nowrap py-2 pr-3 text-muted-foreground">{when(row.source_created_at)}</td>
                            <td className="py-2 pr-3 text-foreground">{row.source_name || '—'}</td>
                            <td className="py-2 pr-3"><StatusPill variant={labels[row.outcome].variant}>{labels[row.outcome].label}</StatusPill></td>
                            <td className="py-2 text-muted-foreground">{row.detail || '—'}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

export default function AdminIntegrationsPage() {
    const queryClient = useQueryClient();
    const { data, error, isFetching, refetch } = useQuery({
        meta: { inlineError: true },
        queryKey: ['admin-integrations', 'elysium'],
        queryFn: fetchStatus,
        staleTime: 0,
        refetchOnWindowFocus: false,
    });
    const [preview, setPreview] = useState<ElysiumSyncResult | null>(null);
    const refresh = () => queryClient.invalidateQueries({ queryKey: ['admin-integrations'] });

    const run = useMutation({
        mutationFn: async (dryRun: boolean) => (await readJson<{ result: ElysiumSyncResult }>(await fetch(ENDPOINT, {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ dryRun }),
        }), 'Elysium лид татахад алдаа гарлаа')).result,
        onSuccess: (result, dryRun) => {
            if (dryRun) {
                setPreview(result);
                toast.success(`Шалгалт: ${counts(result)}. Юу ч хадгалаагүй.`);
                return;
            }
            setPreview(null);
            toast.success(`Татаж дууслаа: ${counts(result)}${result.remaining ? ` · үлдсэн ${result.remaining}` : ''}`);
            if (result.failed) toast.error(`${result.failed} хүсэлт хадгалагдсангүй. Дараагийн ажиллалт дахин оролдоно.`);
            void refresh();
        },
        onError: (mutationError) => {
            toast.error(mutationError instanceof Error ? mutationError.message : 'Elysium лид татахад алдаа гарлаа');
            void refresh();
        },
    });
    const toggle = useMutation({
        mutationFn: async (enabled: boolean) => readJson<{ enabled: boolean }>(await fetch(ENDPOINT, {
            method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ enabled }),
        }), 'Тохиргоо хадгалагдсангүй'),
        onSuccess: (saved) => {
            toast.success(saved.enabled ? 'Автомат татах асаалаа' : 'Автомат татах унтраалаа');
            void refresh();
        },
        onError: (mutationError) => toast.error(mutationError instanceof Error ? mutationError.message : 'Тохиргоо хадгалагдсангүй'),
    });

    const loading = !data && isFetching;
    const loadError = error && !data ? error.message : null;
    const state = data?.state ?? null;
    const enabled = toggle.isPending ? !!toggle.variables : !!state?.enabled;
    const ready = !!data?.storageReady;
    const pullConfigured = !!data?.config.pullConfigured;
    // ELYSIUM_LEAD_PROJECT_ID тохируулсан боловч төсөл олдоогүй: ажиллалт бүр бүтэлгүйтнэ.
    const projectMissing = pullConfigured && !data?.project;
    const busy = run.isPending;
    const pill = !pullConfigured ? { variant: 'neutral' as const, label: 'Тохируулаагүй' }
        : state?.last_error || projectMissing ? { variant: 'danger' as const, label: 'Алдаатай' }
        : state?.enabled ? { variant: 'success' as const, label: 'Идэвхтэй' }
        : { variant: 'pending' as const, label: 'Унтраалттай' };

    return (
        <div className="mx-auto max-w-5xl space-y-6">
            <div>
                <h1 className="heading-display text-2xl text-foreground">Холболтууд</h1>
                <p className="mt-1 text-sm text-muted-foreground">Гадны сайтаас CRM руу лид оруулах холболтууд.</p>
            </div>

            {loading ? <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-brand" aria-label="Ачаалж байна" /></div>
                : loadError ? <div role="alert" className="rounded-lg border border-status-danger/30 bg-status-danger-soft p-4 text-sm text-status-danger">
                    {loadError} <button type="button" onClick={() => void refetch()} className="focus-ring ml-2 font-semibold underline">Дахин ачаалах</button>
                </div>
                : data && <>
                    <section aria-labelledby="elysium-title" className="rounded-xl border border-border bg-surface">
                        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border p-5">
                            <div className="flex min-w-0 items-start gap-3">
                                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-soft text-brand-strong"><Plug className="h-5 w-5" /></span>
                                <div className="min-w-0">
                                    <h2 id="elysium-title" className="font-semibold text-foreground">Elysium сайт (elysium.mn)</h2>
                                    <p className="mt-1 text-sm text-muted-foreground">Сайтын маягт шууд дамжуулалтаар CRM-д орно. Дамжуулалт амжилтгүй болсон хүсэлтийг автомат татах нөхөж, нэг хүсэлтийг нэг л удаа оруулна.</p>
                                </div>
                            </div>
                            <StatusPill variant={pill.variant} dot>{pill.label}</StatusPill>
                        </div>

                        <div className="space-y-5 p-5">
                            {!ready && <Alert variant="warning">Холболтын хүснэгт суулгагдаагүй байна. Migration 20261004164000-г суулгасны дараа ашиглана.</Alert>}
                            {!pullConfigured && <Alert variant="info">Автомат татахад Vercel-д ELYSIUM_SUPABASE_URL, ELYSIUM_SUPABASE_SERVICE_KEY, ELYSIUM_LEAD_PROJECT_ID-г тохируулж дахин deploy хийнэ үү.</Alert>}
                            {projectMissing && <Alert variant="danger">ELYSIUM_LEAD_PROJECT_ID-д заасан төсөл олдсонгүй. Vercel-ийн тохиргоог шалгаад дахин deploy хийнэ үү.</Alert>}

                            <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
                                {([
                                    ['Шууд дамжуулалт', data.config.pushConfigured ? 'Тохируулсан' : 'Тохируулаагүй'],
                                    ['Автомат татах', pullConfigured ? 'Тохируулсан' : 'Тохируулаагүй'],
                                    ['Төсөл', data.project?.name || 'Олдсонгүй'],
                                    ['Сүүлд шалгасан', when(state?.last_attempt_at)],
                                    ['Сүүлийн амжилттай', when(state?.last_success_at)],
                                    ['Шалгасан хүрээ', state?.cursor_at ? `${when(state.cursor_at)} хүртэл` : '—'],
                                ] as const).map(([label, value]) => (
                                    <div key={label} className="flex items-baseline justify-between gap-3 border-b border-border pb-2">
                                        <dt className="text-muted-foreground">{label}</dt>
                                        <dd className="num text-right font-medium text-foreground">{value}</dd>
                                    </div>
                                ))}
                            </dl>

                            {state?.last_error && <Alert variant="danger">Сүүлийн алдаа: {state.last_error}</Alert>}

                            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                                {([
                                    ['Elysium-д нийт', count(state?.last_result?.sourceTotal)],
                                    ['CRM-д шууд ирсэн', count(data.totals?.matched)],
                                    ['Татаж оруулсан', count(data.totals?.imported)],
                                    ['Шалгах шаардлагатай', count(data.totals?.invalid)],
                                ] as const).map(([label, value]) => (
                                    <div key={label} className="rounded-lg border border-border p-3">
                                        <p className="text-xs text-muted-foreground">{label}</p>
                                        <p className="num mt-1 text-xl font-semibold text-foreground">{value}</p>
                                    </div>
                                ))}
                            </div>

                            <div className="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-border p-4">
                                <div className="min-w-0">
                                    <p id="elysium-auto-label" className="text-sm font-medium text-foreground">Автомат татах (15 минут тутам)</p>
                                    <p className="mt-1 text-xs text-muted-foreground">Сүүлийн {data.settleMinutes} минутын хүсэлтийг шууд дамжуулалт дуусах хүртэл хүлээнэ. Эхлээд «Шалгах»-аар үр дүнг харна уу.</p>
                                </div>
                                <Switch
                                    checked={enabled}
                                    onCheckedChange={(next) => toggle.mutate(next)}
                                    disabled={!ready || toggle.isPending || (!pullConfigured && !state?.enabled)}
                                    aria-labelledby="elysium-auto-label"
                                />
                            </div>

                            <div className="flex flex-wrap gap-2">
                                <Button variant="secondary" disabled={!ready || !pullConfigured || busy} isLoading={busy && run.variables === true} onClick={() => run.mutate(true)}>
                                    {!(busy && run.variables === true) && <SearchCheck />} Шалгах
                                </Button>
                                <Button disabled={!ready || !pullConfigured || busy} isLoading={busy && run.variables === false} onClick={() => run.mutate(false)}>
                                    {!(busy && run.variables === false) && <RefreshCw />} Одоо татах
                                </Button>
                            </div>

                            {preview && <div role="status" className="space-y-3 rounded-lg border border-border p-4">
                                <p className="text-sm font-medium text-foreground">Шалгалтын үр дүн (юу ч хадгалаагүй)</p>
                                <p className="num text-sm text-muted-foreground">
                                    Шинээр орох {preview.imported} · CRM-д байгаа {preview.matched} · Алдаатай {preview.invalid}
                                    {preview.keyed ? ` · Өмнө оруулсан ${preview.keyed}` : ''}
                                    {preview.repeats ? ` · Дахин хүсэлт ${preview.repeats}` : ''}
                                </p>
                                {preview.sample.length > 0 && <LedgerTable caption="Шалгалтын жишээ" labels={PREVIEW_OUTCOME} rows={preview.sample.map((row) => ({
                                    source_id: row.sourceId, source_name: row.name, source_created_at: row.createdAt, detail: row.detail, outcome: row.outcome,
                                }))} />}
                            </div>}
                        </div>
                    </section>

                    <section aria-labelledby="elysium-recent" className="rounded-xl border border-border bg-surface p-5">
                        <h2 id="elysium-recent" className="font-semibold text-foreground">Сүүлийн хүсэлтүүд</h2>
                        {data.recent.length ? <div className="mt-3"><LedgerTable caption="Сүүлийн хүсэлтүүд" rows={data.recent} /></div>
                            : <p className="mt-2 text-sm text-muted-foreground">Одоогоор тулгасан хүсэлт алга.</p>}
                    </section>

                    {data.invalid.length > 0 && <section aria-labelledby="elysium-invalid" className="rounded-xl border border-border bg-surface p-5">
                        <h2 id="elysium-invalid" className="font-semibold text-foreground">Шалгах шаардлагатай</h2>
                        <p className="mt-1 text-sm text-muted-foreground">Татан авалт эдгээр хүсэлтийг CRM-д оруулаагүй (шууд дамжуулалтаар орсон байж болно). Elysium-ийн админ хуудсаас харж, CRM-д байхгүй бол гараар лид үүсгэнэ үү.</p>
                        <div className="mt-3"><LedgerTable caption="Шалгах шаардлагатай хүсэлтүүд" rows={data.invalid} /></div>
                    </section>}
                </>}
        </div>
    );
}

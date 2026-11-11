'use client';

import { ArrowUpRight, FileSpreadsheet } from 'lucide-react';
import { Alert } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/dashboard/v2/primitives';
import { WEEKLY_FILE_LABEL, weeklyFileNote, weeklyFilesStatus, type WeeklyFile, type WeeklyFileState } from '@/lib/dashboard/weekly-files';
import type { useWeeklySales } from './WeeklySalesDetails';

const STATE_BADGE: Record<WeeklyFileState, { label: string; variant: 'success' | 'warning' | 'neutral' }> = {
    fresh: { label: 'Энэ долоо хоногийнх', variant: 'success' },
    partial: { label: 'Дутуу байж болно', variant: 'warning' },
    stale: { label: 'Хуучин', variant: 'warning' },
    missing: { label: 'Оруулаагүй', variant: 'neutral' },
};

/** Заавал биш файлын тайлбар: яагаад тайланд хэрэггүй байгааг хэлнэ (хуучин гэж сандаргахгүй). */
function optionalNote(file: WeeklyFile): string {
    if (file.kind === 'products') return 'Үлдэгдлийг гэрээний HUB жагсаалтаас тооцож байна. Байрны үнэ шинэчлэх бол оруулна.';
    return 'Энэ төсөл гэрээгээ ERP экспортоос уншиж байна. HUB жагсаалтаар ажиллах бол оруулна.';
}

/**
 * Лхагвын тайлангийн эхний алхам — «ERP мэдээлэл оруулах»: долоо хоног бүр оруулдаг файл тус бүр хэзээ орсон,
 * тайлангийн аль хэсэг түүнээс гардаг, хаанаас оруулах. Оруулах нь өөрийн хуудсанд (шалгах → батлах) хийгдэнэ.
 */
export function WeeklyDataFiles({ query, range, canImportHub, canImportErp }: {
    query: ReturnType<typeof useWeeklySales>;
    range: { from: string; to: string };
    /** Гэрээний HUB импорт: гэрээ + ERP импортын бичих эрх, хязгааргүй (удирдлагын) хэрэглэгч. */
    canImportHub: boolean;
    /** ERP snapshot импорт: ERP импортын бичих эрх. */
    canImportErp: boolean;
}) {
    if (query.isPending) return <Skeleton className="h-56" />;
    const files = query.data?.files;
    if (!files) return <p className="rounded-xl bg-surface-2 p-5 text-sm leading-relaxed text-muted-foreground">Файлын төлөвийг ачаалж чадсангүй. {query.error?.message ?? 'Шинэчлэх товчоор дахин оролдоно уу.'}</p>;
    const status = weeklyFilesStatus(files);
    // Яаралтай алдаа биш, бэлтгэлийн төлөв тул `role="status"` (дэлгэц уншигчийг тасалдуулахгүй).
    const pendingTitles = status.pending.map(file => WEEKLY_FILE_LABEL[file.kind].title).join(', ');

    return (
        <div className="space-y-5">
            {status.ready
                ? <Alert variant="success" role="status">Энэ долоо хоногийн файл орсон. Дараагийн алхамд тоогоо шалгана.</Alert>
                : <Alert variant="warning" role="status">{status.pending.length ? `Шинэ файл хэрэгтэй: ${pendingTitles}. Оруулаагүй бол тайлан өмнөх файлын тоогоор гарна.` : 'Энэ төсөлд ERP-ийн файл хараахан ороогүй. Гэрээний жагсаалтаас эхэлнэ.'}</Alert>}

            <ul className="divide-y divide-border rounded-2xl border border-border">
                {files.map(file => {
                    const label = WEEKLY_FILE_LABEL[file.kind];
                    const badge = STATE_BADGE[file.state];
                    const allowed = file.kind === 'hub' ? canImportHub : canImportErp;
                    const due = file.needed && file.state !== 'fresh';
                    return <li key={file.kind} className="flex flex-wrap items-start gap-4 p-5">
                        <FileSpreadsheet className="mt-0.5 size-5 shrink-0 text-muted-foreground" aria-hidden />
                        <div className="min-w-[240px] flex-1 space-y-1.5">
                            <div className="flex flex-wrap items-center gap-2">
                                <h3 className="text-sm font-semibold">{label.title}</h3>
                                {/* Заавал биш файлыг «хуучин» гэж шараар анхааруулахгүй. */}
                                <Badge variant={file.needed ? badge.variant : 'neutral'}>{file.needed || file.state === 'missing' ? badge.label : 'Заавал биш'}</Badge>
                            </div>
                            <p className="text-sm leading-relaxed text-fg-2">{weeklyFileNote(file, range)}{!file.needed && ` ${optionalNote(file)}`}</p>
                            <p className="text-xs leading-relaxed text-muted-foreground">Тайланд: {label.feeds}</p>
                            {(file.name || file.by) && <p className="break-words text-xs text-muted-foreground [overflow-wrap:anywhere]">{[file.name, file.by && `оруулсан ${file.by}`].filter(Boolean).join(' · ')}</p>}
                        </div>
                        {allowed
                            ? <Button href={label.href} size="sm" variant={due ? 'primary' : 'secondary'}>Файл оруулах<span className="sr-only">: {label.title}</span><ArrowUpRight /></Button>
                            : <p className="max-w-[180px] text-xs leading-relaxed text-muted-foreground">Файлыг удирдлага (импортын эрхтэй хүн) оруулна.</p>}
                    </li>;
                })}
            </ul>

            <ol className="list-decimal space-y-1 pl-5 text-xs leading-relaxed text-muted-foreground">
                <li>ERP-ээс файлаа Excel-ээр татна (Мягмар гарагийн байдлаар).</li>
                <li>«Файл оруулах» дарж файлаа сонгоод шалгаж, батална.</li>
                <li>«Лхагвын тайлан руу буцах» дарж энд эргэж ирнэ — тоо өөрөө шинэчлэгдэнэ.</li>
            </ol>
        </div>
    );
}

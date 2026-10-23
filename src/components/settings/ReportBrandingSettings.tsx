'use client';

import { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ImagePlus, Palette, Save, X } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useModuleAccess } from '@/hooks/useModuleAccess';
import { dashboardJson, dashboardMutate } from '@/lib/api/dashboardFetch';
import { uploadBrandingImage } from '@/lib/dashboard/report-media-client';
import {
    brandingImageUrl, REPORT_BRANDING_LIMITS, type ReportBranding, type ReportBrandingResponse,
} from '@/lib/dashboard/report-branding';
import { SectionCard } from '@/components/ui/SectionCard';
import { FormField } from '@/components/ui/FormField';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Alert';
import { Skeleton } from '@/components/dashboard/v2/primitives';

/**
 * Тохиргоо → «Тайлангийн брэнд»: Лхагвын хурлын багийн загварын илтгэлийн харагдах нэр, хөл бичвэр, нүүрний зураг,
 * лого (төсөл бүрт). Засах = «Тохиргоо» бичих эрх; зураг хувийн bucket-д, татах бүрд эрх шалгана.
 * Одоогийн борлуулалт, маркетингийн илтгэлд нөлөөлөхгүй.
 */
type Draft = { displayName: string; footerText: string; coverImagePath: string | null; logoPath: string | null };
const draftOf = (branding: ReportBranding): Draft => ({
    displayName: branding.displayName ?? '', footerText: branding.footerText ?? '', coverImagePath: branding.coverImagePath, logoPath: branding.logoPath,
});

export function ReportBrandingSettings() {
    const { shop } = useAuth();
    const { can, canWrite } = useModuleAccess();
    const visible = can('settings') || can('reports');
    const editable = canWrite('settings');
    const queryClient = useQueryClient();
    const query = useQuery<ReportBrandingResponse>({
        queryKey: ['report-branding', shop?.id],
        queryFn: ({ signal }) => dashboardJson('/api/dashboard/report-branding', { signal, shopId: shop?.id }),
        enabled: !!shop?.id && visible, staleTime: 60_000, retry: 1,
    });
    // Засаагүй бол серверийн утга; засвар эхэлбэл түр төлөв (хадгалсны дараа дахин серверийнх).
    const [edited, setEdited] = useState<Draft | null>(null);
    const [uploading, setUploading] = useState(0);
    const saved = query.data ? draftOf(query.data.branding) : null;
    const draft = edited ?? saved;
    const patch = (change: Partial<Draft>) => setEdited(current => {
        const base = current ?? saved;
        return base && { ...base, ...change };
    });
    const save = useMutation({
        mutationFn: (value: Draft) => dashboardMutate<ReportBrandingResponse>('/api/dashboard/report-branding', 'PUT', {
            ...value, expectedUpdatedAt: query.data?.branding.updatedAt ?? null,
        }, { shopId: shop?.id }),
        onSuccess: result => {
            queryClient.setQueryData(['report-branding', shop?.id], result);
            setEdited(null);
            toast.success('Тайлангийн брэнд хадгалагдлаа');
        },
        onError: () => { void queryClient.invalidateQueries({ queryKey: ['report-branding', shop?.id] }); },
    });

    if (!visible) return null;
    const unavailable = query.data && !query.data.available;
    const dirty = !!draft && !!saved && JSON.stringify(draft) !== JSON.stringify(saved);

    return (
        <SectionCard title="Тайлангийн брэнд" icon={Palette}
            description="Лхагвын хурлын илтгэлийн (албаны загвар) нүүр, хөлд гарах төслийн нэр, бичвэр, зураг. Хоосон бол Hub-ийн анхдагч загвар.">
            {query.isPending ? <Skeleton className="h-40" />
                : query.isError ? <Alert variant="danger">Брэндийг ачаалж чадсангүй. {query.error.message}</Alert>
                : unavailable ? <Alert variant="info">Тайлангийн брэнд хадгалах хэсэг хараахан идэвхжээгүй байна. Админд хандаж шинэчлэлийг суулгана уу.</Alert>
                : draft && <form className="space-y-4" onSubmit={event => { event.preventDefault(); if (editable && !uploading) save.mutate(draft); }}>
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                        <FormField label="Харагдах нэр" htmlFor="branding-name" hint="Жишээ: «ЭЛИЗИУМ» — илтгэлийн гарчиг, нүүрэнд">
                            <Input id="branding-name" value={draft.displayName} maxLength={REPORT_BRANDING_LIMITS.displayName} disabled={!editable}
                                placeholder="ЭЛИЗИУМ" onChange={event => patch({ displayName: event.target.value })} />
                        </FormField>
                        <FormField label="Хөл бичвэр" htmlFor="branding-footer" hint="Жишээ: «ВЕРТМОН ПРОПЕРТИС» — слайд бүрийн доод хэсэгт">
                            <Input id="branding-footer" value={draft.footerText} maxLength={REPORT_BRANDING_LIMITS.footerText} disabled={!editable}
                                placeholder="ВЕРТМОН ПРОПЕРТИС" onChange={event => patch({ footerText: event.target.value })} />
                        </FormField>
                    </div>
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                        <BrandingImage label="Нүүрний зураг" hint="Төслийн рендер, хэвтээ (16:9 орчим)" path={draft.coverImagePath} editable={editable}
                            onChange={path => patch({ coverImagePath: path })} setUploading={setUploading} />
                        <BrandingImage label="Лого" hint="Тунгалаг дэвсгэртэй PNG тохиромжтой" path={draft.logoPath} editable={editable}
                            onChange={path => patch({ logoPath: path })} setUploading={setUploading} />
                    </div>
                    {save.error && <Alert variant="danger">{save.error.message}</Alert>}
                    {editable ? <div className="flex justify-end">
                        <Button type="submit" isLoading={save.isPending} disabled={!dirty || uploading > 0}><Save />{uploading ? 'Зураг оруулж байна…' : 'Хадгалах'}</Button>
                    </div> : <p className="text-xs text-muted-foreground">Засахад «Тохиргоо»-ны бичих эрх шаардлагатай.</p>}
                </form>}
        </SectionCard>
    );
}

function BrandingImage({ label, hint, path, editable, onChange, setUploading }: {
    label: string; hint: string; path: string | null; editable: boolean; onChange: (path: string | null) => void; setUploading: (update: (count: number) => number) => void;
}) {
    const input = useRef<HTMLInputElement>(null);
    const [busy, setBusy] = useState(false);
    const url = brandingImageUrl(path);
    async function pick(file: File | undefined) {
        if (!file) return;
        setBusy(true);
        setUploading(count => count + 1);
        try {
            const uploaded = await uploadBrandingImage(file);
            onChange(uploaded.path);
        } catch (error) {
            toast.error(error instanceof Error ? error.message : 'Зургийг хадгалж чадсангүй.');
        } finally {
            setBusy(false);
            setUploading(count => count - 1);
        }
    }
    return (
        <FormField label={label} hint={hint}>
            <div className="rounded-xl border border-dashed border-control p-3">
                {url
                    // Хувийн зураг: хаяг бүр нэвтрэлт, гишүүнчлэл, эрхийг дахин шалгана.
                    // eslint-disable-next-line @next/next/no-img-element
                    ? <img src={url} alt={label} className="mb-3 max-h-40 w-full rounded-lg border border-border bg-surface-2 object-contain" />
                    : <p className="mb-3 text-xs text-muted-foreground">Зураг оруулаагүй.</p>}
                {editable && <div className="flex flex-wrap gap-2">
                    <input ref={input} type="file" accept="image/*" className="sr-only" tabIndex={-1} aria-hidden
                        onChange={event => { void pick(event.target.files?.[0]); event.target.value = ''; }} />
                    <Button type="button" variant="tertiary" size="sm" isLoading={busy} onClick={() => input.current?.click()}><ImagePlus />{path ? 'Солих' : 'Зураг сонгох'}</Button>
                    {path && <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={() => onChange(null)}><X />Хасах</Button>}
                </div>}
            </div>
        </FormField>
    );
}

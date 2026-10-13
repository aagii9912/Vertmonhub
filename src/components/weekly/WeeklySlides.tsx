'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowDown, ArrowUp, Pencil, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { dashboardJson, dashboardMutate } from '@/lib/api/dashboardFetch';
import {
    reportMediaUrl, WEEKLY_SLIDE_LIMITS, WEEKLY_SLIDE_PART_SECTIONS, WEEKLY_SLIDE_SECTION_LABEL,
    type WeeklySlide, type WeeklySlidePart, type WeeklySlideSection,
} from '@/lib/dashboard/weekly-slides';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Alert';
import { Input } from '@/components/ui/Input';
import { Textarea } from '@/components/ui/Textarea';
import { FormField, FieldGroup } from '@/components/ui/FormField';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/Select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/Dialog';
import { Skeleton } from '@/components/dashboard/v2/primitives';
import { draftImages, makeImageUploader, pastedImages, ReportImagePicker, savedPaths, type DraftImage } from './ReportImagePicker';

export type WeeklySlidesResponse = { slides: WeeklySlide[]; parts: WeeklySlidePart[] };

export function useWeeklySlides(meetingDate: string, enabled: boolean) {
    const { shop, user } = useAuth();
    return useQuery<WeeklySlidesResponse>({
        queryKey: ['weekly-slides', shop?.id, user?.id, meetingDate],
        queryFn: ({ signal }) => dashboardJson(`/api/dashboard/weekly-slides?meetingDate=${meetingDate}`, { signal, shopId: shop?.id }),
        enabled: !!shop?.id && enabled, staleTime: 30_000, retry: 1,
    });
}

const PART_HINT: Record<WeeklySlidePart, string> = {
    marketing: 'Контент төлөвлөгөөнөөс гадуурх слайд: Page / Ads / CallPro / SMS / сэжим хуудасны дэлгэцийн зураг, дүгнэлт. Контентын постерыг контент төлөвлөгөөнд хавсаргана. Слайд бүр PowerPoint-д тусдаа слайд болно.',
    sales: 'Өдөрлөгийн зураг, хүлээлцсэн байдал, яригдаж буй гэрээ, энэ сарын ажил зэрэг системээс гардаггүй слайд.',
};

/** Хурлын тайлангийн нэмэлт слайдууд (хэсэг тус бүр): харах, нэмэх, засах, дараалал, устгах. */
export function WeeklySlides({ part, meetingDate, query, canWrite, canDelete }: {
    part: WeeklySlidePart; meetingDate: string; query: ReturnType<typeof useWeeklySlides>; canWrite: boolean; canDelete: boolean;
}) {
    const { shop, user } = useAuth();
    const queryClient = useQueryClient();
    const [editing, setEditing] = useState<WeeklySlide | 'new' | null>(null);
    const slides = (query.data?.slides ?? []).filter(slide => slide.part === part).sort((a, b) => a.position - b.position);
    const refresh = () => queryClient.invalidateQueries({ queryKey: ['weekly-slides', shop?.id] });
    const reorder = useMutation({
        mutationFn: (ids: string[]) => dashboardMutate('/api/dashboard/weekly-slides', 'PUT', { meetingDate, part, ids }, { shopId: shop?.id }),
        onSettled: refresh,
        onError: error => toast.error(error.message),
    });
    const remove = useMutation({
        mutationFn: (id: string) => dashboardMutate(`/api/dashboard/weekly-slides/${id}`, 'DELETE', undefined, { shopId: shop?.id }),
        onSuccess: () => { void refresh(); toast.success('Слайд устгагдлаа'); },
        onError: error => toast.error(error.message),
    });
    function move(index: number, delta: number) {
        const ids = slides.map(slide => slide.id);
        const [id] = ids.splice(index, 1);
        ids.splice(index + delta, 0, id);
        reorder.mutate(ids);
    }

    if (query.isPending) return <Skeleton className="h-28" />;
    if (query.isError) return <p className="rounded-xl bg-surface-2 p-4 text-sm text-muted-foreground">Нэмэлт слайдыг ачаалж чадсангүй. {query.error.message}</p>;

    return (
        <div className="space-y-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <p className="max-w-2xl text-xs leading-relaxed text-muted-foreground">{PART_HINT[part]}</p>
                {canWrite && <Button size="sm" variant="secondary" className="print:hidden" onClick={() => setEditing('new')}><Plus />Слайд нэмэх</Button>}
            </div>
            {slides.length ? <ol className="grid gap-3 md:grid-cols-2">
                {slides.map((slide, index) => {
                    const mine = slide.author_id === user?.id;
                    return <li key={slide.id} className="break-inside-avoid rounded-2xl border border-border p-4">
                        <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                                <p className="text-xs font-medium text-brand-strong">{index + 1}. {WEEKLY_SLIDE_SECTION_LABEL[slide.section]}</p>
                                {slide.title && <h4 className="mt-1 break-words text-sm font-semibold">{slide.title}</h4>}
                            </div>
                            {canWrite && <div className="flex shrink-0 items-center print:hidden">
                                <Button variant="ghost" size="iconSm" aria-label="Дээш зөөх" disabled={index === 0 || reorder.isPending} onClick={() => move(index, -1)}><ArrowUp /></Button>
                                <Button variant="ghost" size="iconSm" aria-label="Доош зөөх" disabled={index === slides.length - 1 || reorder.isPending} onClick={() => move(index, 1)}><ArrowDown /></Button>
                                <Button variant="ghost" size="iconSm" aria-label="Засах" onClick={() => setEditing(slide)}><Pencil /></Button>
                                {(mine || canDelete) && <Button variant="ghost" size="iconSm" aria-label="Устгах" disabled={remove.isPending}
                                    onClick={() => { if (window.confirm('Энэ слайдыг зурагтай нь устгах уу?')) remove.mutate(slide.id); }}><Trash2 /></Button>}
                            </div>}
                        </div>
                        {slide.image_paths.length > 0 && <div className={cn('mt-3 grid gap-2', slide.image_paths.length === 1 ? 'grid-cols-1' : 'grid-cols-3')}>
                            {slide.image_paths.map((path, imageIndex) => (
                                // Хувийн зураг: хаяг бүр нэвтрэлт, гишүүнчлэл, эрхийг дахин шалгана.
                                // eslint-disable-next-line @next/next/no-img-element
                                <img key={path} src={reportMediaUrl(path)} alt={`${slide.title || WEEKLY_SLIDE_SECTION_LABEL[slide.section]} — зураг ${imageIndex + 1}`} loading="lazy"
                                    className={cn('w-full rounded-lg border border-border bg-surface-2 object-contain', slide.image_paths.length === 1 ? 'max-h-72' : 'aspect-square')} />
                            ))}
                        </div>}
                        {slide.note.trim() && <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-relaxed text-fg-2">{slide.note}</p>}
                        <p className="mt-2 text-xs text-muted-foreground">Оруулсан: {slide.author_name || '—'}</p>
                    </li>;
                })}
            </ol> : <p className="rounded-xl bg-surface-2 p-4 text-sm text-muted-foreground">{canWrite ? 'Нэмэлт слайд алга. «Слайд нэмэх» дарж дэлгэцийн зургаа оруулна уу.' : 'Нэмэлт слайд алга.'}</p>}
            {editing && <SlideEditor key={editing === 'new' ? 'new' : editing.id} part={part} meetingDate={meetingDate} slide={editing === 'new' ? undefined : editing}
                onClose={() => setEditing(null)} onSaved={() => { setEditing(null); void refresh(); }} />}
        </div>
    );
}

function SlideEditor({ part, meetingDate, slide, onClose, onSaved }: { part: WeeklySlidePart; meetingDate: string; slide?: WeeklySlide; onClose: () => void; onSaved: () => void }) {
    const { shop } = useAuth();
    const sections = WEEKLY_SLIDE_PART_SECTIONS[part];
    const [section, setSection] = useState<WeeklySlideSection>(slide?.section ?? sections[0]);
    const [title, setTitle] = useState(slide?.title ?? '');
    const [note, setNote] = useState(slide?.note ?? '');
    const [images, setImages] = useState<DraftImage[]>(() => draftImages(slide?.image_paths ?? []));
    const [uploading, setUploading] = useState(0);
    const addFiles = makeImageUploader(part, images, setImages, setUploading);
    const paths = savedPaths(images);
    const save = useMutation({
        mutationFn: () => slide
            ? dashboardMutate(`/api/dashboard/weekly-slides/${slide.id}`, 'PATCH', { section, title, note, imagePaths: paths }, { shopId: shop?.id })
            : dashboardMutate('/api/dashboard/weekly-slides', 'POST', { meetingDate, part, section, title, note, imagePaths: paths }, { shopId: shop?.id }),
        onSuccess: () => { toast.success('Слайд хадгалагдлаа'); onSaved(); },
    });
    const empty = !title.trim() && !note.trim() && !paths.length;

    return (
        <Dialog open onOpenChange={open => { if (!open && !save.isPending) onClose(); }}>
            <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl"
                onPaste={event => { const files = pastedImages(event); if (files.length) { event.preventDefault(); void addFiles(files); } }}>
                <DialogHeader>
                    <DialogTitle>{slide ? 'Слайд засах' : 'Слайд нэмэх'}</DialogTitle>
                    <DialogDescription>Зураг сонгох, чирж оруулах эсвэл дэлгэцийн зургаа Ctrl+V / ⌘V-ээр шууд буулгана. JPEG/PNG хэвээр, бусдыг JPEG болгоно.</DialogDescription>
                </DialogHeader>
                <form id="weekly-slide-form" onSubmit={event => { event.preventDefault(); if (!empty && !uploading) save.mutate(); }}>
                    <FieldGroup>
                        <FormField label="Сэдэв" htmlFor="slide-section">
                            <Select value={section} onValueChange={value => setSection(value as WeeklySlideSection)}>
                                <SelectTrigger id="slide-section"><SelectValue /></SelectTrigger>
                                <SelectContent>{sections.map(value => <SelectItem key={value} value={value}>{WEEKLY_SLIDE_SECTION_LABEL[value]}</SelectItem>)}</SelectContent>
                            </Select>
                        </FormField>
                        <FormField label="Гарчиг" htmlFor="slide-title" hint={part === 'marketing' ? 'Жишээ: «Пэйж хандалт 09.15–09.22», «CallPro — алдсан дуудлага»' : 'Жишээ: «Дулаан зогсоол, агуулахын өдөрлөг»'}>
                            <Input id="slide-title" value={title} maxLength={WEEKLY_SLIDE_LIMITS.title} onChange={event => setTitle(event.target.value)} />
                        </FormField>
                        <FormField label={`Зураг (${images.length}/${WEEKLY_SLIDE_LIMITS.images})`}>
                            <ReportImagePicker images={images} setImages={setImages} addFiles={addFiles} />
                        </FormField>
                        <FormField label="Тайлбар, дүгнэлт" htmlFor="slide-note" hint="Слайдын доор (урт бол хажууд) харагдана.">
                            <Textarea id="slide-note" rows={4} value={note} maxLength={WEEKLY_SLIDE_LIMITS.note} onChange={event => setNote(event.target.value)}
                                placeholder="Жишээ: Алдсан дуудлага 12:00 болон 15:00–16:00 цагт төвлөрч байна." />
                        </FormField>
                    </FieldGroup>
                </form>
                {save.error && <Alert variant="danger">{save.error.message}</Alert>}
                <DialogFooter>
                    <Button type="button" variant="secondary" disabled={save.isPending} onClick={onClose}>Болих</Button>
                    <Button type="submit" form="weekly-slide-form" isLoading={save.isPending} disabled={empty || uploading > 0}>{uploading ? 'Зураг оруулж байна…' : 'Хадгалах'}</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

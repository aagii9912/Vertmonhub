'use client';

import { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowDown, ArrowUp, ImagePlus, Pencil, Plus, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { dashboardJson, dashboardMutate } from '@/lib/api/dashboardFetch';
import { uploadReportImage } from '@/lib/dashboard/report-media-client';
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
    marketing: 'Постер, контент, Page / Ads / CallPro / SMS-ийн дэлгэцийн зураг, дүгнэлт. Слайд бүр PowerPoint-д тусдаа слайд болно.',
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
            </ol> : <p className="rounded-xl bg-surface-2 p-4 text-sm text-muted-foreground">{canWrite ? 'Нэмэлт слайд алга. «Слайд нэмэх» дарж постер, дэлгэцийн зургаа оруулна уу.' : 'Нэмэлт слайд алга.'}</p>}
            {editing && <SlideEditor key={editing === 'new' ? 'new' : editing.id} part={part} meetingDate={meetingDate} slide={editing === 'new' ? undefined : editing}
                onClose={() => setEditing(null)} onSaved={() => { setEditing(null); void refresh(); }} />}
        </div>
    );
}

type DraftImage = { key: string; path?: string; url?: string; error?: string };

function SlideEditor({ part, meetingDate, slide, onClose, onSaved }: { part: WeeklySlidePart; meetingDate: string; slide?: WeeklySlide; onClose: () => void; onSaved: () => void }) {
    const { shop } = useAuth();
    const sections = WEEKLY_SLIDE_PART_SECTIONS[part];
    const [section, setSection] = useState<WeeklySlideSection>(slide?.section ?? sections[0]);
    const [title, setTitle] = useState(slide?.title ?? '');
    const [note, setNote] = useState(slide?.note ?? '');
    const [images, setImages] = useState<DraftImage[]>(() => (slide?.image_paths ?? []).map(path => ({ key: path, path, url: reportMediaUrl(path) })));
    const [uploading, setUploading] = useState(0);
    const fileInput = useRef<HTMLInputElement>(null);
    const paths = images.flatMap(image => image.path ? [image.path] : []);
    const save = useMutation({
        mutationFn: () => slide
            ? dashboardMutate(`/api/dashboard/weekly-slides/${slide.id}`, 'PATCH', { section, title, note, imagePaths: paths }, { shopId: shop?.id })
            : dashboardMutate('/api/dashboard/weekly-slides', 'POST', { meetingDate, part, section, title, note, imagePaths: paths }, { shopId: shop?.id }),
        onSuccess: () => { toast.success('Слайд хадгалагдлаа'); onSaved(); },
    });

    async function addFiles(files: Blob[]) {
        const room = WEEKLY_SLIDE_LIMITS.images - images.length;
        const accepted = files.filter(file => file.type.startsWith('image/')).slice(0, Math.max(0, room));
        if (files.length > accepted.length) toast.error(`Нэг слайдад ${WEEKLY_SLIDE_LIMITS.images} хүртэл зураг (зөвхөн зураг) оруулна.`);
        for (const file of accepted) {
            const key = crypto.randomUUID();
            setImages(current => [...current, { key }]);
            setUploading(value => value + 1);
            try {
                const uploaded = await uploadReportImage(file, part);
                setImages(current => current.map(image => image.key === key ? { key, ...uploaded } : image));
            } catch (error) {
                setImages(current => current.map(image => image.key === key ? { key, error: error instanceof Error ? error.message : 'Зургийг хадгалж чадсангүй.' } : image));
            } finally {
                setUploading(value => value - 1);
            }
        }
    }

    const move = (index: number, delta: number) => setImages(current => {
        const next = [...current];
        const [item] = next.splice(index, 1);
        next.splice(index + delta, 0, item);
        return next;
    });
    const empty = !title.trim() && !note.trim() && !paths.length;

    return (
        <Dialog open onOpenChange={open => { if (!open && !save.isPending) onClose(); }}>
            <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl"
                onPaste={event => {
                    const files = [...event.clipboardData.items].filter(item => item.kind === 'file').map(item => item.getAsFile()).filter((file): file is File => !!file);
                    if (files.length) { event.preventDefault(); void addFiles(files); }
                }}>
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
                        <FormField label="Гарчиг" htmlFor="slide-title" hint="Жишээ: «Дахин идэвхжүүлсэн контент: Дулаан зогсоолын постер»">
                            <Input id="slide-title" value={title} maxLength={WEEKLY_SLIDE_LIMITS.title} onChange={event => setTitle(event.target.value)} />
                        </FormField>
                        <FormField label={`Зураг (${images.length}/${WEEKLY_SLIDE_LIMITS.images})`}>
                            <div className={cn('rounded-xl border border-dashed border-control p-3', images.length >= WEEKLY_SLIDE_LIMITS.images && 'opacity-70')}
                                onDragOver={event => event.preventDefault()}
                                onDrop={event => { event.preventDefault(); void addFiles([...event.dataTransfer.files]); }}>
                                {images.length > 0 && <ul className="mb-3 grid grid-cols-3 gap-2">
                                    {images.map((image, index) => <li key={image.key} className="relative overflow-hidden rounded-lg border border-border bg-surface-2">
                                        {image.url
                                            // eslint-disable-next-line @next/next/no-img-element
                                            ? <img src={image.url} alt={`Зураг ${index + 1}`} className="aspect-square w-full object-contain" />
                                            : <div className="flex aspect-square items-center justify-center p-2 text-center text-xs text-muted-foreground">{image.error ?? 'Оруулж байна…'}</div>}
                                        <div className="absolute inset-x-0 bottom-0 flex justify-between bg-surface/90 p-0.5">
                                            <span className="flex">
                                                <Button type="button" variant="ghost" size="iconSm" aria-label="Зургийг өмнө нь" disabled={index === 0} onClick={() => move(index, -1)}><ArrowUp className="-rotate-90" /></Button>
                                                <Button type="button" variant="ghost" size="iconSm" aria-label="Зургийг дараа нь" disabled={index === images.length - 1} onClick={() => move(index, 1)}><ArrowDown className="-rotate-90" /></Button>
                                            </span>
                                            <Button type="button" variant="ghost" size="iconSm" aria-label="Зургийг хасах" onClick={() => setImages(current => current.filter(item => item.key !== image.key))}><X /></Button>
                                        </div>
                                    </li>)}
                                </ul>}
                                <input ref={fileInput} type="file" accept="image/*" multiple className="sr-only" tabIndex={-1} aria-hidden
                                    onChange={event => { void addFiles([...(event.target.files ?? [])]); event.target.value = ''; }} />
                                <Button type="button" variant="tertiary" size="sm" disabled={images.length >= WEEKLY_SLIDE_LIMITS.images} onClick={() => fileInput.current?.click()}><ImagePlus />Зураг сонгох</Button>
                                <span className="ml-3 text-xs text-muted-foreground">эсвэл энд чирж оруулах, Ctrl+V</span>
                            </div>
                        </FormField>
                        <FormField label="Тайлбар, дүгнэлт" htmlFor="slide-note" hint="Слайдын доор (урт бол хажууд) харагдана.">
                            <Textarea id="slide-note" rows={4} value={note} maxLength={WEEKLY_SLIDE_LIMITS.note} onChange={event => setNote(event.target.value)}
                                placeholder="Жишээ: Алдсан дуудлага 12:00 болон 15:00–16:00 цагт төвлөрч байна." />
                        </FormField>
                    </FieldGroup>
                </form>
                {save.error && <Alert variant="danger">{save.error.message}</Alert>}
                {images.some(image => image.error) && <p className="text-xs text-status-danger">Алдаатай зургийг хасаад дахин оруулна уу — хадгалахад орохгүй.</p>}
                <DialogFooter>
                    <Button type="button" variant="secondary" disabled={save.isPending} onClick={onClose}>Болих</Button>
                    <Button type="submit" form="weekly-slide-form" isLoading={save.isPending} disabled={empty || uploading > 0}>{uploading ? 'Зураг оруулж байна…' : 'Хадгалах'}</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

'use client';

import { useRef } from 'react';
import { ArrowDown, ArrowUp, ImagePlus, X } from 'lucide-react';
import { toast } from 'sonner';
import { uploadReportImage } from '@/lib/dashboard/report-media-client';
import { reportMediaUrl, type WeeklySlidePart } from '@/lib/dashboard/weekly-slides';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/Button';

export type DraftImage = { key: string; path?: string; url?: string; error?: string };
export const draftImages = (paths: readonly string[]): DraftImage[] => paths.map(path => ({ key: path, path, url: reportMediaUrl(path) }));
export const savedPaths = (images: readonly DraftImage[]) => images.flatMap(image => image.path ? [image.path] : []);

const MAX = 6;

/**
 * Постер, дэлгэцийн зураг сонгох: файл сонгох, чирж оруулах, Ctrl+V (`pasteFiles`-аар эцэг dialog дамжуулна).
 * Зураг бүрийг шууд хувийн `report-media` руу оруулна; хадгалах товч `uploading` дуустал хүлээнэ.
 */
export function makeImageUploader(part: WeeklySlidePart, images: DraftImage[], setImages: (update: (current: DraftImage[]) => DraftImage[]) => void, setUploading: (update: (count: number) => number) => void) {
    return async function addFiles(files: Blob[]) {
        const room = MAX - images.length;
        const accepted = files.filter(file => file.type.startsWith('image/')).slice(0, Math.max(0, room));
        if (files.length > accepted.length) toast.error(`${MAX} хүртэл зураг (зөвхөн зураг) оруулна.`);
        for (const file of accepted) {
            const key = crypto.randomUUID();
            setImages(current => [...current, { key }]);
            setUploading(count => count + 1);
            try {
                const uploaded = await uploadReportImage(file, part);
                setImages(current => current.map(image => image.key === key ? { key, ...uploaded } : image));
            } catch (error) {
                setImages(current => current.map(image => image.key === key ? { key, error: error instanceof Error ? error.message : 'Зургийг хадгалж чадсангүй.' } : image));
            } finally {
                setUploading(count => count - 1);
            }
        }
    };
}

export function ReportImagePicker({ images, setImages, addFiles }: {
    images: DraftImage[]; setImages: (update: (current: DraftImage[]) => DraftImage[]) => void; addFiles: (files: Blob[]) => Promise<void>;
}) {
    const fileInput = useRef<HTMLInputElement>(null);
    const move = (index: number, delta: number) => setImages(current => {
        const next = [...current];
        const [item] = next.splice(index, 1);
        next.splice(index + delta, 0, item);
        return next;
    });
    return <>
        <div className={cn('rounded-xl border border-dashed border-control p-3', images.length >= MAX && 'opacity-70')}
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
            <Button type="button" variant="tertiary" size="sm" disabled={images.length >= MAX} onClick={() => fileInput.current?.click()}><ImagePlus />Зураг сонгох</Button>
            <span className="ml-3 text-xs text-muted-foreground">эсвэл энд чирж оруулах, Ctrl+V</span>
        </div>
        {images.some(image => image.error) && <p className="text-xs text-status-danger">Алдаатай зургийг хасаад дахин оруулна уу — хадгалахад орохгүй.</p>}
    </>;
}

/** Dialog-ийн onPaste: санах ойн зургийг файлын жагсаалт болгоно. */
export function pastedImages(event: React.ClipboardEvent): File[] {
    return [...event.clipboardData.items].filter(item => item.kind === 'file').map(item => item.getAsFile()).filter((file): file is File => !!file);
}

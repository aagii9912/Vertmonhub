'use client';

import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { dashboardMutate } from '@/lib/api/dashboardFetch';
import {
    CONTENT_PLATFORM_LABEL, CONTENT_PLATFORMS, CONTENT_STATUS_LABEL, CONTENT_STATUSES, CONTENT_TYPE_LABEL, CONTENT_TYPES,
    type ContentItem, type ContentPlatform, type ContentStatus, type ContentType,
} from '@/lib/marketing/content-plan';
import { Button } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Alert';
import { Input } from '@/components/ui/Input';
import { Textarea } from '@/components/ui/Textarea';
import { FormField, FieldGroup } from '@/components/ui/FormField';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/Select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/Dialog';
import { draftImages, makeImageUploader, pastedImages, ReportImagePicker, savedPaths, type DraftImage } from '@/components/weekly/ReportImagePicker';

const NONE = '__none';

/**
 * Маркетингийн контент төлөвлөгөөний нэг контент: үүсгэх, төлөв (төлөвлөсөн → нийтэлсэн), огноо,
 * хариуцагч, постер/reel-ийн зураг. Контент календарь болон Лхагвагийн хурлын хуудас ашиглана.
 */
export function ContentItemDialog({ item, defaultDate, canWrite, canDelete, onClose, onSaved }: {
    item?: ContentItem; defaultDate: string; canWrite: boolean; canDelete: boolean; onClose: () => void; onSaved: () => void;
}) {
    const { shop, user } = useAuth();
    const [title, setTitle] = useState(item?.title ?? '');
    const [type, setType] = useState<ContentType>(item?.type ?? 'post');
    const [platform, setPlatform] = useState<string>(item?.platform && (CONTENT_PLATFORMS as readonly string[]).includes(item.platform) ? item.platform : item?.platform ? NONE : 'facebook');
    const [scheduledDate, setScheduledDate] = useState(item?.scheduled_date ?? defaultDate);
    const [status, setStatus] = useState<ContentStatus>(item?.status ?? 'planned');
    const [assignedTo, setAssignedTo] = useState(item?.assigned_to ?? '');
    const [description, setDescription] = useState(item?.description ?? '');
    const [images, setImages] = useState<DraftImage[]>(() => draftImages(item?.image_paths ?? []));
    const [uploading, setUploading] = useState(0);
    const addFiles = makeImageUploader('marketing', images, setImages, setUploading);
    const paths = savedPaths(images);
    const body = {
        title, type, scheduledDate, status, assignedTo, description, imagePaths: paths,
        // Хуучин мөрийн чөлөөт платформыг өөрчлөөгүй бол хэвээр үлдээнэ.
        ...(platform === NONE ? {} : { platform: platform as ContentPlatform }),
    };
    const save = useMutation({
        mutationFn: () => item
            ? dashboardMutate(`/api/marketing/content-plan/${item.id}`, 'PATCH', body, { shopId: shop?.id })
            : dashboardMutate('/api/marketing/content-plan', 'POST', body, { shopId: shop?.id }),
        onSuccess: () => { toast.success('Контент хадгалагдлаа'); onSaved(); },
    });
    const remove = useMutation({
        mutationFn: () => dashboardMutate(`/api/marketing/content-plan/${item!.id}`, 'DELETE', undefined, { shopId: shop?.id }),
        onSuccess: () => { toast.success('Контент устгагдлаа'); onSaved(); },
    });
    const busy = save.isPending || remove.isPending;
    const mayDelete = !!item && canWrite && (item.created_by === user?.id || canDelete);

    return (
        <Dialog open onOpenChange={open => { if (!open && !busy) onClose(); }}>
            <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl"
                onPaste={event => { if (!canWrite) return; const files = pastedImages(event); if (files.length) { event.preventDefault(); void addFiles(files); } }}>
                <DialogHeader>
                    <DialogTitle>{item ? 'Контент' : 'Шинэ контент'}</DialogTitle>
                    <DialogDescription>Маркетингийн контент төлөвлөгөө. Нийтэлсэн контент постер/reel-ийн зурагтайгаа Лхагвагийн маркетингийн слайдад орно.</DialogDescription>
                </DialogHeader>
                <form id="content-item-form" onSubmit={event => { event.preventDefault(); if (title.trim() && !uploading) save.mutate(); }}>
                    <fieldset disabled={!canWrite || busy} className="disabled:opacity-80">
                        <FieldGroup>
                            <FormField label="Гарчиг" htmlFor="content-title" required>
                                <Input id="content-title" value={title} maxLength={255} placeholder="Контентын гарчиг" onChange={event => setTitle(event.target.value)} />
                            </FormField>
                            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                                <FormField label="Төрөл" htmlFor="content-type">
                                    <Select value={type} onValueChange={value => setType(value as ContentType)} disabled={!canWrite}>
                                        <SelectTrigger id="content-type"><SelectValue /></SelectTrigger>
                                        <SelectContent>{CONTENT_TYPES.map(value => <SelectItem key={value} value={value}>{CONTENT_TYPE_LABEL[value]}</SelectItem>)}</SelectContent>
                                    </Select>
                                </FormField>
                                <FormField label="Платформ" htmlFor="content-platform">
                                    <Select value={platform} onValueChange={setPlatform} disabled={!canWrite}>
                                        <SelectTrigger id="content-platform"><SelectValue /></SelectTrigger>
                                        <SelectContent>
                                            {platform === NONE && <SelectItem value={NONE}>{item?.platform}</SelectItem>}
                                            {CONTENT_PLATFORMS.map(value => <SelectItem key={value} value={value}>{CONTENT_PLATFORM_LABEL[value]}</SelectItem>)}
                                        </SelectContent>
                                    </Select>
                                </FormField>
                                <FormField label="Огноо" htmlFor="content-date">
                                    <Input id="content-date" type="date" value={scheduledDate} onChange={event => setScheduledDate(event.target.value)} />
                                </FormField>
                                <FormField label="Төлөв" htmlFor="content-status">
                                    <Select value={status} onValueChange={value => setStatus(value as ContentStatus)} disabled={!canWrite}>
                                        <SelectTrigger id="content-status"><SelectValue /></SelectTrigger>
                                        <SelectContent>{CONTENT_STATUSES.map(value => <SelectItem key={value} value={value}>{CONTENT_STATUS_LABEL[value]}</SelectItem>)}</SelectContent>
                                    </Select>
                                </FormField>
                            </div>
                            <FormField label="Хариуцагч" htmlFor="content-owner">
                                <Input id="content-owner" value={assignedTo} maxLength={120} placeholder="Жишээ: Анужин" onChange={event => setAssignedTo(event.target.value)} />
                            </FormField>
                            <FormField label={`Постер, reel-ийн зураг (${images.length}/6)`}>
                                {canWrite ? <ReportImagePicker images={images} setImages={setImages} addFiles={addFiles} />
                                    : images.length ? <div className="grid grid-cols-3 gap-2">{images.map((image, index) => (
                                        // eslint-disable-next-line @next/next/no-img-element
                                        <img key={image.key} src={image.url} alt={`Зураг ${index + 1}`} className="aspect-square w-full rounded-lg border border-border bg-surface-2 object-contain" />
                                    ))}</div> : <p className="text-sm text-muted-foreground">Зураг алга.</p>}
                            </FormField>
                            <FormField label="Тайлбар" htmlFor="content-description" hint="Санаа, текст, үр дүнгийн тэмдэглэл. Слайдад зургийн доор гарна.">
                                <Textarea id="content-description" rows={3} value={description} maxLength={2000} onChange={event => setDescription(event.target.value)} />
                            </FormField>
                        </FieldGroup>
                    </fieldset>
                </form>
                {(save.error || remove.error) && <Alert variant="danger">{(save.error || remove.error)?.message}</Alert>}
                <DialogFooter className="sm:justify-between">
                    {mayDelete ? <Button type="button" variant="ghost" disabled={busy} onClick={() => { if (window.confirm('Энэ контентыг зурагтай нь устгах уу? Хийгээгүй бол «Цуцалсан» төлөв тавьж болно.')) remove.mutate(); }}><Trash2 />Устгах</Button> : <span />}
                    <div className="flex gap-2">
                        <Button type="button" variant="secondary" disabled={busy} onClick={onClose}>{canWrite ? 'Болих' : 'Хаах'}</Button>
                        {canWrite && <Button type="submit" form="content-item-form" isLoading={save.isPending} disabled={!title.trim() || uploading > 0 || remove.isPending}>{uploading ? 'Зураг оруулж байна…' : item ? 'Хадгалах' : 'Үүсгэх'}</Button>}
                    </div>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

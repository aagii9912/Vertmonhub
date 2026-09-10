'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowUp, Paperclip, X, FileText, ImageIcon, Loader2, AlertCircle, Square } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getActiveShopId } from '@/lib/api/dashboardFetch';

export interface AiAttachment {
    id: string;
    name: string;
    mimeType: string;
    url?: string;
    uploading: boolean;
    error?: boolean;
}

interface Props {
    busy?: boolean;
    onSend: (text: string, attachments: AiAttachment[]) => void;
    onStop?: () => void;
    /** Гаднаас оруулах текст (санал дарахад) */
    prefill?: string | null;
    onPrefillConsumed?: () => void;
    placeholder?: string;
    autoFocus?: boolean;
    compact?: boolean;
}

const MAX_SIZE = 10 * 1024 * 1024;

/** v2 composer: нэг хүрээ, хавсралт чип, Enter илгээнэ, Shift+Enter мөр. */
export function AiComposer({ busy, onSend, onStop, prefill, onPrefillConsumed, placeholder, autoFocus, compact }: Props) {
    const [input, setInput] = useState('');
    const [attachments, setAttachments] = useState<AiAttachment[]>([]);
    const [dragOver, setDragOver] = useState(false);
    const fileRef = useRef<HTMLInputElement>(null);
    const taRef = useRef<HTMLTextAreaElement>(null);

    useEffect(() => {
        if (prefill) {
            setInput(prefill);
            onPrefillConsumed?.();
            requestAnimationFrame(() => { taRef.current?.focus(); const el = taRef.current; if (el) { el.style.height = 'auto'; el.style.height = Math.min(el.scrollHeight, 160) + 'px'; el.setSelectionRange(el.value.length, el.value.length); } });
        }
    }, [prefill, onPrefillConsumed]);

    useEffect(() => { if (autoFocus) taRef.current?.focus(); }, [autoFocus]);

    const uploadOne = useCallback(async (file: File) => {
        const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        setAttachments((p) => [...p, { id, name: file.name, mimeType: file.type || 'application/octet-stream', uploading: true }]);
        if (file.size > MAX_SIZE) {
            setAttachments((p) => p.map((a) => (a.id === id ? { ...a, uploading: false, error: true, name: `${file.name} (10MB-с том)` } : a)));
            return;
        }
        try {
            const fd = new FormData();
            fd.append('file', file);
            const res = await fetch('/api/dashboard/upload', { method: 'POST', headers: { 'x-shop-id': getActiveShopId() || '' }, body: fd });
            if (!res.ok) throw new Error('upload failed');
            const data = await res.json();
            setAttachments((p) => p.map((a) => (a.id === id ? { ...a, uploading: false, url: data.url } : a)));
        } catch {
            setAttachments((p) => p.map((a) => (a.id === id ? { ...a, uploading: false, error: true } : a)));
        }
    }, []);

    const handleFiles = (files: FileList | null) => { if (files) Array.from(files).slice(0, 5).forEach(uploadOne); };
    const canSend = (input.trim() || attachments.some((a) => a.url)) && !attachments.some((a) => a.uploading) && !busy;

    const submit = () => {
        if (!canSend) return;
        onSend(input.trim(), attachments.filter((a) => a.url && !a.error));
        setInput('');
        setAttachments([]);
        if (taRef.current) taRef.current.style.height = 'auto';
    };

    return (
        <div
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => { e.preventDefault(); setDragOver(false); handleFiles(e.dataTransfer.files); }}
            className={cn('rounded-md border bg-surface transition-shadow', dragOver ? 'border-brand shadow-[0_0_0_3px_var(--brand-soft)]' : 'border-border-strong focus-within:border-brand focus-within:shadow-[0_0_0_3px_var(--brand-soft)]')}
        >
            {attachments.length > 0 && (
                <div className="flex flex-wrap gap-1.5 px-2.5 pt-2">
                    {attachments.map((a) => (
                        <span key={a.id} className="inline-flex max-w-[200px] items-center gap-1.5 rounded-md border border-border bg-surface-2 py-0.5 pl-1.5 pr-1 text-[11.5px]">
                            {a.uploading ? <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" /> : a.error ? <AlertCircle className="h-3 w-3 text-status-danger" /> : a.mimeType.startsWith('image/') ? <ImageIcon className="h-3 w-3 text-brand" /> : <FileText className="h-3 w-3 text-brand" />}
                            <span className="truncate text-foreground">{a.name}</span>
                            <button type="button" onClick={() => setAttachments((p) => p.filter((x) => x.id !== a.id))} className="rounded p-0.5 text-muted-foreground hover:bg-surface-3" aria-label="Хасах"><X className="h-3 w-3" /></button>
                        </span>
                    ))}
                </div>
            )}
            <div className="flex items-end gap-1 p-1.5">
                <button type="button" onClick={() => fileRef.current?.click()} disabled={busy} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-surface-2 hover:text-foreground disabled:opacity-50" aria-label="Файл хавсаргах" title="Зураг / PDF хавсаргах">
                    <Paperclip className="h-4 w-4" />
                </button>
                <input ref={fileRef} type="file" multiple hidden accept="image/*,application/pdf" onChange={(e) => { handleFiles(e.target.files); e.target.value = ''; }} />
                <textarea
                    ref={taRef}
                    value={input}
                    onChange={(e) => { setInput(e.target.value); const el = e.target; el.style.height = 'auto'; el.style.height = Math.min(el.scrollHeight, compact ? 120 : 160) + 'px'; }}
                    onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); } }}
                    rows={1}
                    placeholder={placeholder || 'Асуух эсвэл даалгавар өгөх… (Enter — илгээх)'}
                    disabled={busy && !onStop}
                    className="max-h-40 min-h-[32px] flex-1 resize-none bg-transparent px-1.5 py-1.5 text-[13px] text-foreground outline-none placeholder:text-muted-foreground"
                />
                {busy && onStop ? (
                    <button type="button" onClick={onStop} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-surface-2 text-foreground hover:bg-surface-3" aria-label="Зогсоох" title="Зогсоох"><Square className="h-3.5 w-3.5" /></button>
                ) : (
                    <button type="button" onClick={submit} disabled={!canSend} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-brand text-brand-fg hover:bg-brand-strong disabled:opacity-40" aria-label="Илгээх"><ArrowUp className="h-4 w-4" strokeWidth={2.25} /></button>
                )}
            </div>
        </div>
    );
}

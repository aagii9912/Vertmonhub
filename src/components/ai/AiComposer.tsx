'use client';

import React, { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { ArrowUp, Paperclip, X, FileText, ImageIcon, Loader2, AlertCircle, Square, Mic, MicOff } from 'lucide-react';
import { cn } from '@/lib/utils';
import { dashboardFetch } from '@/lib/api/dashboardFetch';

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

// Vercel serverless body хязгаар 4.5MB тул серверийн /api/dashboard/upload-тай адил 4MB.
const MAX_SIZE = 4 * 1024 * 1024;

/** v2 composer: нэг хүрээ, хавсралт чип, Enter илгээнэ, Shift+Enter мөр. */
export function AiComposer({ busy, onSend, onStop, prefill, onPrefillConsumed, placeholder, autoFocus, compact }: Props) {
    const [input, setInput] = useState('');
    const [attachments, setAttachments] = useState<AiAttachment[]>([]);
    const [dragOver, setDragOver] = useState(false);
    const fileRef = useRef<HTMLInputElement>(null);
    const taRef = useRef<HTMLTextAreaElement>(null);
    const { supported: voiceSupported, listening, toggle: toggleVoice } = useVoiceInput((text) => {
        setInput((prev) => (prev ? `${prev} ${text}` : text));
        requestAnimationFrame(() => { const el = taRef.current; if (el) { el.style.height = 'auto'; el.style.height = Math.min(el.scrollHeight, 160) + 'px'; } });
    });

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
            setAttachments((p) => p.map((a) => (a.id === id ? { ...a, uploading: false, error: true, name: `${file.name} (4MB-с том)` } : a)));
            return;
        }
        try {
            const fd = new FormData();
            fd.append('file', file);
            const res = await dashboardFetch('/api/dashboard/upload', { method: 'POST', body: fd });
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
            className={cn('ai-composer rounded-[24px] border bg-surface p-2 shadow-xs transition-shadow', dragOver ? 'border-brand shadow-[0_0_0_3px_var(--brand-soft)]' : 'border-border-strong focus-within:border-muted')}
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
            <textarea
                ref={taRef}
                value={input}
                aria-label="AI туслахад бичих"
                onChange={(e) => { setInput(e.target.value); const el = e.target; el.style.height = 'auto'; el.style.height = Math.min(el.scrollHeight, compact ? 120 : 160) + 'px'; }}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); submit(); } }}
                rows={compact ? 1 : 2}
                placeholder={listening ? 'Сонсож байна… ярина уу' : (placeholder || 'Асуух эсвэл ажил даалгах…')}
                disabled={busy && !onStop}
                className="max-h-40 min-h-11 w-full resize-none bg-transparent px-3 py-2 text-[14px] leading-relaxed text-foreground outline-none placeholder:text-muted-foreground"
            />
            <div className="flex items-center gap-1">
                <button type="button" onClick={() => fileRef.current?.click()} disabled={busy} className="flex size-10 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-surface-2 hover:text-foreground disabled:opacity-50 focus-ring" aria-label="Файл хавсаргах" title="Зураг / PDF хавсаргах">
                    <Paperclip className="h-4 w-4" />
                </button>
                <input ref={fileRef} type="file" multiple hidden accept="image/*,application/pdf,.xlsx,.csv,.tsv" onChange={(e) => { handleFiles(e.target.files); e.target.value = ''; }} />
                {voiceSupported && (
                    <button type="button" onClick={toggleVoice} disabled={busy} className={cn('flex size-10 shrink-0 items-center justify-center rounded-full hover:bg-surface-2 disabled:opacity-50 focus-ring', listening ? 'text-status-danger animate-pulse' : 'text-muted-foreground hover:text-foreground')} aria-label={listening ? 'Ярихаа зогсоох' : 'Ярьж оруулах'} title={listening ? 'Сонсож байна… дарж зогсооно' : 'Дуу хоолойгоор оруулах (монгол)'}>
                        {listening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
                    </button>
                )}
                <span className="ml-1 flex-1 text-xs text-muted-foreground">Vertmon AI</span>
                {busy && onStop ? (
                    <button type="button" onClick={onStop} className="flex size-10 shrink-0 items-center justify-center rounded-full bg-foreground text-background hover:opacity-80 focus-ring" aria-label="Зогсоох" title="Зогсоох"><Square className="h-3.5 w-3.5" /></button>
                ) : (
                    <button type="button" onClick={submit} disabled={!canSend} className="flex size-10 shrink-0 items-center justify-center rounded-full bg-foreground text-background hover:opacity-80 disabled:opacity-30 focus-ring" aria-label="Илгээх"><ArrowUp className="h-4 w-4" strokeWidth={2.25} /></button>
                )}
            </div>
        </div>
    );
}

/* ------------------------------------------------------------------ */
/* Дуу хоолойн оролт — Web Speech API (Chrome/Safari/Edge), mn-MN         */
/* ------------------------------------------------------------------ */

type SpeechRecognitionLike = {
    lang: string; interimResults: boolean; continuous: boolean;
    onresult: ((e: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null;
    onend: (() => void) | null; onerror: (() => void) | null;
    start: () => void; stop: () => void;
};

function getRecognition(): (new () => SpeechRecognitionLike) | null {
    if (typeof window === 'undefined') return null;
    const w = window as unknown as { SpeechRecognition?: new () => SpeechRecognitionLike; webkitSpeechRecognition?: new () => SpeechRecognitionLike };
    return w.SpeechRecognition || w.webkitSpeechRecognition || null;
}

/**
 * «Болдтой ярилаа, маргааш 3 цагт дахин залгана» гэж хэлэхэд composer-т текст болж орно.
 * Эцсийн (isFinal) хэсгийг л onText руу өгнө; утсанд ч ажиллана (Chrome/Safari).
 */
function useVoiceInput(onText: (text: string) => void) {
    const [listening, setListening] = useState(false);
    const recRef = useRef<SpeechRecognitionLike | null>(null);
    const cbRef = useRef(onText);
    useEffect(() => { cbRef.current = onText; }, [onText]);
    // SSR-д false, client hydration дууссаны дараа шалгана (hydration зөрүүгээс сэргийлнэ)
    const supported = useSyncExternalStore(() => () => {}, () => !!getRecognition(), () => false);

    const stop = useCallback(() => { try { recRef.current?.stop(); } catch { /* noop */ } recRef.current = null; setListening(false); }, []);

    const toggle = useCallback(() => {
        if (listening) { stop(); return; }
        const Ctor = getRecognition();
        if (!Ctor) return;
        const rec = new Ctor();
        rec.lang = 'mn-MN';
        rec.interimResults = true;
        rec.continuous = true;
        rec.onresult = (e) => {
            let finalText = '';
            for (let i = e.resultIndex; i < e.results.length; i++) if (e.results[i].isFinal) finalText += e.results[i][0].transcript;
            if (finalText.trim()) cbRef.current(finalText.trim());
        };
        rec.onend = () => { recRef.current = null; setListening(false); };
        rec.onerror = () => { recRef.current = null; setListening(false); };
        try { rec.start(); recRef.current = rec; setListening(true); } catch { setListening(false); }
    }, [listening, stop]);

    useEffect(() => () => { try { recRef.current?.stop(); } catch { /* noop */ } }, []);
    return { supported, listening, toggle };
}

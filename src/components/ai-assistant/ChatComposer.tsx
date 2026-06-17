'use client';

/**
 * AI Orchestrator-ийн оролтын хэсэг: текст + файл/зураг хавсаргах (upload),
 * чирч буулгах (drag & drop), хавсралтын чипүүд, илгээх товч, санал болгох пилл.
 */

import React, { useRef, useState, useCallback } from 'react';
import { Send, Paperclip, X, FileText, ImageIcon, Loader2, AlertCircle } from 'lucide-react';

export interface ChatAttachment {
    id: string;
    name: string;
    mimeType: string;
    url?: string;
    uploading: boolean;
    error?: boolean;
}

interface Props {
    disabled?: boolean;
    shopId?: string;
    onSend: (text: string, attachments: ChatAttachment[]) => void;
    showSuggestions?: boolean;
    suggestions?: { label: string; prompt: string }[];
}

const MAX_SIZE = 10 * 1024 * 1024; // 10MB

export function ChatComposer({ disabled, shopId, onSend, showSuggestions, suggestions = [] }: Props) {
    const [input, setInput] = useState('');
    const [attachments, setAttachments] = useState<ChatAttachment[]>([]);
    const [dragOver, setDragOver] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    const uploadOne = useCallback(async (file: File) => {
        const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        const base: ChatAttachment = { id, name: file.name, mimeType: file.type || 'application/octet-stream', uploading: true };
        setAttachments(prev => [...prev, base]);

        if (file.size > MAX_SIZE) {
            setAttachments(prev => prev.map(a => a.id === id ? { ...a, uploading: false, error: true, name: `${file.name} (хэт том)` } : a));
            return;
        }
        try {
            const fd = new FormData();
            fd.append('file', file);
            const res = await fetch('/api/dashboard/upload', {
                method: 'POST',
                headers: { 'x-shop-id': (typeof window !== 'undefined' && localStorage.getItem('vertmonhub_active_shop_id')) || shopId || '' },
                body: fd,
            });
            if (!res.ok) throw new Error('upload failed');
            const data = await res.json();
            setAttachments(prev => prev.map(a => a.id === id ? { ...a, uploading: false, url: data.url } : a));
        } catch {
            setAttachments(prev => prev.map(a => a.id === id ? { ...a, uploading: false, error: true } : a));
        }
    }, [shopId]);

    const handleFiles = useCallback((files: FileList | null) => {
        if (!files) return;
        Array.from(files).slice(0, 5).forEach(uploadOne);
    }, [uploadOne]);

    const removeAttachment = (id: string) => setAttachments(prev => prev.filter(a => a.id !== id));

    const canSend = (input.trim() || attachments.some(a => a.url)) && !attachments.some(a => a.uploading) && !disabled;

    const submit = () => {
        if (!canSend) return;
        onSend(input, attachments.filter(a => a.url && !a.error));
        setInput('');
        setAttachments([]);
        if (textareaRef.current) textareaRef.current.style.height = 'auto';
    };

    const onKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); }
    };

    const autoGrow = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        setInput(e.target.value);
        const el = e.target;
        el.style.height = 'auto';
        el.style.height = Math.min(el.scrollHeight, 160) + 'px';
    };

    return (
        <div className="px-4 md:px-6 py-4 bg-surface border-t border-border/60">
            <div className="max-w-4xl mx-auto">
                {showSuggestions && suggestions.length > 0 && attachments.length === 0 && !input && (
                    <div className="mb-2 flex gap-2 overflow-x-auto pb-1 hide-scrollbar">
                        {suggestions.map(s => (
                            <button key={s.label} type="button" onClick={() => onSend(s.prompt, [])} disabled={disabled}
                                className="whitespace-nowrap px-3 py-1.5 text-xs rounded-full border bg-surface-2/60 hover:bg-brand-soft hover:text-brand-strong hover:border-brand/30 text-muted-foreground border-border/60 transition-colors disabled:opacity-50">
                                {s.label}
                            </button>
                        ))}
                    </div>
                )}

                <div
                    onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                    onDragLeave={() => setDragOver(false)}
                    onDrop={(e) => { e.preventDefault(); setDragOver(false); handleFiles(e.dataTransfer.files); }}
                    className={`rounded-2xl border bg-surface-2/40 transition-all ${dragOver ? 'border-brand ring-2 ring-brand/20 bg-brand-soft/30' : 'border-border'}`}
                >
                    {/* Attachment chips */}
                    {attachments.length > 0 && (
                        <div className="flex flex-wrap gap-2 px-3 pt-3">
                            {attachments.map(a => {
                                const isImg = a.mimeType.startsWith('image/');
                                return (
                                    <div key={a.id} className="flex items-center gap-2 pl-2 pr-1 py-1 rounded-lg bg-surface border border-border/60 text-xs max-w-[200px]">
                                        {a.uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground shrink-0" />
                                            : a.error ? <AlertCircle className="w-3.5 h-3.5 text-status-danger shrink-0" />
                                            : isImg ? <ImageIcon className="w-3.5 h-3.5 text-brand-strong shrink-0" />
                                            : <FileText className="w-3.5 h-3.5 text-brand-strong shrink-0" />}
                                        <span className="truncate text-foreground">{a.name}</span>
                                        <button onClick={() => removeAttachment(a.id)} className="p-0.5 rounded hover:bg-surface-2 text-muted-foreground shrink-0">
                                            <X className="w-3.5 h-3.5" />
                                        </button>
                                    </div>
                                );
                            })}
                        </div>
                    )}

                    <div className="flex items-end gap-2 p-2">
                        <button type="button" onClick={() => fileInputRef.current?.click()} disabled={disabled}
                            title="Файл хавсаргах"
                            className="p-2.5 rounded-xl text-muted-foreground hover:text-brand-strong hover:bg-surface-2 transition-colors disabled:opacity-50">
                            <Paperclip className="w-5 h-5" />
                        </button>
                        <input ref={fileInputRef} type="file" multiple hidden
                            accept="image/*,application/pdf"
                            onChange={(e) => { handleFiles(e.target.files); e.target.value = ''; }} />

                        <textarea
                            ref={textareaRef}
                            value={input}
                            onChange={autoGrow}
                            onKeyDown={onKeyDown}
                            rows={1}
                            placeholder="Асуултаа бичнэ үү — orchestrator зөв agent рүү замчилна..."
                            disabled={disabled}
                            className="flex-1 resize-none bg-transparent py-2 px-1 text-[15px] focus:outline-none placeholder:text-muted-foreground/70 max-h-40"
                        />

                        <button type="button" onClick={submit} disabled={!canSend}
                            className="p-2.5 rounded-xl bg-gradient-to-br from-brand to-brand-strong text-white shadow-sm hover:opacity-90 transition-all disabled:opacity-40 disabled:cursor-not-allowed">
                            <Send className="w-5 h-5" />
                        </button>
                    </div>
                </div>
                <p className="mt-1.5 text-[11px] text-muted-foreground/60 text-center">
                    Enter — илгээх · Shift+Enter — мөр таслах · 📎 зураг/PDF хавсаргах
                </p>
            </div>
        </div>
    );
}

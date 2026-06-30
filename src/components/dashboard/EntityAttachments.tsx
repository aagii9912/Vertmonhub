'use client';

/**
 * Байр/лийд/харилцагч/гэрээний дэлгэрэнгүй хуудсанд AI-аар хавсаргасан
 * файлуудыг (зураг thumbnail / файл чип) харуулах панель.
 */

import React, { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Paperclip, FileText, Loader2 } from 'lucide-react';

interface Attachment {
    id: string;
    url: string;
    file_name: string | null;
    mime_type: string | null;
    uploaded_by: string | null;
    created_at: string;
}

interface Props {
    entityType: 'property' | 'lead' | 'customer' | 'contract';
    entityId: string;
}

export function EntityAttachments({ entityType, entityId }: Props) {
    const { shop } = useAuth();
    const [items, setItems] = useState<Attachment[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!shop?.id || !entityId) return;
        let active = true;
        (async () => {
            setLoading(true);
            try {
                const res = await fetch(`/api/dashboard/ai-attachments?entity_type=${entityType}&entity_id=${entityId}`, {
                    headers: { 'x-shop-id': shop.id },
                });
                const data = await res.json();
                if (active) setItems(data.attachments || []);
            } catch {
                if (active) setItems([]);
            } finally {
                if (active) setLoading(false);
            }
        })();
        return () => { active = false; };
    }, [shop?.id, entityType, entityId]);

    if (loading) {
        return (
            <div className="flex items-center gap-2 text-sm text-muted-foreground py-3">
                <Loader2 className="w-4 h-4 animate-spin" /> Хавсралт ачаалж байна...
            </div>
        );
    }
    if (items.length === 0) return null;

    return (
        <div className="bg-surface rounded-xl border border-border/60 p-4">
            <h3 className="text-sm font-semibold text-foreground flex items-center gap-2 mb-3">
                <Paperclip className="w-4 h-4 text-brand-strong" /> Хавсаргасан файл ({items.length})
            </h3>
            <div className="flex flex-wrap gap-2">
                {items.map((a) => {
                    const isImg = (a.mime_type || '').startsWith('image/');
                    return isImg ? (
                         
                        <a key={a.id} href={a.url} target="_blank" rel="noreferrer" title={a.file_name || ''}>
                            <img src={a.url} alt={a.file_name || ''} className="h-24 w-24 object-cover rounded-lg border border-border/60 hover:opacity-90 transition" />
                        </a>
                    ) : (
                        <a key={a.id} href={a.url} target="_blank" rel="noreferrer"
                            className="flex items-center gap-2 px-3 py-2 rounded-lg bg-surface-2 border border-border/60 text-xs text-foreground hover:border-brand/40 transition max-w-[220px]">
                            <FileText className="w-4 h-4 text-brand-strong shrink-0" />
                            <span className="truncate">{a.file_name || 'Файл'}</span>
                        </a>
                    );
                })}
            </div>
        </div>
    );
}

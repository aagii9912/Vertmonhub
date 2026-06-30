'use client';

/** Мессеж доторх хавсралтуудыг харуулна: зургийг thumbnail, бусдыг файл чип. */

import React from 'react';
import { FileText } from 'lucide-react';

interface Att { url: string; name: string; mimeType: string }

export function MessageAttachments({ attachments }: { attachments: Att[] }) {
    if (!attachments?.length) return null;
    return (
        <div className="flex flex-wrap gap-2">
            {attachments.map((a, i) => {
                const isImg = (a.mimeType || '').startsWith('image/');
                if (isImg) {
                    return (
                         
                        <a key={i} href={a.url} target="_blank" rel="noreferrer" className="block">
                            <img src={a.url} alt={a.name} className="h-28 w-28 object-cover rounded-xl border border-border/60 shadow-sm hover:opacity-90 transition" />
                        </a>
                    );
                }
                return (
                    <a key={i} href={a.url} target="_blank" rel="noreferrer"
                        className="flex items-center gap-2 px-3 py-2 rounded-xl bg-surface border border-border/60 text-xs text-foreground hover:border-brand/40 transition max-w-[220px]">
                        <FileText className="w-4 h-4 text-brand-strong shrink-0" />
                        <span className="truncate">{a.name}</span>
                    </a>
                );
            })}
        </div>
    );
}

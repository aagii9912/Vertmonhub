'use client';

/** Assistant мессежийн доорх жижиг үйлдлүүд: хуулах, дахин үүсгэх. */

import React, { useState } from 'react';
import { Copy, Check, RefreshCw } from 'lucide-react';

interface Props {
    content: string;
    onRegenerate: () => void;
    disabled?: boolean;
}

export function MessageActions({ content, onRegenerate, disabled }: Props) {
    const [copied, setCopied] = useState(false);

    const copy = async () => {
        try {
            await navigator.clipboard.writeText(content);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
        } catch { /* clipboard unavailable */ }
    };

    return (
        <div className="flex items-center gap-1 mt-1.5 opacity-60 hover:opacity-100 transition-opacity">
            <button onClick={copy} title="Хуулах"
                className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] text-muted-foreground hover:text-foreground hover:bg-surface-2 transition-colors">
                {copied ? <Check className="w-3.5 h-3.5 text-status-success" /> : <Copy className="w-3.5 h-3.5" />}
                {copied ? 'Хуулсан' : 'Хуулах'}
            </button>
            <button onClick={onRegenerate} disabled={disabled} title="Дахин үүсгэх"
                className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] text-muted-foreground hover:text-foreground hover:bg-surface-2 transition-colors disabled:opacity-40">
                <RefreshCw className="w-3.5 h-3.5" />
                Дахин
            </button>
        </div>
    );
}

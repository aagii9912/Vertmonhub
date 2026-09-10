'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { Sparkles, X, Maximize2, RotateCcw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { canAccessModuleDynamic } from '@/lib/rbac';
import { onAiPanel, useAiContext, contextLabel } from '@/lib/ai/context';
import { AiChat } from './AiChat';

/**
 * AI туслах — хажуугийн панел, бүх хуудсанд (мокап: hero биш, панел).
 * Sidebar «AI туслах», ⌘J, гар утасны «Бусад» → нээнэ. Хаахад яриа алдагдахгүй
 * (панел mounted хэвээр, зөвхөн нуугдана). Утсанд бүтэн дэлгэц.
 */
export function AiPanel() {
    const { user } = useAuth();
    const allowed = !!user?.permissions && canAccessModuleDynamic(user.permissions, 'ai-assistant');
    const [open, setOpen] = useState(false);
    const [prompt, setPrompt] = useState<string | null>(null);
    const [session, setSession] = useState(0); // «Шинэ яриа» → AiChat дахин mount
    const ctx = useAiContext();

    useEffect(() => {
        const off = onAiPanel((cmd) => {
            if (cmd.action === 'open') { setOpen(true); if (cmd.prompt) setPrompt(cmd.prompt); }
            else if (cmd.action === 'close') setOpen(false);
            else setOpen((o) => !o);
        });
        const onKey = (e: KeyboardEvent) => {
            if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'j') { e.preventDefault(); setOpen((o) => !o); }
            if (e.key === 'Escape' && open) {
                const el = document.activeElement as HTMLElement | null;
                if (el && el.closest('[data-ai-panel]')) { setOpen(false); }
            }
        };
        window.addEventListener('keydown', onKey);
        return () => { off(); window.removeEventListener('keydown', onKey); };
    }, [open]);

    if (!allowed) return null;

    return (
        <aside
            data-ai-panel
            hidden={!open}
            aria-label="AI туслах"
            className={cn(
                'fixed inset-0 z-50 flex flex-col bg-surface',
                'md:inset-y-0 md:left-auto md:right-0 md:w-[440px] md:border-l md:border-border md:shadow-xl',
                'print:hidden',
            )}
        >
            <header className="flex h-[52px] shrink-0 items-center gap-2 border-b border-border px-3.5">
                <span className="flex h-6 w-6 items-center justify-center rounded-md bg-brand-soft text-brand"><Sparkles className="h-3.5 w-3.5" /></span>
                <h2 className="text-[14px] font-semibold text-foreground">AI туслах</h2>
                {ctx && <span className="ml-1 max-w-[160px] truncate rounded-full border border-border bg-surface-2 px-2 py-0.5 text-[11px] text-fg-2" title={contextLabel(ctx)}>{contextLabel(ctx)}</span>}
                <div className="ml-auto flex items-center gap-0.5">
                    <button type="button" onClick={() => setSession((s) => s + 1)} className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-surface-2 hover:text-foreground" aria-label="Шинэ яриа" title="Шинэ яриа"><RotateCcw className="h-4 w-4" /></button>
                    <Link href="/dashboard/ai-assistant" onClick={() => setOpen(false)} className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-surface-2 hover:text-foreground" aria-label="Бүтэн хуудас" title="Бүтэн хуудас, түүх"><Maximize2 className="h-4 w-4" /></Link>
                    <button type="button" onClick={() => setOpen(false)} className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-surface-2 hover:text-foreground" aria-label="Хаах" title="Хаах (Esc)"><X className="h-4 w-4" /></button>
                </div>
            </header>
            <AiChat key={session} compact prefill={prompt} onPrefillConsumed={() => setPrompt(null)} active={open} className="min-h-0 flex-1" />
        </aside>
    );
}

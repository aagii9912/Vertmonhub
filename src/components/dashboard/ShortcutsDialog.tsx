'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/Dialog';
import { useModuleAccess } from '@/hooks/useModuleAccess';
import { GENERAL_SHORTCUTS, GO_SHORTCUTS, isTypingTarget, onShortcutsOpen } from '@/lib/navigation/shortcuts';

/** «G» дарснаас хойш дараагийн товчийг хүлээх хугацаа. */
const CHORD_MS = 1200;

/**
 * Гарын товчлолууд: «?» — жагсаалт, «G → үсэг» — хуудас руу шилжих.
 * ⌘K (CommandPalette), ⌘J (AiPanel), N (Header) өөрсдийн газарт сонсогдоно.
 */
export function ShortcutsDialog() {
    const [open, setOpen] = React.useState(false);
    const router = useRouter();
    const { can } = useModuleAccess();
    const goRows = GO_SHORTCUTS.filter((row) => can(row.module));

    React.useEffect(() => {
        let chordUntil = 0;
        const onKey = (e: KeyboardEvent) => {
            if (e.metaKey || e.ctrlKey || e.altKey || isTypingTarget(e.target)) return;
            if (document.querySelector('[role="dialog"]')) return;
            if (e.key === '?' || (e.shiftKey && e.code === 'Slash')) {
                e.preventDefault();
                setOpen(true);
                return;
            }
            if (chordUntil > Date.now()) {
                chordUntil = 0;
                const target = GO_SHORTCUTS.find((row) => row.code === e.code);
                if (target && can(target.module)) {
                    e.preventDefault();
                    router.push(target.href);
                }
                return;
            }
            if (e.code === 'KeyG' && !e.shiftKey) chordUntil = Date.now() + CHORD_MS;
        };
        window.addEventListener('keydown', onKey);
        const off = onShortcutsOpen(() => setOpen(true));
        return () => {
            window.removeEventListener('keydown', onKey);
            off();
        };
    }, [can, router]);

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>Гарын товчлол</DialogTitle>
                    <DialogDescription>Mac дээр ⌘, Windows дээр Ctrl. Кирилл байрлалтай гар дээр ч ажиллана.</DialogDescription>
                </DialogHeader>
                <div className="flex flex-col gap-5">
                    <ShortcutList rows={GENERAL_SHORTCUTS} />
                    {goRows.length > 0 && (
                        <section aria-labelledby="go-shortcuts">
                            <h3 id="go-shortcuts" className="mb-2 text-xs font-medium text-muted-foreground">Шилжих — G, дараа нь</h3>
                            <ShortcutList rows={goRows.map((row) => ({ keys: ['G', row.key], label: row.name }))} />
                        </section>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
}

function ShortcutList({ rows }: { rows: { keys: string[]; label: string }[] }) {
    return (
        <dl className="divide-y divide-border rounded-lg border border-border">
            {rows.map((row) => (
                <div key={row.label} className="flex items-center justify-between gap-4 px-3 py-2 text-sm">
                    <dt className="text-fg-2">{row.label}</dt>
                    <dd className="flex shrink-0 items-center gap-1">
                        {row.keys.map((key) => (
                            <kbd key={key} className="mono-label min-w-6 rounded-md border border-border bg-surface-2 px-1.5 text-center text-xs leading-6 text-foreground">{key}</kbd>
                        ))}
                    </dd>
                </div>
            ))}
        </dl>
    );
}

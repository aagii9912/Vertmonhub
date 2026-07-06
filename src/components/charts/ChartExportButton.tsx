'use client';

import * as React from 'react';
import { ImageDown } from 'lucide-react';
import { toast } from 'sonner';
import { downloadChartPng } from '@/lib/utils/chart-export';

/**
 * ChartExportButton — ChartCard-ын `actions` slot-д тавьж чартыг PNG болгон
 * татах жижиг товч.
 *
 * Жишээ:
 *   const ref = useRef<HTMLDivElement>(null);
 *   <div ref={ref}>
 *     <ChartCard title="..." actions={<ChartExportButton targetRef={ref} fileName="суваг" />}>
 *       ...
 *     </ChartCard>
 *   </div>
 */
export interface ChartExportButtonProps {
    /** Чартын SVG агуулсан контейнерын ref */
    targetRef: React.RefObject<HTMLElement | null>;
    /** Татах файлын нэр (.png автоматаар залгагдана) */
    fileName: string;
}

export function ChartExportButton({ targetRef, fileName }: ChartExportButtonProps) {
    const [busy, setBusy] = React.useState(false);

    const handleClick = async () => {
        if (!targetRef.current || busy) return;
        setBusy(true);
        try {
            await downloadChartPng(targetRef.current, fileName);
        } catch (err) {
            console.error('[ChartExportButton]', err);
            toast.error('Зураг татахад алдаа гарлаа');
        } finally {
            setBusy(false);
        }
    };

    return (
        <button
            type="button"
            onClick={handleClick}
            disabled={busy}
            title="PNG зураг татах"
            aria-label="Чартыг PNG зургаар татах"
            className="inline-flex items-center gap-1 rounded-md border border-border bg-surface px-2 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-surface-2 transition-colors disabled:opacity-50"
        >
            <ImageDown className="h-3.5 w-3.5" />
            PNG
        </button>
    );
}

'use client';

import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { CloudOff, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { flushOutbox, onOutboxChange, outboxList } from '@/lib/offline/outbox';

/**
 * Офлайн дарааллыг илгээгч + жижиг төлөвийн туг.
 * `online` болмогц, апп ачаалахад, 30с тутам оролдоно. Илгээгдвэл cache-ийг
 * шинэчилж, хэрэглэгчид мэдэгдэнэ.
 */
export function OutboxSync() {
    const qc = useQueryClient();
    const [pending, setPending] = useState(0);
    const [online, setOnline] = useState(true);

    useEffect(() => {
        const refresh = () => setPending(outboxList().length);
        refresh();
        setOnline(navigator.onLine);

        const run = async () => {
            if (!navigator.onLine || outboxList().length === 0) return;
            const r = await flushOutbox();
            if (r.sent.length) {
                toast.success(`Офлайн бүртгэл илгээгдлээ: ${r.sent.map((s) => s.label).join(', ')}`);
                void qc.invalidateQueries();
            }
            for (const f of r.failed) toast.error(`${f.item.label}: ${f.error}`);
            refresh();
        };

        const onOnline = () => { setOnline(true); void run(); };
        const onOffline = () => setOnline(false);
        window.addEventListener('online', onOnline);
        window.addEventListener('offline', onOffline);
        const off = onOutboxChange(refresh);
        const t = setInterval(() => void run(), 30_000);
        void run();
        return () => {
            window.removeEventListener('online', onOnline);
            window.removeEventListener('offline', onOffline);
            off();
            clearInterval(t);
        };
    }, [qc]);

    if (online && pending === 0) return null;

    return (
        <div
            className="fixed left-1/2 z-40 flex -translate-x-1/2 items-center gap-2 rounded-full border border-border bg-surface px-3 py-1.5 text-[12px] text-fg-2 shadow-lg"
            style={{ bottom: 'calc(3.5rem + env(safe-area-inset-bottom) + 0.75rem)' }}
            role="status"
        >
            {online ? <RefreshCw className="h-3.5 w-3.5 animate-spin text-brand" /> : <CloudOff className="h-3.5 w-3.5 text-status-pending" />}
            {online ? `${pending} бүртгэл илгээж байна…` : pending > 0 ? `Интернэтгүй · ${pending} бүртгэл хүлээгдэж байна` : 'Интернэтгүй'}
        </div>
    );
}

'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { CloudOff, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Alert';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/Sheet';
import { flushOutbox, onOutboxChange, outboxList, remove, retryOutboxItem, type OutboxItem } from '@/lib/offline/outbox';

/** Илгээгээгүй бүртгэлээ үзэх, дахин илгээх, ил тод устгах боломжтой дараалал. */
export function OutboxSync() {
    const qc = useQueryClient();
    const { user, shop, loading } = useAuth();
    const scope = useMemo(() => user && shop && !loading ? { userId: user.id, shopId: shop.id } : null, [user, shop, loading]);
    const currentScope = useRef(scope);
    const running = useRef(false);
    const [items, setItems] = useState<OutboxItem[]>([]);
    const [online, setOnline] = useState(true);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [open, setOpen] = useState(false);
    const [discardId, setDiscardId] = useState<string | null>(null);

    const refresh = useCallback(() => {
        try {
            setItems(scope ? outboxList(scope) : []);
            setError(null);
        } catch {
            setError('Энэ төхөөрөмжийн офлайн бүртгэлийг уншиж чадсангүй. Хадгалсан мэдээллийг арилгаагүй.');
        }
    }, [scope]);

    const run = useCallback(async () => {
        if (!scope || !navigator.onLine || currentScope.current !== scope || running.current) return;
        running.current = true;
        setBusy(true);
        try {
            const result = await flushOutbox(scope, () => currentScope.current === scope);
            if (currentScope.current !== scope) return;
            if (result.sent.length) {
                toast.success(`${result.sent.length} офлайн бүртгэл илгээгдлээ`);
                void qc.invalidateQueries();
            }
            for (const failure of result.failed) toast.error(`${failure.item.label}: ${failure.error}`);
            refresh();
        } catch {
            setError('Офлайн дарааллыг шинэчилж чадсангүй. Бүртгэлүүдийг арилгаагүй.');
        } finally {
            running.current = false;
            setBusy(false);
        }
    }, [scope, qc, refresh]);

    useEffect(() => {
        currentScope.current = scope;
        refresh();
        setOnline(navigator.onLine);
        const onOnline = () => { setOnline(true); void run(); };
        const onOffline = () => setOnline(false);
        window.addEventListener('online', onOnline);
        window.addEventListener('offline', onOffline);
        const off = onOutboxChange(refresh);
        const timer = setInterval(() => void run(), 30_000);
        void run();
        return () => {
            currentScope.current = null;
            window.removeEventListener('online', onOnline);
            window.removeEventListener('offline', onOffline);
            off();
            clearInterval(timer);
        };
    }, [scope, refresh, run]);

    const visible = items.filter((item) => item.userId === scope?.userId && item.shopId === scope?.shopId);
    if (!scope || (online && visible.length === 0 && !error)) return null;

    const retry = (item: OutboxItem) => {
        try {
            retryOutboxItem(item.id, scope);
            void run();
        } catch { setError('Дахин илгээх төлөвийг хадгалж чадсангүй.'); }
    };
    const discard = (item: OutboxItem) => {
        try {
            remove(item.id, scope);
            setDiscardId(null);
        } catch { setError('Бүртгэлийг устгаж чадсангүй.'); }
    };

    return (
        <>
            <button
                type="button"
                onClick={() => setOpen(true)}
                className="fixed left-1/2 z-40 flex max-w-[calc(100%-2rem)] -translate-x-1/2 items-center gap-2 rounded-full border border-border bg-surface px-3 py-2 text-[12px] text-fg-2 shadow-lg focus-ring"
                style={{ bottom: 'calc(3.5rem + env(safe-area-inset-bottom) + 0.75rem)' }}
            >
                {busy ? <RefreshCw className="h-3.5 w-3.5 animate-spin text-brand" /> : <CloudOff className="h-3.5 w-3.5 text-status-pending" />}
                {error ? 'Офлайн бүртгэлд анхаарах зүйл байна' : visible.length ? `${visible.length} бүртгэл илгээгдээгүй · Үзэх` : 'Интернэтгүй'}
            </button>
            <Sheet open={open} onOpenChange={setOpen}>
                <SheetContent className="overflow-y-auto">
                    <SheetHeader>
                        <SheetTitle>Илгээгээгүй бүртгэл</SheetTitle>
                        <SheetDescription>Энэ төхөөрөмжид хадгалсан таны бүртгэлүүд. Амжилттай илгээгдтэл энд үлдэнэ.</SheetDescription>
                    </SheetHeader>
                    <div className="space-y-3 p-4">
                        {error && <Alert variant="danger">{error}</Alert>}
                        {!online && <Alert variant="warning">Интернэтэд холбогдсоны дараа дахин илгээх боломжтой.</Alert>}
                        {visible.length === 0 && !error && <p className="text-sm text-muted-foreground">Илгээгээгүй бүртгэл алга.</p>}
                        {visible.map((item) => (
                            <div key={item.id} className="space-y-2 rounded-md border border-border p-3">
                                <p className="text-sm font-medium">{item.label}</p>
                                <p className="text-xs text-muted-foreground">{new Date(item.createdAt).toLocaleString('mn-MN', { timeZone: 'Asia/Ulaanbaatar' })}</p>
                                {item.error && <p className="text-xs text-status-danger">{item.error}</p>}
                                <div className="flex flex-wrap gap-2">
                                    <Button size="sm" disabled={!online || busy} onClick={() => retry(item)}>Дахин илгээх</Button>
                                    {discardId === item.id ? (
                                        <>
                                            <span className="w-full text-xs text-status-danger">Энэ төхөөрөмжид хадгалсан бүртгэлийг бүрмөсөн устгах уу?</span>
                                            <Button size="sm" variant="secondary" disabled={busy} onClick={() => discard(item)}>Тийм, устгах</Button>
                                            <Button size="sm" variant="secondary" onClick={() => setDiscardId(null)}>Болих</Button>
                                        </>
                                    ) : <Button size="sm" variant="secondary" disabled={busy} onClick={() => setDiscardId(item.id)}>Устгах</Button>}
                                </div>
                            </div>
                        ))}
                    </div>
                </SheetContent>
            </Sheet>
        </>
    );
}

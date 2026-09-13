'use client';

import { useState } from 'react';
import { CheckCircle, HelpCircle, Loader2, Send } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/Sheet';
import { dashboardFetch } from '@/lib/api/dashboardFetch';

type FeedbackType = 'bug' | 'feature' | 'support';

/** Толгой хэсэгт байрлах тусламж; үндсэн ажлын товчлууруудыг халхлахгүй. */
export function FeedbackWidget() {
    const [open, setOpen] = useState(false);
    const [sending, setSending] = useState(false);
    const [sent, setSent] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [feedback, setFeedback] = useState({ type: 'bug' as FeedbackType, message: '', email: '' });

    async function submit(e: React.FormEvent) {
        e.preventDefault();
        if (sending || !feedback.message.trim()) return;
        setSending(true);
        setError(null);
        try {
            const res = await dashboardFetch('/api/feedback', { method: 'POST', body: JSON.stringify(feedback) });
            if (!res.ok) throw new Error('Илгээж чадсангүй. Бичсэн зүйлээ алдалгүй дахин оролдоно уу.');
            setSent(true);
            setFeedback({ type: 'bug', message: '', email: '' });
        } catch (err) { setError(err instanceof Error ? err.message : 'Холболт тасарлаа. Дахин оролдоно уу.'); }
        finally { setSending(false); }
    }

    return <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger asChild><button type="button" aria-label="Тусламж, санал хүсэлт" title="Тусламж, санал хүсэлт" onClick={() => setSent(false)} className="flex h-10 w-9 items-center justify-center rounded-md text-fg-2 hover:bg-surface-2 focus-ring md:h-[30px] md:w-[30px]"><HelpCircle className="h-4 w-4" /></button></SheetTrigger>
        <SheetContent className="overflow-y-auto">
            <SheetHeader><SheetTitle>Тусламж, санал хүсэлт</SheetTitle><SheetDescription>Алдаа мэдээлэх, санал гаргах эсвэл тусламж авах.</SheetDescription></SheetHeader>
            {sent ? <div role="status" className="space-y-4 px-4 py-8 text-center"><CheckCircle className="mx-auto h-9 w-9 text-status-success" /><p>Таны санал хүсэлт илгээгдлээ.</p><Button variant="secondary" onClick={() => setOpen(false)}>Хаах</Button></div> : <form onSubmit={submit} className="space-y-4 px-4 pb-6">
                <label className="block space-y-2 text-sm"><span>Төрөл</span><select value={feedback.type} onChange={e => setFeedback(f => ({ ...f, type: e.target.value as FeedbackType }))} className="h-11 w-full rounded-md border border-border bg-surface px-3 focus-ring"><option value="bug">Алдаа мэдэгдэх</option><option value="feature">Санал хүсэлт</option><option value="support">Тусламж авах</option></select></label>
                <label className="block space-y-2 text-sm"><span>Дэлгэрэнгүй</span><textarea required rows={5} value={feedback.message} onChange={e => setFeedback(f => ({ ...f, message: e.target.value }))} placeholder="Ямар алхам дээр юу болсон эсвэл юуг сайжруулахыг бичнэ үү…" className="w-full rounded-md border border-border bg-surface px-3 py-2 focus-ring" /></label>
                <label className="block space-y-2 text-sm"><span>Хариу авах имэйл (заавал биш)</span><input type="email" value={feedback.email} onChange={e => setFeedback(f => ({ ...f, email: e.target.value }))} className="h-11 w-full rounded-md border border-border bg-surface px-3 focus-ring" /></label>
                {error && <p role="alert" className="text-sm text-status-danger">{error}</p>}
                <Button type="submit" disabled={sending || !feedback.message.trim()} className="w-full">{sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Илгээх</Button>
            </form>}
        </SheetContent>
    </Sheet>;
}

'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, Inbox, Loader2, MessageSquare, RefreshCw, Search, Send, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { useConversations, type Conversation } from '@/hooks/useConversations';
import { dashboardFetch } from '@/lib/api/dashboardFetch';
import { formatTime, formatTimeAgo } from '@/lib/utils/date';
import { confirmToast } from '@/components/ui/Toast';
import { cn } from '@/lib/utils';

export default function InboxMessagesPage() {
    return <Suspense fallback={<LoadingInbox />}><InboxWorkspace /></Suspense>;
}

function LoadingInbox() {
    return <div role="status" className="flex flex-1 items-center justify-center gap-2 p-8 text-sm text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" />Яриа ачаалж байна</div>;
}

function InboxWorkspace() {
    const router = useRouter();
    const search = useSearchParams();
    const { shop, loading: authLoading } = useAuth();
    const { data, isLoading, isError, isFetching, refetch } = useConversations();
    const [query, setQuery] = useState('');
    const activeId = search.get('conversation');
    const conversations = data ?? [];
    const active = conversations.find(c => c.id === activeId);
    const filtered = conversations.filter(c => (c.customer_name || 'Зочин').toLowerCase().includes(query.trim().toLowerCase()));

    function select(id: string | null) {
        const params = new URLSearchParams(search.toString());
        if (id) params.set('conversation', id);
        else params.delete('conversation');
        router.push(`/dashboard/inbox/messages${params.size ? `?${params}` : ''}`, { scroll: false });
    }

    if (authLoading || isLoading) return <LoadingInbox />;
    if (!shop || (isError && !data)) return <div role="alert" className="rounded-md border border-status-danger/30 p-5 text-sm">
        <p>Яриаг ачаалж чадсангүй. Мэдээллээ дахин шинэчилнэ үү.</p>
        <button type="button" disabled={isFetching} onClick={() => void refetch()} className="mt-3 min-h-11 rounded-md border border-border px-3 focus-ring">Дахин оролдох</button>
    </div>;

    return <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-border bg-surface">
        {isError && <p role="alert" className="border-b border-border px-4 py-2 text-xs text-status-pending">Шинэчилж чадсангүй. Өмнө ачаалсан ярианууд харагдаж байна.</p>}
        <div className="flex min-h-0 flex-1">
            <section aria-label="Ярианы жагсаалт" className={cn('min-h-0 w-full shrink-0 flex-col border-border md:flex md:w-72 md:border-r lg:w-80', activeId ? 'hidden' : 'flex')}>
                <div className="flex items-center gap-2 border-b border-border px-3 py-2">
                    <h2 className="text-sm font-semibold">Ярианууд <span className="num ml-1 text-muted-foreground">{conversations.length}</span></h2>
                    <button type="button" onClick={() => void refetch()} disabled={isFetching} aria-label="Яриа шинэчлэх" className="ml-auto flex h-10 w-10 items-center justify-center rounded-md hover:bg-surface-2 focus-ring"><RefreshCw className={cn('h-4 w-4', isFetching && 'animate-spin')} /></button>
                </div>
                <div className="relative m-3">
                    <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                    <input aria-label="Яриаг нэрээр хайх" value={query} onChange={e => setQuery(e.target.value)} placeholder="Нэрээр хайх…" className="h-10 w-full rounded-md border border-border bg-surface-2 pl-9 pr-3 text-sm focus-ring" />
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto">
                    {filtered.length === 0 ? <div className="flex flex-col items-center gap-3 px-5 py-12 text-center text-sm text-muted-foreground">
                        <Inbox className="h-7 w-7" />
                        <p className="font-medium text-foreground">{query ? 'Хайлтад тохирох яриа алга' : 'Одоогоор яриа бүртгэгдээгүй'}</p>
                        <p>{query ? 'Өөр нэрээр хайх эсвэл хайлтаа арилгана уу.' : 'Холбогдсон сувгаас мессеж ирэхэд энд харагдана.'}</p>
                        {query && <button type="button" onClick={() => setQuery('')} className="min-h-11 text-brand focus-ring">Хайлт арилгах</button>}
                    </div> : filtered.map(c => <button key={c.id} type="button" aria-pressed={activeId === c.id} onClick={() => select(c.id)} className={cn('flex w-full items-start gap-3 border-b border-border px-3 py-3 text-left focus-ring', activeId === c.id ? 'bg-brand-soft' : 'hover:bg-surface-2')}>
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface-3 text-sm">{(c.customer_name || 'Зочин').slice(0,1)}</span>
                        <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{c.customer_name || 'Зочин'}</span><span className="mt-1 block truncate text-xs text-muted-foreground">{c.last_message}</span><span className="mt-1 block text-xs text-muted-foreground">{c.last_message_at ? formatTimeAgo(c.last_message_at) : ''}</span></span>
                    </button>)}
                </div>
            </section>
            <section aria-label="Сонгосон яриа" className={cn('min-h-0 min-w-0 flex-1 flex-col md:flex', activeId ? 'flex' : 'hidden')}>
                {active ? <ConversationThread key={`${shop.id}:${active.id}`} conversation={active} onBack={() => select(null)} onRefresh={refetch} /> : <div className="flex flex-1 flex-col items-center justify-center gap-3 p-5 text-center text-sm text-muted-foreground">
                    <MessageSquare className="h-8 w-8" />
                    <p>{activeId ? 'Сонгосон яриа энэ жагсаалтад олдсонгүй.' : 'Жагсаалтаас яриа сонгоно уу.'}</p>
                    {activeId && <button type="button" onClick={() => select(null)} className="min-h-11 rounded-md border border-border px-3 text-foreground focus-ring">Ярианы жагсаалт руу буцах</button>}
                </div>}
            </section>
        </div>
    </div>;
}

function ConversationThread({ conversation, onBack, onRefresh }: { conversation: Conversation; onBack: () => void; onRefresh: () => Promise<unknown> }) {
    const { user } = useAuth();
    const canWrite = !!user?.permissions?.canWrite;
    const canDelete = !!user?.permissions?.canDelete;
    const [draft, setDraft] = useState('');
    const [sending, setSending] = useState(false);
    const [sendError, setSendError] = useState<string | null>(null);
    const [pause, setPause] = useState<'pause' | 'off'>('pause');
    const endRef = useRef<HTMLDivElement>(null);
    const messages = [...conversation.messages].sort((a,b) => Date.parse(a.created_at) - Date.parse(b.created_at));
    useEffect(() => { endRef.current?.scrollIntoView({ block: 'nearest' }); }, [conversation.id, conversation.messages.length]);

    async function send() {
        const message = draft.trim();
        if (!message || sending) return;
        setSending(true);
        setSendError(null);
        try {
            const res = await dashboardFetch('/api/dashboard/conversations/reply', { method: 'POST', body: JSON.stringify({ customerId: conversation.id, message, aiPauseMode: pause }) });
            if (!res.ok) {
                const body = await res.json().catch(() => null);
                throw new Error(body?.error || 'Мессеж илгээж чадсангүй.');
            }
            setDraft('');
            toast.success('Мессеж илгээгдлээ');
            await onRefresh();
        } catch (error) {
            setSendError(error instanceof Error ? error.message : 'Мессеж илгээж чадсангүй. Дахин оролдоно уу.');
        } finally { setSending(false); }
    }

    async function remove() {
        if (!await confirmToast({ title: 'Харилцагч болон яриаг устгах уу?', description: 'Чатны түүх устна. Энэ үйлдлийг буцаах боломжгүй.', confirmLabel: 'Устгах', destructive: true })) return;
        try {
            const res = await dashboardFetch(`/api/dashboard/customers?id=${encodeURIComponent(conversation.id)}`, { method: 'DELETE' });
            if (!res.ok) throw new Error('Устгахад алдаа гарлаа.');
            onBack();
            await onRefresh();
            toast.success('Харилцагч устгагдлаа');
        } catch (error) { toast.error(error instanceof Error ? error.message : 'Устгахад алдаа гарлаа.'); }
    }

    return <>
        <header className="flex shrink-0 items-center gap-2 border-b border-border px-3 py-2">
            <button type="button" onClick={onBack} aria-label="Ярианы жагсаалт руу буцах" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md hover:bg-surface-2 focus-ring md:hidden"><ArrowLeft className="h-5 w-5" /></button>
            <div className="min-w-0"><h2 className="truncate text-sm font-semibold">{conversation.customer_name || 'Зочин'}</h2><p className="text-xs text-muted-foreground">{messages.length} мессеж</p></div>
            {canDelete && <button type="button" disabled={sending} onClick={() => void remove()} aria-label="Харилцагч болон яриаг устгах" className="ml-auto flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-status-danger-soft hover:text-status-danger focus-ring"><Trash2 className="h-4 w-4" /></button>}
        </header>
        <div role="log" aria-label="Ярианы түүх" className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3 md:p-5">
            {messages.length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">Ярианы түүх хоосон байна.</p>}
            {messages.map(message => <div key={message.id} className={cn('flex', message.role !== 'user' && 'justify-end')}><div className={cn('max-w-[90%] whitespace-pre-wrap break-words rounded-xl px-3 py-2 text-sm leading-relaxed md:max-w-[75%]', message.role === 'user' ? 'bg-surface-2' : 'bg-brand-soft')}>
                {message.content}<time dateTime={message.created_at} className="mt-1 block text-[11px] text-muted-foreground">{formatTime(message.created_at)}</time>
            </div></div>)}
            <div ref={endRef} />
        </div>
        {canWrite ? <form onSubmit={e => { e.preventDefault(); void send(); }} className="shrink-0 space-y-2 border-t border-border p-3">
            <label className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">Хариу илгээсний дараа:
                <select aria-label="Хариу илгээсний дараах AI горим" disabled={sending} value={pause} onChange={e => setPause(e.target.value as 'pause' | 'off')} className="min-h-9 rounded-md border border-border bg-surface px-2 text-foreground focus-ring"><option value="pause">AI-г 30 минут зогсоох</option><option value="off">AI-г дахин асаах хүртэл зогсоох</option></select>
            </label>
            {sendError && <p role="alert" className="text-xs text-status-danger">{sendError} Бичсэн мессеж талбарт үлдсэн; дахин илгээж болно.</p>}
            <div className="flex items-end gap-2"><textarea aria-label="Хариу мессеж" value={draft} onChange={e => setDraft(e.target.value)} disabled={sending} rows={2} placeholder="Хариу бичих…" onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); void send(); } }} className="min-h-11 min-w-0 flex-1 resize-none rounded-md border border-border bg-surface-2 px-3 py-2 text-base focus-ring md:text-sm" /><button type="submit" disabled={!draft.trim() || sending} aria-label="Мессеж илгээх" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md bg-brand text-brand-fg disabled:opacity-40 focus-ring">{sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}</button></div>
        </form> : <p className="border-t border-border p-3 text-sm text-muted-foreground">Та яриаг зөвхөн харах эрхтэй.</p>}
    </>;
}

'use client';

import { useState, type FormEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { dashboardJson, dashboardMutate } from '@/lib/api/dashboardFetch';
import { PageHeader } from '@/components/dashboard/PageHeader';
import { SectionCard } from '@/components/ui/SectionCard';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Textarea } from '@/components/ui/Textarea';
import { Alert } from '@/components/ui/Alert';
import { Spinner } from '@/components/ui/Spinner';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/Dialog';
import { defaultNewsletterDesign, NewsletterActionSchema, type Newsletter, type NewsletterDesign } from '@/lib/marketing/newsletter';
import { NewsletterDesignEditor, NewsletterPreview } from '@/components/marketing/NewsletterTemplate';

type Overview = { newsletters: Newsletter[]; total: number; configured: boolean; connected: boolean; from: string | null; sender?: { fromEmail: string; fromName: string } | null };
type Contacts = { data: { id: string; email: string; unsubscribed: boolean }[]; has_more: boolean };
const statusLabel: Record<Newsletter['status'], string> = { draft: 'Ноорог', preparing: 'Бэлтгэж байна', sending: 'Илгээж байна', queued: 'Resend хүлээн авсан', sent: 'Resend илгээсэн', failed: 'Амжилтгүй', unknown: 'Төлөв шалгах шаардлагатай' };

export default function NewsletterPage() {
    const { shop, user } = useAuth();
    if (!shop) return <Spinner />;
    if (user?.role !== 'super_admin' && !user?.permissions?.modules.includes('marketing-roi')) return <Alert>Маркетингийн эрх шаардлагатай.</Alert>;
    return <NewsletterProjects key={shop.id} shopId={shop.id} canWrite={user?.role === 'super_admin' || !!user?.permissions?.canWrite} />;
}

function NewsletterProjects({ shopId, canWrite }: { shopId: string; canWrite: boolean }) {
    const [selected, setSelected] = useState('');
    const projects = useQuery({ queryKey: ['newsletter-projects', shopId], queryFn: () => dashboardJson<{ projects: { id: string; name: string }[] }>('/api/marketing/newsletter', { shopId }) });
    if (projects.isLoading) return <Spinner />;
    if (projects.isError) return <Alert variant="danger">{projects.error.message}</Alert>;
    const project = projects.data?.projects.find(p => p.id === selected) ?? projects.data?.projects[0];
    if (!project) return <Alert>Эхлээд байгууллагын төсөл бүртгэнэ үү.</Alert>;
    return <div className="space-y-4"><label className="grid max-w-sm gap-2 text-sm">Төсөл<select className="h-10 rounded-md border border-border bg-surface px-3" value={project.id} onChange={e => setSelected(e.target.value)}>{projects.data?.projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label><NewsletterWorkspace key={project.id} shopId={shopId} projectId={project.id} brand={project.name} canWrite={canWrite} /></div>;
}

function NewsletterWorkspace({ shopId, projectId, brand, canWrite }: { shopId: string; projectId: string; brand: string; canWrite: boolean }) {
    const cache = useQueryClient();
    const newDraft = () => ({ id: '', subject: '', body: '', design: defaultNewsletterDesign(brand) as NewsletterDesign | null });
    const [draft, setDraft] = useState(newDraft);
    const [email, setEmail] = useState('');
    const [consent, setConsent] = useState(false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [confirm, setConfirm] = useState<Newsletter | null>(null);
    const [page, setPage] = useState(0);
    const [after, setAfter] = useState('');
    const overview = useQuery({ queryKey: ['newsletter', shopId, projectId, page], queryFn: () => dashboardJson<Overview>(`/api/marketing/newsletter?projectId=${projectId}&page=${page}`, { shopId }), retry: false });
    const contacts = useQuery({ queryKey: ['newsletter-contacts', shopId, projectId, after], enabled: !!overview.data?.connected && !!overview.data.configured,
        queryFn: () => dashboardJson<Contacts>(`/api/marketing/newsletter?projectId=${projectId}&contacts=1${after ? `&after=${encodeURIComponent(after)}` : ''}`, { shopId }), retry: false });
    async function action(payload: object) {
        setBusy(true); setError('');
        try {
            const result = await dashboardMutate<{ status?: string }>('/api/marketing/newsletter', 'POST', { ...payload, projectId }, { shopId });
            await cache.invalidateQueries({ queryKey: ['newsletter', shopId] });
            await cache.invalidateQueries({ queryKey: ['newsletter-contacts', shopId] });
            return result;
        } catch (e) { setError(e instanceof Error ? e.message : 'Хүсэлт амжилтгүй'); return null; }
        finally { setBusy(false); }
    }
    async function save(event: FormEvent) {
        event.preventDefault();
        const next = { ...draft, id: draft.id || crypto.randomUUID() }; setDraft(next);
        const parsed = NewsletterActionSchema.safeParse({ action: 'save', ...next });
        if (!parsed.success) { setError(parsed.error.issues[0]?.message || 'Мэдээллээ шалгана уу.'); return; }
        if (await action(parsed.data)) toast.success('Ноорог хадгаллаа');
    }
    const data = overview.data;
    return <div className="min-w-0 space-y-4">
        <PageHeader title="Email / Newsletter" subtitle="Захиалагчдадаа мэдээллийн товхимол бэлтгэж, Resend-ээр илгээнэ." secondaryActions={<Button href="/marketing" variant="secondary">Маркетинг</Button>} />
        {overview.isLoading && <Spinner />}{overview.isError && <Alert variant="danger">{overview.error.message} <Button size="sm" onClick={() => void overview.refetch()}>Дахин оролдох</Button></Alert>}
        {data && <>
            <Alert variant={data.configured ? 'info' : 'warning'}>{data.configured ? `Илгээгч: ${data.from}. ${data.connected ? 'Захиалагчийн бүлэг холбогдсон.' : 'Захиалагчийн бүлэг үүсгэнэ үү.'}` : 'Resend холболт дутуу. Төслийн илгээгчийг тохируулж, домэйныг Resend-д баталгаажуулна. Ноорог одоо хадгалж болно.'}</Alert>
            {canWrite && <SectionCard title="Төслийн илгээгч" description="Төсөл бүр өөрийн домэйн, захиалагчдын бүлэгтэй. Домэйныг Resend-д баталгаажуулсны дараа илгээнэ."><form key={data.from ?? projectId} className="flex flex-wrap items-end gap-3" onSubmit={async event => { event.preventDefault(); const values = new FormData(event.currentTarget); if (await action({ action: 'configure', fromName: values.get('fromName'), fromEmail: values.get('fromEmail') })) toast.success('Илгээгч хадгаллаа'); }}><label className="grid gap-1 text-sm">Илгээгчийн нэр<Input name="fromName" required maxLength={120} defaultValue={data.sender?.fromName ?? brand} disabled={busy} /></label><label className="grid gap-1 text-sm">Илгээгчийн имэйл<Input name="fromEmail" type="email" required maxLength={254} defaultValue={data.sender?.fromEmail ?? ''} placeholder="newsletter@elysium.mn" disabled={busy} /></label><Button type="submit" disabled={busy}>Илгээгч хадгалах</Button></form></SectionCard>}
            {canWrite && data.configured && !data.connected && <Button disabled={busy} onClick={() => void action({ action: 'setup' })}>Newsletter холболт үүсгэх</Button>}
            {error && <Alert variant="danger">{error}</Alert>}
            <div className="grid min-w-0 gap-4 xl:grid-cols-2">
                {canWrite && <SectionCard title="Товхимол бэлтгэх" description="Хадгалсан нооргоо Resend-д бэлтгээд, дараа нь шалгаж илгээнэ.">
                    <form onSubmit={save} className="space-y-4"><fieldset disabled={busy} className="min-w-0"><NewsletterDesignEditor value={draft.design} brand={brand} onChange={design => setDraft(d => ({ ...d, design }))} /></fieldset><label className="grid gap-1.5 text-sm">Гарчиг<Input required maxLength={200} value={draft.subject} disabled={busy} onChange={e => setDraft(d => ({ ...d, subject: e.target.value }))} /></label><label className="grid gap-1.5 text-sm">Агуулга<Textarea required rows={12} maxLength={50000} value={draft.body} disabled={busy} onChange={e => setDraft(d => ({ ...d, body: e.target.value }))} /></label><div className="flex gap-2"><Button type="submit" disabled={busy}>Ноорог хадгалах</Button><Button type="button" variant="secondary" disabled={busy} onClick={() => setDraft(newDraft())}>Шинэ ноорог</Button></div></form>
                </SectionCard>}
                {canWrite && <SectionCard title="Урьдчилан харах" description="Хадгалж илгээх имэйлийн загвараа энд шалгана."><NewsletterPreview subject={draft.subject} body={draft.body} design={draft.design} /></SectionCard>}
            </div>
            <SectionCard title="Захиалагчид" description="Newsletter хүлээн авахыг зөвшөөрсөн хаягийг нэмнэ. Татгалзсан хаягт Resend илгээхгүй.">
                    {canWrite && data.connected && <form className="mb-4 space-y-3" onSubmit={async e => { e.preventDefault(); if (await action({ action: 'subscribe', email: email.trim(), consent })) { setEmail(''); setConsent(false); toast.success('Захиалагч нэмлээ'); } }}><label className="grid gap-1.5 text-sm">Имэйл<Input type="email" required maxLength={254} value={email} onChange={e => setEmail(e.target.value)} disabled={busy || !data.configured} /></label><label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1" required checked={consent} onChange={e => setConsent(e.target.checked)} />Энэ хүн newsletter хүлээн авахыг зөвшөөрсөн.</label><Button type="submit" disabled={busy || !data.configured || !consent}>Захиалагч нэмэх</Button></form>}
                    {contacts.isLoading && <Spinner />}{contacts.isError && <Alert variant="danger">{contacts.error.message} <Button size="sm" onClick={() => void contacts.refetch()}>Дахин оролдох</Button></Alert>}
                    <ul className="divide-y divide-border">{contacts.data?.data.map(c => <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm"><span className="min-w-0 break-all">{c.email}<span className="ml-2 text-xs text-muted-foreground">{c.unsubscribed ? 'Татгалзсан' : 'Идэвхтэй'}</span></span>{canWrite && <Button variant="ghost" size="sm" disabled={busy} onClick={() => void action({ action: 'remove', contactId: c.id })}>Бүлгээс хасах</Button>}</li>)}</ul>
                    {contacts.data && !contacts.data.data.length && <p className="text-sm text-muted-foreground">Захиалагч алга.</p>}
                    <div className="mt-3 flex gap-2">{after && <Button size="sm" variant="secondary" onClick={() => setAfter('')}>Эхний хуудас</Button>}{contacts.data?.has_more && <Button size="sm" variant="secondary" onClick={() => setAfter(contacts.data!.data.at(-1)!.id)}>Дараагийн 100</Button>}</div>
            </SectionCard>
            <SectionCard title="Товхимлууд" description="Resend хүлээн авсан эсвэл илгээсэн төлөв нь хүлээн авагчийн inbox-д хүрснийг батлахгүй.">
                <div className="space-y-3">{data.newsletters.map(n => <article key={n.id} className="rounded-md border border-border p-3"><div className="flex flex-wrap items-start justify-between gap-2"><div className="min-w-0"><h3 className="break-words text-sm font-semibold">{n.subject}</h3><p className="mt-1 text-xs text-muted-foreground">{statusLabel[n.status]}{n.broadcast_id && n.status === 'draft' ? ' · Resend-д бэлэн' : ''}</p></div><div className="flex flex-wrap gap-2">{canWrite && n.status === 'draft' && !n.broadcast_id && <><Button size="sm" variant="secondary" disabled={busy} onClick={() => setDraft({ id: n.id, subject: n.subject, body: n.body, design: n.design ?? null })}>Засах</Button><Button size="sm" disabled={busy || !data.configured || !data.connected} onClick={() => void action({ action: 'prepare', id: n.id })}>Resend ноорог бэлтгэх</Button></>}{canWrite && n.status === 'draft' && n.broadcast_id && <Button size="sm" disabled={busy || !data.configured} onClick={() => setConfirm(n)}>Шалгаж илгээх</Button>}{canWrite && n.broadcast_id && <Button size="sm" variant="secondary" disabled={busy || !data.configured} onClick={async () => { if (await action({ action: 'refresh', id: n.id })) toast.success('Төлөв шинэчиллээ'); }}>Төлөв шалгах</Button>}<Button size="sm" variant="ghost" disabled={busy || !canWrite} onClick={() => setDraft({ id: '', subject: n.subject, body: n.body, design: n.design ?? null })}>Хуулж шинэчлэх</Button></div></div><details className="mt-3 text-sm"><summary className="cursor-pointer text-muted-foreground">Агуулга харах</summary><NewsletterPreview subject={n.subject} body={n.body} design={n.design} title={`Хадгалсан имэйл: ${n.subject}`} /></details>{n.status === 'unknown' && <p className="mt-2 text-sm text-status-pending">Илгээлтийн хариу тодорхойгүй. Resend дээр төлөвийг шалгана уу. Автоматаар дахин илгээхгүй.</p>}</article>)}</div>
                {!data.newsletters.length && <p className="py-4 text-sm text-muted-foreground">Товхимол бүртгэгдээгүй.</p>}
                {data.total > 25 && <div className="mt-3 flex items-center gap-3 text-sm"><Button size="sm" variant="secondary" disabled={!page} onClick={() => setPage(p => p - 1)}>Өмнөх</Button><span>{page + 1} / {Math.ceil(data.total / 25)}</span><Button size="sm" variant="secondary" disabled={(page + 1) * 25 >= data.total} onClick={() => setPage(p => p + 1)}>Дараах</Button></div>}
            </SectionCard>
        </>}
        <Dialog open={!!confirm} onOpenChange={open => { if (!open && !busy) setConfirm(null); }}><DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-3xl"><DialogHeader><DialogTitle>Newsletter илгээх</DialogTitle><DialogDescription>Энэ төслийн Resend бүлгийн идэвхтэй захиалагчдад доорх агуулгыг илгээнэ.</DialogDescription></DialogHeader><p className="text-xs text-muted-foreground">Илгээгч: {data?.from}</p><h2 className="text-lg font-semibold">{confirm?.subject}</h2>{confirm && <NewsletterPreview subject={confirm.subject} body={confirm.body} design={confirm.design} title="Илгээх имэйлийн харагдац" />}<p className="text-xs text-muted-foreground">Татгалзах холбоос имэйлд автоматаар орно.</p>{error && <Alert variant="danger">{error}</Alert>}<div className="flex justify-end gap-2"><Button variant="secondary" disabled={busy} onClick={() => setConfirm(null)}>Болих</Button><Button disabled={busy} onClick={async () => { if (confirm && await action({ action: 'send', id: confirm.id, confirm: true })) { setConfirm(null); toast.success('Resend илгээлтийн төлөв шинэчлэгдлээ'); } }}>Захиалагчдад илгээх</Button></div></DialogContent></Dialog>
    </div>;
}

'use client';

import { useState, type FormEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/Dialog';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { dashboardJson, dashboardMutate } from '@/lib/api/dashboardFetch';
import { MARKETING_CHANNELS, type MarketingActivity } from '@/lib/marketing/performance';
import { ubDateStr } from '@/lib/utils/date';

export const marketingInputClass = 'h-10 w-full rounded-md border border-border bg-surface px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand';
export type EditRecord = { kind: 'activity' | 'target' | 'spend' | 'attribution'; [key: string]: string | number | null | undefined };
type LeadOption = { id: string; customer_name: string; sales_manager_name: string | null; sales_handoff_at: string | null; project_id: string | null; marketing_campaign_id: string | null; marketing_owner_name: string | null; marketing_channel: string | null };
const labels = { activity: 'Акц / контент бүртгэх', target: 'Сарын зорилт, төсөв', spend: 'Зардал бүртгэх', attribution: 'Лидийн эх үүсвэр холбох' };

export function PerformanceEditor({ record, projects, activities, shopId, onClose, onSaved }: {
    record: EditRecord; projects: { id: string; name: string }[]; activities: MarketingActivity[];
    shopId: string; onClose: () => void; onSaved: () => Promise<void>;
}) {
    const [draft, setDraft] = useState<EditRecord>(() => ({
        ...(record.kind === 'activity' || record.kind === 'spend' ? { id: crypto.randomUUID() } : {}), project_id: projects[0]?.id || '', marketing_owner_name: '', channel: 'meta_ads',
        activity_kind: 'campaign', status: 'draft', start_date: ubDateStr(), completed_on: ubDateStr(),
        month: `${ubDateStr().slice(0, 7)}-01`, spent_at: ubDateStr(), marketing_channel: 'other', ...record,
    }));
    const [search, setSearch] = useState('');
    const [query, setQuery] = useState('');
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const [confirming, setConfirming] = useState(false);
    const leads = useQuery({ queryKey: ['marketing-lead-options', shopId, query], enabled: record.kind === 'attribution',
        queryFn: () => dashboardJson<{ leads: LeadOption[] }>(`/api/marketing/performance/records?q=${encodeURIComponent(query)}`, { shopId }) });
    const set = (key: string, value: string) => setDraft(d => ({ ...d, [key]: value }));
    const value = (key: string) => String(draft[key] ?? '');
    const owners = [...new Set(activities.map(a => a.marketing_owner_name).filter((n): n is string => !!n))];
    const selectedLead = leads.data?.leads.find(l => l.id === draft.lead_id);
    const field = (key: string, label: string, type = 'text', required = true) => <label className="grid gap-1.5 text-sm" key={key}>
        {label}<Input type={type} value={type === 'month' ? value(key).slice(0, 7) : value(key)} required={required}
            min={type === 'number' ? 0 : undefined} step={type === 'number' ? 1 : undefined}
            maxLength={key === 'marketing_owner_name' ? 120 : key === 'name' ? 255 : undefined}
            list={key === 'marketing_owner_name' ? 'marketing-owner-options' : undefined}
            onChange={e => set(key, type === 'month' ? `${e.target.value}-01` : e.target.value)} />
    </label>;
    const select = (key: string, label: string, options: { id: string; name: string }[], empty = false) => <label className="grid gap-1.5 text-sm" key={key}>
        {label}<select aria-label={label} className={marketingInputClass} value={value(key)} required={!empty} onChange={e => {
            const v = e.target.value;
            const campaign = key === 'marketing_campaign_id' ? activities.find(a => a.id === v) : null;
            setDraft(d => ({ ...d, [key]: v, ...(campaign ? { project_id: campaign.project_id, marketing_owner_name: campaign.marketing_owner_name, marketing_channel: campaign.channel } : {}) }));
        }}><option value="">{empty ? 'Акц холбоогүй' : 'Сонгох'}</option>{options.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}</select>
    </label>;
    async function save(event: FormEvent) {
        event.preventDefault(); setError(''); setSaving(true);
        try {
            const payload = { ...draft };
            for (const key of ['lead_target', 'deal_target', 'budget', 'amount']) if (key in payload) payload[key] = Number(payload[key]);
            if (draft.kind === 'activity') {
                payload.completed_on = draft.status === 'completed' ? draft.completed_on : null;
                payload.external_campaign_id = draft.external_campaign_id || null;
            }
            if (draft.kind === 'spend') payload.note = draft.note || null;
            if (draft.kind === 'attribution') payload.marketing_campaign_id = draft.marketing_campaign_id || null;
            await dashboardMutate('/api/marketing/performance/records', 'POST', payload, { shopId });
            await onSaved(); toast.success('Хадгаллаа'); onClose();
        } catch (e) { setError(e instanceof Error ? e.message : 'Хадгалж чадсангүй'); }
        finally { setSaving(false); }
    }
    async function confirmHandoff() {
        if (!selectedLead) return;
        setConfirming(true); setError('');
        try {
            await dashboardMutate('/api/marketing/performance/records', 'POST', { kind: 'handoff', lead_id: selectedLead.id }, { shopId });
            await Promise.all([leads.refetch(), onSaved()]); toast.success('Өнөөдрийн огноогоор баталгаажууллаа');
        } catch (e) { setError(e instanceof Error ? e.message : 'Баталгаажуулж чадсангүй'); }
        finally { setConfirming(false); }
    }
    return <Dialog open onOpenChange={open => { if (!open && !saving && !confirming) onClose(); }}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto">
            <DialogHeader><DialogTitle>{labels[record.kind]}</DialogTitle><DialogDescription>
                {record.kind === 'target' ? 'Төсөв төгрөгөөр. Ижил сар, төсөл, хариуцагчийн зорилтыг шинэчилнэ.' : 'Энэ бүртгэлээс тайлан автоматаар шинэчлэгдэнэ.'}
            </DialogDescription></DialogHeader>
            <form onSubmit={save} className="grid gap-4">
                <datalist id="marketing-owner-options">{owners.map(n => <option key={n} value={n} />)}</datalist>
                {record.kind === 'attribution' && <>
                    <div className="flex items-end gap-2"><label className="grid flex-1 gap-1.5 text-sm">Лид нэрээр хайх<Input value={search} onChange={e => setSearch(e.target.value)} /></label><Button type="button" variant="secondary" onClick={() => setQuery(search)}>Хайх</Button></div>
                    <p className="text-xs text-muted-foreground">Сүүлийн 30 тохирох лид. Өөр нэрээр хайж нарийвчилна уу.</p>
                    {leads.isError && <p role="alert">Лидийн жагсаалт татаж чадсангүй. <button type="button" className="underline" onClick={() => void leads.refetch()}>Дахин оролдох</button></p>}
                    <label className="grid gap-1.5 text-sm">Лид<select aria-label="Лид" required className={marketingInputClass} value={value('lead_id')} onChange={e => {
                        const lead = leads.data?.leads.find(l => l.id === e.target.value);
                        setDraft(d => ({ ...d, lead_id: e.target.value, project_id: lead?.project_id || '', marketing_campaign_id: lead?.marketing_campaign_id || '', marketing_owner_name: lead?.marketing_owner_name || '', marketing_channel: lead?.marketing_channel || 'other' }));
                    }}><option value="">{leads.isLoading ? 'Уншиж байна…' : 'Лид сонгох'}</option>{leads.data?.leads.map(l => <option key={l.id} value={l.id}>{l.customer_name}</option>)}</select></label>
                    {selectedLead?.sales_manager_name && !selectedLead.sales_handoff_at && <div className="rounded-md border border-border p-3 text-sm">
                        <p>Борлуулалтын менежер: {selectedLead.sales_manager_name}. Хуучин шилжүүлсэн огноо тодорхойгүй.</p>
                        <Button type="button" variant="secondary" size="sm" className="mt-2" isLoading={confirming} onClick={() => void confirmHandoff()}>Sales хүлээн авсныг өнөөдрөөр батлах</Button>
                    </div>}
                </>}
                {(record.kind === 'spend' || record.kind === 'attribution') && select('marketing_campaign_id', 'Акц / контент', activities.filter(a => a.project_id && a.marketing_owner_name && a.channel), record.kind === 'attribution')}
                {record.kind !== 'spend' && <>
                    {select('project_id', 'Төсөл', projects)}
                    {field('marketing_owner_name', 'Маркетингийн хариуцагч')}
                    {record.kind === 'attribution' && <p className="text-xs text-muted-foreground">Акц сонгосон бол төсөл, хариуцагч, суваг нь тэр акцаас хадгалагдана.</p>}
                </>}
                {record.kind === 'activity' && <>
                    {field('name', 'Ажлын нэр')}
                    {select('activity_kind', 'Ажлын төрөл', [{ id: 'campaign', name: 'Акц / кампанит ажил' }, { id: 'content', name: 'Контент' }])}
                    {select('channel', 'Суваг', Object.entries(MARKETING_CHANNELS).map(([id, name]) => ({ id, name })))}
                    {field('external_campaign_id', 'Meta кампанит ажлын ID (заавал биш)', 'text', false)}
                    <p className="text-xs text-muted-foreground">Meta ID-г холбовол энэ ID-тай шинээр ирэх лидийн төсөл, хариуцагч, суваг автоматаар бөглөгдөнө. Өмнөх лидүүд өөрчлөгдөхгүй.</p>
                    {select('status', 'Төлөв', [{ id: 'draft', name: 'Төлөвлөсөн' }, { id: 'active', name: 'Хэрэгжиж байгаа' }, { id: 'paused', name: 'Түр зогссон' }, { id: 'completed', name: 'Дууссан' }, { id: 'cancelled', name: 'Цуцлагдсан' }])}
                    {field('start_date', 'Эхлэх огноо', 'date')}
                    {draft.status === 'completed' && field('completed_on', 'Дууссан огноо', 'date')}
                    <p className="text-xs text-muted-foreground">Хариуцагчийг солиход өмнө холбосон лид, зардлын хариуцагч өөрчлөгдөхгүй.</p>
                </>}
                {record.kind === 'target' && <>
                    {field('month', 'Зорилтын сар', 'month')}
                    <div className="grid grid-cols-2 gap-3">{field('lead_target', 'Lead зорилт', 'number')}{field('deal_target', 'Deal зорилт', 'number')}</div>
                    {field('budget', 'Төлөвлөсөн төсөв (₮)', 'number')}
                </>}
                {record.kind === 'spend' && <>{field('spent_at', 'Зарцуулсан огноо', 'date')}{field('amount', 'Зарцуулсан дүн (₮)', 'number')}{field('note', 'Тайлбар', 'text', false)}</>}
                {record.kind === 'attribution' && select('marketing_channel', 'Маркетингийн суваг', Object.entries(MARKETING_CHANNELS).map(([id, name]) => ({ id, name })))}
                {error && <p role="alert" className="text-sm text-status-danger">{error}</p>}
                <div className="flex justify-end gap-2"><Button type="button" variant="secondary" onClick={onClose} disabled={saving || confirming}>Болих</Button><Button type="submit" isLoading={saving} disabled={confirming}>Хадгалах</Button></div>
            </form>
        </DialogContent>
    </Dialog>;
}

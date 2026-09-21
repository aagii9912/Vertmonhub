'use client';

import { useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Sparkles, Download } from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/dashboard/PageHeader';
import { SectionCard } from '@/components/ui/SectionCard';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';
import { Alert } from '@/components/ui/Alert';
import { useAuth } from '@/contexts/AuthContext';
import { dashboardJson, dashboardFetch } from '@/lib/api/dashboardFetch';
import { openAiPanel } from '@/lib/ai/context';
import { ubDateStr, ubMonthRange, ubParts } from '@/lib/utils/date';
import { MARKETING_CHANNELS, marketingChannel, performanceChange, type MarketingPerformance, type MarketingActivity, type MarketingSpend } from '@/lib/marketing/performance';
import { PerformanceEditor, marketingInputClass, type EditRecord } from '@/components/marketing/PerformanceEditor';
import { MetaSpendSync } from '@/components/marketing/MetaSpendSync';

const number = (v: number | null) => v === null ? '—' : new Intl.NumberFormat('mn-MN', { maximumFractionDigits: 1 }).format(v);
const percent = (v: number | null) => v === null ? '—' : `${number(v)}%`;
const money = (v: number | null) => v === null ? '—' : `${number(v / 1_000_000)} сая`;
function monthRange() { const { year, month } = ubParts(); const r = ubMonthRange(year, month - 1); return { from: ubDateStr(r.start), to: ubDateStr(new Date(r.end.getTime() - 1)) }; }
function Table({ headers, children, minWidth = 640 }: { headers: string[]; children: ReactNode; minWidth?: number }) {
    return <div className="max-w-full overflow-x-auto" tabIndex={0} role="region" aria-label={headers.join(', ')}><table className="w-full text-left text-sm" style={{ minWidth }}>
        <thead className="bg-surface-2 text-xs text-muted-foreground"><tr>{headers.map((h, i) => <th key={`${h}-${i}`} scope="col" className="px-3 py-3 font-medium">{h}</th>)}</tr></thead>
        <tbody className="divide-y divide-border [&_td]:px-3 [&_td]:py-3 [&_td]:align-top [&_td]:tabular-nums">{children}</tbody>
    </table></div>;
}
type Response = { report: MarketingPerformance; projects: { id: string; name: string }[]; activities: MarketingActivity[]; spend: MarketingSpend[] };
export default function MarketingPage() {
    const { shop, user } = useAuth();
    const cache = useQueryClient();
    const [range, setRange] = useState(monthRange);
    const [project, setProject] = useState('');
    const [tab, setTab] = useState<'overview' | 'team' | 'records'>('overview');
    const [editing, setEditing] = useState<EditRecord | null>(null);
    const [exporting, setExporting] = useState(false);
    const params = new URLSearchParams({ ...range, ...(project ? { project } : {}) }).toString();
    const report = useQuery({ queryKey: ['marketing-performance', shop?.id, params], enabled: !!shop?.id,
        queryFn: () => dashboardJson<Response>(`/api/marketing/performance?${params}`, { shopId: shop!.id }), retry: false });
    const canWrite = !!user?.permissions?.canWrite && (user.role === 'super_admin' || user.permissions.modules.includes('marketing-roi'));
    const canLead = canWrite && !!user?.permissions?.modules.includes('leads');
    const canAi = !!user?.permissions?.modules.includes('ai-assistant');
    async function refresh() { await cache.invalidateQueries({ queryKey: ['marketing-performance'] }); }
    async function download() {
        setExporting(true);
        try {
            const res = await dashboardFetch(`/api/marketing/performance/export?${params}`);
            if (!res.ok) throw new Error('Excel татаж чадсангүй');
            const url = URL.createObjectURL(await res.blob());
            const a = document.createElement('a'); a.href = url; a.download = `Marketing-${range.from}-${range.to}.xlsx`; a.click(); URL.revokeObjectURL(url);
        } catch (e) { toast.error(e instanceof Error ? e.message : 'Алдаа'); }
        finally { setExporting(false); }
    }
    const data = report.data;
    const r = data?.report;
    return <div className="min-w-0 space-y-4">
        <PageHeader title="Маркетингийн самбар" subtitle="Акц, контент, Lead, гэрээ болон багийн гүйцэтгэл"
            primaryAction={canWrite && <Button size="sm" onClick={() => setEditing({ kind: 'activity' })}><Plus />Акц / контент нэмэх</Button>}
            secondaryActions={<><Button size="sm" variant="secondary" disabled={!r} isLoading={exporting} onClick={() => void download()}><Download />Excel</Button>
                {canAi && <Button size="sm" variant="secondary" disabled={!r} onClick={() => openAiPanel(`get_marketing_performance ашиглан ${range.from}–${range.to} хугацааны маркетингийн гүйцэтгэлийг${project ? ` project=${project}` : ''} шинжил. Өмнөх хугацаатай харьцуулж, төслүүд болон маркетингийн менежерүүдийн зорилт, биелэлт, төсвийн зөрүүг тайлбарла. Дутуу өгөгдлийг дурд. 3 тодорхой дараагийн ажил санал болго. Шалтгааныг нотолгоогүй таамаглахгүй.`)}><Sparkles />AI дүгнэлт</Button>}</>} />
        <div className="flex flex-wrap items-end gap-3 rounded-lg border border-border bg-surface p-3">
            <label className="grid gap-1 text-xs text-muted-foreground">Эхлэх өдөр<input aria-label="Эхлэх өдөр" className={marketingInputClass} type="date" value={range.from} onChange={e => setRange(v => ({ ...v, from: e.target.value }))} /></label>
            <label className="grid gap-1 text-xs text-muted-foreground">Дуусах өдөр<input aria-label="Дуусах өдөр" className={marketingInputClass} type="date" value={range.to} onChange={e => setRange(v => ({ ...v, to: e.target.value }))} /></label>
            <label className="grid min-w-40 flex-1 gap-1 text-xs text-muted-foreground">Төсөл<select className={marketingInputClass} value={project} onChange={e => setProject(e.target.value)}><option value="">Бүх төсөл</option>{data?.projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
            <Button variant="secondary" size="sm" onClick={() => setRange(monthRange())}>Энэ сар</Button>
            <Button variant="secondary" size="sm" onClick={() => { const today = ubDateStr(); setRange({ from: new Date(Date.parse(`${today}T00:00:00Z`) - 6 * 86400000).toISOString().slice(0, 10), to: today }); }}>Сүүлийн 7 хоног</Button>
        </div>
        <MetaSpendSync shopId={shop?.id} canWrite={canWrite} from={range.from} to={range.to} />
        <nav aria-label="Маркетингийн тайлан" className="flex flex-wrap gap-2 border-b border-border pb-3">
            {([['overview', 'Нэгдсэн самбар'], ['team', 'Багийн гүйцэтгэл'], ['records', 'Бүртгэл']] as const).map(([key, label]) => <Button key={key} variant={tab === key ? 'primary' : 'ghost'} size="sm" aria-pressed={tab === key} onClick={() => setTab(key)}>{label}</Button>)}
        </nav>
        {report.isLoading && <Spinner label="Тайлан уншиж байна…" />}
        {report.isError && <Alert variant="danger">{report.error.message} <Button variant="secondary" size="sm" onClick={() => void report.refetch()}>Дахин оролдох</Button></Alert>}
        {r && data && !report.isError && <>
            {!!(r.spendQuality?.current.missingFx || r.spendQuality?.current.excludedManual || r.spendQuality?.current.unmappedMeta || r.spendQuality?.previous.missingFx) && <Alert variant="warning">Зардлын тулгалт: ханшгүй {r.spendQuality.current.missingFx}, нийтээс хассан гар Meta {r.spendQuality.current.excludedManual}, акцтай холбоогүй Meta {r.spendQuality.current.unmappedMeta} мөр. Өмнөх хугацаанд ханшгүй {r.spendQuality.previous.missingFx} мөр байна. Ханш дутуу бол зардлын нийт ба харьцуулалт бүрэн биш. Бүртгэл хэсгээс шалгана уу.</Alert>}
            <p className="text-xs text-muted-foreground">Харьцуулах хугацаа: {r.previousRange.from} – {r.previousRange.to}. Улаанбаатарын цагаар. {report.isFetching ? 'Шинэчилж байна…' : ''}</p>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                {([{ key: 'activities', label: 'Хэрэгжүүлсэн акц / контент' }, { key: 'leads', label: 'Нийт Lead' }, { key: 'sales', label: 'Sales руу шилжсэн' }, { key: 'deals', label: 'Deal болсон Lead' }] as const).map(({ key, label }) => {
                    const change = performanceChange(r.totals[key], r.previous[key]);
                    return <div key={key} className="rounded-lg border border-border bg-surface p-4"><p className="text-xs text-muted-foreground">{label}</p><p className="my-2 text-3xl font-semibold tabular-nums">{number(r.totals[key])}</p><p className="text-xs text-muted-foreground">{change === null ? 'Өмнөх суурь 0 · хувь тооцоогүй' : `${change > 0 ? '+' : ''}${percent(change)} · өмнөх хугацаанаас`}</p></div>;
                })}
            </div>
            {tab === 'overview' && <>
                <SectionCard title="Төсөл бүрийн маркетингийн гүйцэтгэл">
                    <Table minWidth={1050} headers={['Төсөл', 'Акц / контент', 'Контент', 'Lead', 'Sales', 'Deal', 'Lead → Sales', 'Lead → Deal', ...Object.values(MARKETING_CHANNELS)]}>
                        {r.projects.map(p => <tr key={p.id || 'none'}><td className="font-medium">{p.name}</td><td>{p.activities}</td><td>{p.content}</td><td>{number(p.leads)}</td><td>{number(p.sales)}</td><td>{number(p.deals)}</td><td>{percent(p.salesPct)}</td><td>{percent(p.dealPct)}</td>{p.channels.map(c => <td key={c.channel}>{number(c.count)}</td>)}</tr>)}
                        <tr className="bg-surface-2 font-semibold"><td>Нийт</td><td>{r.totals.activities}</td><td>{r.projects.reduce((s, p) => s + p.content, 0)}</td><td>{number(r.totals.leads)}</td><td>{number(r.totals.sales)}</td><td>{number(r.totals.deals)}</td><td>{percent(r.totals.salesPct)}</td><td>{percent(r.totals.dealPct)}</td>{r.channels.map(c => <td key={c.id}>{number(c.leads)}</td>)}</tr>
                    </Table>
                </SectionCard>
                <div className="grid min-w-0 grid-cols-1 gap-4 xl:grid-cols-2 [&>*]:min-w-0">
                    <SectionCard title="Сувгаар Lead / Sales / Deal">
                        <Table headers={['Суваг', 'Lead', 'Эзлэх хувь', 'Sales', 'Deal', 'Deal %']} minWidth={550}>{r.channels.map(c => <tr key={c.id}><td>{c.name}<div className="mt-2 h-1.5 w-28 rounded bg-surface-2"><div className="h-1.5 rounded bg-brand" style={{ width: `${r.totals.leads ? c.leads / r.totals.leads * 100 : 0}%` }} /></div></td><td>{number(c.leads)}</td><td>{percent(r.totals.leads ? c.leads / r.totals.leads * 100 : null)}</td><td>{number(c.sales)}</td><td>{number(c.deals)}</td><td>{percent(c.dealPct)}</td></tr>)}</Table>
                    </SectionCard>
                    <SectionCard title="Төслийн харьцуулалт" description="Lead · Sales · Deal. Ижил хэмжээсээр харуулав.">
                        <div className="flex gap-4 text-xs"><span className="text-brand">Lead</span><span className="text-status-success">Sales</span><span className="text-status-pending">Deal</span></div>
                        <div className="mt-4 space-y-5">{r.projects.map(p => <div key={p.id || 'none'}><p className="mb-2 text-sm font-medium">{p.name}</p>{(['leads', 'sales', 'deals'] as const).map((key, i) => <div key={key} className="mb-1 flex items-center gap-3"><span className="w-10 text-xs">{['Lead', 'Sales', 'Deal'][i]}</span><div className="h-3 flex-1 rounded bg-surface-2"><div className={`h-3 rounded ${['bg-brand', 'bg-status-success', 'bg-status-pending'][i]}`} style={{ width: `${p[key] / Math.max(1, ...r.projects.map(p => p.leads)) * 100}%` }} /></div><span className="w-12 text-right text-xs tabular-nums">{number(p[key])}</span></div>)}</div>)}</div>
                    </SectionCard>
                </div>
                <SectionCard title="Саяхан хэрэгжүүлсэн акц, контент" description="Lead / Sales / Deal нь дээр сонгосон хугацаанд үүссэн лидүүдийн үр дүн.">
                    {r.recent.length ? <Table headers={['Огноо', 'Төсөл', 'Ажил', 'Суваг', 'Lead', 'Sales', 'Deal']}>{r.recent.map(a => <tr key={a.id}><td>{a.completed_on}</td><td>{a.projectName}</td><td>{a.name}</td><td>{MARKETING_CHANNELS[marketingChannel(a.channel)]}</td><td>{a.leads}</td><td>{a.sales}</td><td>{a.deals}</td></tr>)}</Table> : <p className="py-5 text-sm text-muted-foreground">Энэ хугацаанд дууссан ажил бүртгэгдээгүй. Акц / контент нэмээд дууссан огноог бүртгэнэ үү.</p>}
                </SectionCard>
            </>}
            {tab === 'team' && <SectionCard title="Маркетингийн багийн зорилт ба гүйцэтгэл" description="Төсөв, зардал сая төгрөгөөр. Зорилт бүрэн сарын сонголтод харагдана.">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2"><p className="text-xs text-muted-foreground">— = зорилт эсвэл тооцох суурь алга. Бүх мөрийн зорилт бүрэн үед нийт биелэлт бодогдоно. Хэтрэлт эерэг, хэмнэлт сөрөг.</p>{canWrite && <Button size="sm" onClick={() => setEditing({ kind: 'target', month: `${range.from.slice(0, 7)}-01` })}>Зорилт / төсөв тохируулах</Button>}</div>
                {!r.fullMonth && <Alert>Сарын зорилтын биелэлт харахдаа сарын эхний өдрөөс сүүлийн өдөр хүртэл сонгоно уу.</Alert>}
                <Table minWidth={1300} headers={['Менежер / төсөл', 'Төлөвлөгөө %', 'Lead зорилт', 'Бодит Lead', 'Lead биелэлт', 'Deal зорилт', 'Бодит Deal', 'Deal биелэлт', 'Төсөв', 'Зарцуулалт', 'Зөрүү', 'Зөрүү %', 'Өмнөх хугацаа / өөрчлөлт', '']}>
                    {r.team.map(t => <tr key={t.id}><td><p className="font-medium">{t.name}</p><p className="mt-1 text-xs text-muted-foreground">{t.projectName}</p></td><td>{percent(t.planPct)}</td><td>{number(t.target?.lead_target ?? null)}</td><td>{t.leads}</td><td>{percent(t.leadAttainment)}</td><td>{number(t.target?.deal_target ?? null)}</td><td>{t.deals}</td><td>{percent(t.dealAttainment)}</td><td>{money(t.budget)}</td><td>{money(t.spend)}</td><td className={t.variance !== null && t.variance > 0 ? 'text-status-danger' : ''}>{money(t.variance)}</td><td>{percent(t.variancePct)}</td><td className="whitespace-nowrap text-xs"><p>Lead: {t.previousLeads} / {percent(t.leadChange)}</p><p>Deal: {t.previousDeals} / {percent(t.dealChange)}</p><p>Зардал: {money(t.previousSpend)} / {percent(t.spendChange)}</p></td><td>{canWrite && t.project_id && t.marketing_owner_name && <Button size="sm" variant="ghost" onClick={() => setEditing({ kind: 'target', id: t.target?.id, project_id: t.project_id, marketing_owner_name: t.marketing_owner_name, month: `${range.from.slice(0, 7)}-01`, lead_target: t.target?.lead_target ?? 0, deal_target: t.target?.deal_target ?? 0, budget: t.budget ?? 0 })}>Тохируулах</Button>}</td></tr>)}
                    <tr className="bg-surface-2 font-semibold"><td>Нийт</td><td>{percent(r.teamTotal.planPct)}</td><td>{number(r.teamTotal.leadTarget)}</td><td>{r.teamTotal.leads}</td><td>{percent(r.teamTotal.leadAttainment)}</td><td>{number(r.teamTotal.dealTarget)}</td><td>{r.teamTotal.deals}</td><td>{percent(r.teamTotal.dealAttainment)}</td><td>{money(r.teamTotal.budget)}</td><td>{money(r.teamTotal.spend)}</td><td>{money(r.teamTotal.variance)}</td><td>{percent(r.teamTotal.variancePct)}</td><td>{r.teamTotal.previousLeads} / {percent(r.teamTotal.leadChange)}</td><td /></tr>
                </Table>{!r.team.length && <p className="py-5 text-sm text-muted-foreground">Зорилт, хариуцагчийн бүртгэл алга. Сарын зорилт, төсвөө эхэлж тохируулна уу.</p>}
            </SectionCard>}
            {tab === 'records' && <>
                <div className="flex flex-wrap gap-2">{canWrite && <Button variant="secondary" size="sm" onClick={() => setEditing({ kind: 'spend' })}>Зардал нэмэх</Button>}{canLead && <Button variant="secondary" size="sm" onClick={() => setEditing({ kind: 'attribution' })}>Лидийн эх үүсвэр холбох</Button>}<Button href="/dashboard/leads" variant="secondary" size="sm">Лидүүд / менежерт хуваарилах</Button></div>
                <SectionCard title="Акц, контентын бүртгэл" description="Бүх хугацааны ажил. Хариуцагчийн нэрийг зорилттой ижил бичнэ үү."><Table headers={['Ажил', 'Төсөл', 'Хариуцагч', 'Эхлэх', 'Дууссан', 'Төлөв', '']}>
                    {data.activities.filter(a => !project || a.project_id === project).map(a => <tr key={a.id}><td>{a.name}</td><td>{data.projects.find(p => p.id === a.project_id)?.name || '—'}</td><td>{a.marketing_owner_name || '—'}</td><td>{a.start_date || '—'}</td><td>{a.completed_on || '—'}</td><td>{({ draft: 'Төлөвлөсөн', active: 'Хэрэгжиж байгаа', paused: 'Түр зогссон', completed: 'Дууссан', cancelled: 'Цуцлагдсан' } as Record<string, string>)[a.status] || a.status}</td><td>{canWrite && <Button variant="ghost" size="sm" onClick={() => setEditing({ ...a, kind: 'activity' })}>Засах</Button>}</td></tr>)}
                </Table></SectionCard>
                <SectionCard title="Сонгосон хугацааны зардал" description="Meta автомат болон гар бүртгэл. Ханшгүй, давхардсан гар Meta мөрүүд нийтэд орохгүй."><Table headers={['Огноо', 'Төсөл', 'Хариуцагч', 'Зардал (₮)', 'Тайлбар', '']}>
                    {data.spend.map(s => <tr key={s.id}><td>{s.spent_at}</td><td>{data.projects.find(p => p.id === s.project_id)?.name || 'Холбоогүй'}</td><td>{s.marketing_owner_name || 'Холбоогүй'}</td><td>{s.exclusion ? 'Нийтэд ороогүй' : number(Number(s.amount))}{s.source === 'meta' && <p className="text-xs text-muted-foreground">{s.native_amount} {s.currency} · автомат</p>}</td><td>{s.note}{s.exclusion && <p className="text-xs text-status-pending">{s.exclusion === 'missing_fx' ? 'Ханш оруулна уу' : 'Автомат дүнтэй давхцаж болзошгүй гар Meta'}</p>}</td><td>{canWrite && s.source !== 'meta' && <Button variant="ghost" size="sm" onClick={() => setEditing({ ...s, kind: 'spend' })}>Засах</Button>}</td></tr>)}
                </Table></SectionCard>
            </>}
            <SectionCard title="Бүртгэлийн бүрэн байдал" description="Эдгээрийг нөхөхөд тайлангийн задаргаа илүү бүрэн болно. Ангиллууд давхцаж болно.">
                <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm"><span>Төсөлгүй Lead: <b>{r.quality.noProject}</b></span><span>Акцгүй Lead: <b>{r.quality.noCampaign}</b></span><span>Хариуцагчгүй Lead: <b>{r.quality.noOwner}</b></span><span>Sales огноо тодорхойгүй: <b>{r.quality.unknownHandoff}</b></span><span>Дууссан огноогүй ажил (бүх хугацааны): <b>{r.quality.undatedCompletedActivities}</b></span><span>Лидгүй гэрээ (байгууллагын хугацааны нийт): <b>{r.quality.unlinkedContracts}</b></span></div>
                {canLead && <Button className="mt-3" size="sm" variant="secondary" onClick={() => setEditing({ kind: 'attribution' })}>Лидийн холбоос нөхөх</Button>}
            </SectionCard>
            <details className="rounded-lg border border-border p-3 text-xs text-muted-foreground"><summary className="cursor-pointer font-medium">Тооцох дүрэм</summary><p className="mt-3 leading-relaxed">{r.basis}</p><p className="mt-2">Одоо цуцалсан / устгасан бүртгэл тайланд орохгүй. Энэ сарын бүтэн хугацааг өмнөх бүтэн сартай харьцуулж байгаа бол сар хараахан дуусаагүйг тооцож тайлбарлана.</p></details>
        </>}
        <div className="flex flex-wrap gap-4 border-t border-border pt-3 text-xs text-muted-foreground">{[['/marketing/ads', 'Зар сурталчилгаа'], ['/marketing/social', 'Сошиал медиа'], ['/marketing/calendar', 'Контент календарь'], ['/marketing/budget', 'Байгууллагын төсөв'], ['/marketing/sources', 'Сувгийн гэрээ']].map(([href, label]) => <Link key={href} href={href} className="hover:text-brand hover:underline">{label}</Link>)}</div>
        {editing && shop && data && <PerformanceEditor key={`${shop.id}-${editing.kind}-${editing.id || ''}`} record={editing} projects={data.projects} activities={data.activities} shopId={shop.id} onClose={() => setEditing(null)} onSaved={refresh} />}
    </div>;
}

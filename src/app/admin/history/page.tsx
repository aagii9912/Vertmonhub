'use client';

import { useState } from 'react';
import Link from 'next/link';
import type { UseQueryResult } from '@tanstack/react-query';
import { History, Loader2, RefreshCw, UserSearch } from 'lucide-react';
import { PageHeader } from '@/components/dashboard/PageHeader';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { StatusPill } from '@/components/ui/StatusPill';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/Select';
import { useAuth } from '@/contexts/AuthContext';
import { useDashboardQuery } from '@/hooks/useDashboardQuery';
import { shiftDate } from '@/lib/sales/activity';
import { formatShortDate, formatTime, ubDateStr } from '@/lib/utils/date';
import {
    ACTIVITY_FEED_DEFAULT_DAYS, ACTIVITY_FEED_LIMIT, ACTIVITY_SOURCE_LABEL, NAME_SOURCE_LABEL, NAME_SOURCES,
    type ActivityFeed, type ActivityFeedItem, type ActivityFeedSource, type ActivityFeedUser, type NameCounts,
    type NameMismatchReport, type RosterNameRow,
} from '@/lib/admin/activity-feed';

const ALL = '__all';
const ROLE_LABEL: Record<string, string> = {
    super_admin: 'Super Admin', admin: 'Админ', marketing: 'Маркетинг', sales_manager: 'Борлуулалтын менежер', viewer: 'Харах эрх',
};
const SOURCE_TONE: Record<ActivityFeedSource, 'brand' | 'info' | 'neutral'> = { daily_report: 'brand', audit: 'info', lead: 'neutral' };
const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Улаанбаатарын цагаар «2026-10-18 14:32». */
const when = (value: string) => `${formatShortDate(value)} ${formatTime(value)}`;
const total = (counts: NameCounts) => NAME_SOURCES.reduce((sum, source) => sum + (counts[source] ?? 0), 0);
const countsTitle = (counts: NameCounts) => NAME_SOURCES.filter(source => counts[source]).map(source => `${NAME_SOURCE_LABEL[source]}: ${counts[source]}`).join(', ');

function userLabel(user: ActivityFeedUser): string {
    const managers = user.managers.map(manager => manager.name).filter(name => name !== user.name);
    const role = user.role ? ROLE_LABEL[user.role] ?? user.role : null;
    return [user.name, managers.length ? `бүртгэл: ${managers.join(', ')}` : null, role, user.member ? null : 'гишүүн биш'].filter(Boolean).join(' · ');
}

export default function AdminHistoryPage() {
    const { shop, user } = useAuth();
    // Төсөл солиход хэрэглэгчийн шүүлтүүрийг авч үлдэхгүй.
    return <HistoryView key={`${shop?.id}:${user?.id}`} />;
}

function HistoryView() {
    const { shop } = useAuth();
    const today = ubDateStr();
    const [from, setFrom] = useState(() => shiftDate(today, -(ACTIVITY_FEED_DEFAULT_DAYS - 1)));
    const [to, setTo] = useState(today);
    const [userId, setUserId] = useState(ALL);
    const [source, setSource] = useState<ActivityFeedSource | typeof ALL>(ALL);

    const rangeValid = DATE.test(from) && DATE.test(to) && from <= to;
    const params = new URLSearchParams({ from, to });
    if (userId !== ALL) params.set('user', userId);
    const feed = useDashboardQuery<ActivityFeed>(['admin-history'], rangeValid ? `/api/admin/history?${params}` : null, { keepPreviousData: true });
    const names = useDashboardQuery<NameMismatchReport>(['admin-history-names'], '/api/admin/history/names');

    const data = feed.data;
    const users = data?.users ?? [];
    const items = (data?.items ?? []).filter(item => source === ALL || item.source === source);

    return (
        <div className="mx-auto max-w-6xl space-y-6">
            <PageHeader
                title="Өөрчлөлтийн түүх"
                subtitle={`${shop?.name ? `${shop.name}: ` : ''}өдрийн тайлан, лид, харилцагч, гэрээн дээр хэн, хэзээ, юуг өөрчилсөн. Буруу нэрээр орсон бичлэгийг эндээс олно.`}
                secondaryActions={(
                    <Button variant="secondary" size="sm" onClick={() => { void feed.refetch(); void names.refetch(); }} disabled={feed.isFetching || names.isFetching}>
                        <RefreshCw className={feed.isFetching ? 'animate-spin' : undefined} /> Шинэчлэх
                    </Button>
                )}
            />

            <section aria-labelledby="history-title" className="rounded-xl border border-border bg-surface">
                <div className="flex flex-wrap items-end gap-3 border-b border-border p-4">
                    <h2 id="history-title" className="sr-only">Өөрчлөлтүүд</h2>
                    <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                        Хэрэглэгч
                        <Select value={userId} onValueChange={setUserId}>
                            <SelectTrigger className="h-9 w-72 text-sm" aria-label="Хэрэглэгч сонгох">
                                <SelectValue placeholder="Бүх хэрэглэгч" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value={ALL}>Бүх хэрэглэгч</SelectItem>
                                {users.map(entry => <SelectItem key={entry.id} value={entry.id}>{userLabel(entry)}</SelectItem>)}
                            </SelectContent>
                        </Select>
                    </label>
                    <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                        Эх сурвалж
                        <Select value={source} onValueChange={value => setSource(value as ActivityFeedSource | typeof ALL)}>
                            <SelectTrigger className="h-9 w-44 text-sm" aria-label="Эх сурвалж сонгох">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value={ALL}>Бүгд</SelectItem>
                                {(Object.keys(ACTIVITY_SOURCE_LABEL) as ActivityFeedSource[]).map(key => (
                                    <SelectItem key={key} value={key}>{ACTIVITY_SOURCE_LABEL[key]}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </label>
                    <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                        Эхлэх
                        <Input type="date" value={from} max={to || today} onChange={event => setFrom(event.target.value)} className="num h-9 w-40" />
                    </label>
                    <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                        Дуусах
                        <Input type="date" value={to} min={from} max={today} onChange={event => setTo(event.target.value)} className="num h-9 w-40" />
                    </label>
                    {userId !== ALL && (
                        <Button variant="ghost" size="sm" onClick={() => setUserId(ALL)}>Шүүлтүүр арилгах</Button>
                    )}
                </div>

                <div className="space-y-3 p-4">
                    {!rangeValid && <Alert variant="warning">Эхлэх, дуусах огноог зөв сонгоно уу (хамгийн ихдээ 92 хоног).</Alert>}
                    {feed.error && <Alert variant="danger">{feed.error.message}</Alert>}
                    {data?.unavailable.includes('daily_report') && (
                        <Alert variant="info">Өдрийн тайлангийн өөрчлөлтийн түүх хараахан идэвхжээгүй байна (migration). Бусад түүх харагдаж байна.</Alert>
                    )}
                    {data?.truncated && <Alert variant="warning">Сүүлийн {ACTIVITY_FEED_LIMIT} өөрчлөлт харагдаж байна. Хугацаагаа богиносгох эсвэл хэрэглэгчээр шүүнэ үү.</Alert>}

                    {feed.isPending && rangeValid ? (
                        <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-brand-strong" aria-label="Ачаалж байна" /></div>
                    ) : data && items.length === 0 ? (
                        <p className="py-10 text-center text-sm text-muted-foreground">Энэ хугацаанд өөрчлөлт алга.</p>
                    ) : data && (
                        <FeedTable items={items} onUser={setUserId} activeUser={userId} />
                    )}
                </div>
            </section>

            <NamesSection query={names} />
        </div>
    );
}

function FeedTable({ items, onUser, activeUser }: { items: ActivityFeedItem[]; onUser: (id: string) => void; activeUser: string }) {
    return (
        <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
                <caption className="sr-only">Өөрчлөлтийн түүх, шинэ нь эхэнд</caption>
                <thead>
                    <tr className="border-b border-border text-left text-xs text-muted-foreground">
                        <th scope="col" className="py-2 pr-3 font-medium">Цаг</th>
                        <th scope="col" className="py-2 pr-3 font-medium">Хэрэглэгч</th>
                        <th scope="col" className="py-2 pr-3 font-medium">Эх сурвалж</th>
                        <th scope="col" className="py-2 pr-3 font-medium">Өөрчлөлт</th>
                        <th scope="col" className="py-2 font-medium"><span className="sr-only">Холбоос</span></th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-border">
                    {items.map(item => (
                        <tr key={item.id} className="align-top">
                            <td className="num whitespace-nowrap py-2 pr-3 text-muted-foreground">{when(item.at)}</td>
                            <td className="py-2 pr-3">
                                {item.byUserId && item.byUserId !== activeUser ? (
                                    <button type="button" onClick={() => onUser(item.byUserId!)} title="Зөвхөн энэ хэрэглэгчийн түүх"
                                        className="inline-flex items-center gap-1 text-left text-foreground hover:text-brand-strong">
                                        {item.by ?? 'Нэргүй'} <UserSearch className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
                                    </button>
                                ) : <span className="text-foreground">{item.by ?? '—'}</span>}
                            </td>
                            <td className="py-2 pr-3"><StatusPill variant={SOURCE_TONE[item.source]}>{ACTIVITY_SOURCE_LABEL[item.source]}</StatusPill></td>
                            <td className="py-2 pr-3">
                                <p className="text-foreground">{item.summary}</p>
                                {item.detail && <p className="mt-0.5 break-words text-xs text-muted-foreground">{item.detail}</p>}
                                {item.reportDate && <p className="num mt-0.5 text-xs text-muted-foreground">Тайлангийн өдөр: {item.reportDate}</p>}
                            </td>
                            <td className="whitespace-nowrap py-2 text-xs">
                                {item.href && (
                                    <Link href={item.href} className="font-medium text-brand-strong hover:underline">
                                        {item.source === 'daily_report' ? 'Өдрийн тайлан' : 'Лид нээх'}
                                    </Link>
                                )}
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

function rosterFlags(row: RosterNameRow): Array<{ label: string; variant: 'danger' | 'pending' | 'info' | 'neutral'; title: string }> {
    const flags: Array<{ label: string; variant: 'danger' | 'pending' | 'info' | 'neutral'; title: string }> = [];
    if (row.flags.sharedAccount) flags.push({ label: 'Нэг акаунт олон бүртгэлд', variant: 'danger', title: 'Ийм үед систем менежерийн нэрийг танихгүй, профайлын нэрээр бичнэ.' });
    if (row.flags.noProject) flags.push({ label: 'Төсөлгүй', variant: 'pending', title: 'Төсөлд бүртгэгдээгүй менежер өдрийн тайлан, лидээ харахгүй.' });
    if (row.flags.inactiveButLinked) flags.push({ label: 'Идэвхгүй ч холбоотой', variant: 'pending', title: 'Идэвхгүй бүртгэлд акаунт холбоотой хэвээр байна.' });
    if (row.isActive && !row.linked) flags.push({ label: 'Акаунт холбоогүй', variant: 'neutral', title: 'Менежер өөрийн нэрээр нэвтэрч ажиллахгүй.' });
    if (row.flags.profileDiffers) flags.push({ label: 'Профайлын нэр өөр', variant: 'info', title: `Профайл: ${row.profileName}. Тайлан бүртгэлийн нэрээр танина (мэдээлэл).` });
    return flags;
}

function NamesSection({ query }: { query: UseQueryResult<NameMismatchReport> }) {
    const report = query.data;
    return (
        <section aria-labelledby="names-title" className="rounded-xl border border-border bg-surface">
            <div className="flex items-start gap-3 border-b border-border p-4">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-soft text-brand-strong"><History className="h-4 w-4" /></span>
                <div className="min-w-0">
                    <h2 id="names-title" className="font-semibold text-foreground">Нэрийн зөрүү</h2>
                    <p className="mt-1 text-sm text-muted-foreground">
                        Тайлан, KPI менежерийг бүртгэлийн нэрээр нь танина. Бүртгэлд байхгүй нэрээр орсон бичлэгийг{' '}
                        <Link href="/admin/sales-targets" className="font-medium text-brand-strong hover:underline">Төлөвлөгөө ба баг</Link>{' '}
                        хэсэгт зөв менежерт холбоно уу.
                    </p>
                </div>
            </div>
            <div className="space-y-5 p-4">
                {query.error && <Alert variant="danger">{query.error.message}</Alert>}
                {query.isPending ? (
                    <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-brand-strong" aria-label="Ачаалж байна" /></div>
                ) : report && <>
                    {report.unavailable.length > 0 && (
                        <Alert variant="info">Уншаагүй эх сурвалж: {report.unavailable.map(source => NAME_SOURCE_LABEL[source]).join(', ')} (хүснэгт хараахан үүсээгүй).</Alert>
                    )}
                    <div>
                        <h3 className="mb-2 text-sm font-semibold text-foreground">Бүртгэлд байхгүй нэр</h3>
                        {report.unknown.length === 0 ? (
                            <p className="text-sm text-status-success">Бүх бичлэг бүртгэлийн нэрээр орсон байна.</p>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="w-full min-w-[720px] text-sm">
                                    <caption className="sr-only">Бүртгэлд байхгүй менежерийн нэр, эх сурвалжаар</caption>
                                    <thead>
                                        <tr className="border-b border-border text-left text-xs text-muted-foreground">
                                            <th scope="col" className="py-2 pr-3 font-medium">Өгөгдөл дэх нэр</th>
                                            {NAME_SOURCES.map(source => <th key={source} scope="col" className="py-2 pr-3 text-right font-medium">{NAME_SOURCE_LABEL[source]}</th>)}
                                            <th scope="col" className="py-2 font-medium">Ойролцоо бүртгэл</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-border">
                                        {report.unknown.map(row => (
                                            <tr key={row.name}>
                                                <td className="py-2 pr-3 font-medium text-foreground">{row.name.trim() === row.name ? row.name : `«${row.name}»`}</td>
                                                {NAME_SOURCES.map(source => <td key={source} className="num py-2 pr-3 text-right text-foreground">{row.counts[source] ?? '—'}</td>)}
                                                <td className="py-2 text-muted-foreground">{row.similar.length ? row.similar.join(', ') : '—'}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                    <div>
                        <h3 className="mb-2 text-sm font-semibold text-foreground">Менежерийн бүртгэл</h3>
                        {report.roster.length === 0 ? (
                            <p className="text-sm text-muted-foreground">Энэ төсөлд менежер бүртгэгдээгүй байна.</p>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="w-full min-w-[760px] text-sm">
                                    <caption className="sr-only">Менежерийн бүртгэл, холбосон акаунт, анхааруулга</caption>
                                    <thead>
                                        <tr className="border-b border-border text-left text-xs text-muted-foreground">
                                            <th scope="col" className="py-2 pr-3 font-medium">Бүртгэлийн нэр</th>
                                            <th scope="col" className="py-2 pr-3 font-medium">Төлөв</th>
                                            <th scope="col" className="py-2 pr-3 font-medium">Холбосон акаунт</th>
                                            <th scope="col" className="py-2 pr-3 text-right font-medium">Төсөл</th>
                                            <th scope="col" className="py-2 pr-3 text-right font-medium">Бичлэг</th>
                                            <th scope="col" className="py-2 font-medium">Анхааруулга</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-border">
                                        {report.roster.map(row => (
                                            <tr key={row.name} className="align-top">
                                                <td className="py-2 pr-3 font-medium text-foreground">{row.name}</td>
                                                <td className="py-2 pr-3">
                                                    <StatusPill variant={row.isActive ? 'success' : 'neutral'}>{row.isActive ? 'Идэвхтэй' : 'Идэвхгүй'}</StatusPill>
                                                </td>
                                                <td className="py-2 pr-3">
                                                    {row.linked ? (
                                                        <>
                                                            <p className="text-foreground">{row.profileName ?? '—'}</p>
                                                            {row.email && <p className="text-xs text-muted-foreground">{row.email}</p>}
                                                        </>
                                                    ) : <span className="text-muted-foreground">Холбоогүй</span>}
                                                </td>
                                                <td className="num py-2 pr-3 text-right text-foreground">{row.projects}</td>
                                                <td className="num py-2 pr-3 text-right text-foreground" title={countsTitle(row.counts) || undefined}>{total(row.counts)}</td>
                                                <td className="py-2">
                                                    <div className="flex flex-wrap gap-1.5">
                                                        {rosterFlags(row).map(flag => <StatusPill key={flag.label} variant={flag.variant} title={flag.title}>{flag.label}</StatusPill>)}
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                </>}
            </div>
        </section>
    );
}
